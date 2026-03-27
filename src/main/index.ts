import { app, BrowserWindow, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DashboardResponse } from "../shared/usage";

import { registerIpc } from "./ipc";
import { createCcusageRunner } from "./services/runCcusage";
import {
  DASHBOARD_REFRESH_INTERVAL_MS,
  UsageDashboardService,
} from "./services/usageDashboardService";
import { createAppIcon, createTrayIcon } from "./trayIcon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let refreshTimer: NodeJS.Timeout | null = null;

const DEFAULT_TRAY_TITLE = "100%";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function revealWindow(window: BrowserWindow) {
  if (window.isMinimized()) {
    window.restore();
  }

  window.setAlwaysOnTop(true, "screen-saver");
  window.show();
  window.focus();
  window.moveTop();

  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }

  window.focus();
  window.moveTop();

  setTimeout(() => {
    if (window.isDestroyed()) {
      return;
    }

    window.setAlwaysOnTop(false);
  }, 220);
}

function hideWindow(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return;
  }

  window.hide();
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 100;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 100) {
    return 100;
  }

  return value;
}

function getTrayTitle(response: DashboardResponse) {
  const remainingPercent =
    response.snapshot?.codexWeeklyLimit?.remainingPercent;

  if (remainingPercent == null) {
    return DEFAULT_TRAY_TITLE;
  }

  return `${Math.round(clampPercent(remainingPercent))}%`;
}

function updateTrayTitle(response?: DashboardResponse) {
  if (!tray || process.platform !== "darwin") {
    return;
  }

  tray.setTitle(response ? getTrayTitle(response) : DEFAULT_TRAY_TITLE, {
    fontType: "monospacedDigit",
  });
}

function createWindow() {
  const appIcon = createAppIcon();
  const window = new BrowserWindow({
    width: 840,
    height: 760,
    minWidth: 720,
    minHeight: 700,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f3ede2",
    vibrancy: "sidebar",
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "Escape") {
      return;
    }

    event.preventDefault();
    hideWindow(window);
  });

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    hideWindow(window);
  });

  window.once("ready-to-show", () => {
    revealWindow(window);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return window;
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }

  revealWindow(mainWindow);
}

function toggleMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isVisible()) {
    hideWindow(mainWindow);
    return;
  }

  revealWindow(mainWindow);
}

async function bootstrap() {
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }

  const appIcon = createAppIcon();

  if (process.platform === "darwin" && app.dock && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }

  const service = new UsageDashboardService({
    cachePath: path.join(app.getPath("userData"), "usage-cache.json"),
    mirrorRoot: path.join(app.getPath("userData"), "codex-home-mirror"),
    runner: createCcusageRunner(app.getAppPath()),
  });

  registerIpc(service);
  tray = new Tray(createTrayIcon());
  updateTrayTitle();
  tray.on("click", () => toggleMainWindow());

  service.subscribe((response: DashboardResponse) => {
    updateTrayTitle(response);
  });

  refreshTimer = setInterval(() => {
    void service.refreshDashboard();
  }, DASHBOARD_REFRESH_INTERVAL_MS);

  mainWindow = createWindow();

  void service.loadDashboard();
}

app.on("before-quit", () => {
  isQuitting = true;

  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});

app.whenReady().then(bootstrap);

app.on("second-instance", () => {
  showMainWindow();
});

app.on("activate", () => {
  if (!mainWindow) {
    return;
  }

  showMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
