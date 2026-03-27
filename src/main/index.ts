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
let mainWindowPhase: "hidden" | "showing" | "shown" | "hiding" = "hidden";
let mainWindowDesiredVisible = false;

const DEFAULT_TRAY_TITLE = "100%";

const hasSingleInstanceLock = app.requestSingleInstanceLock();

function configureMacWindow(window: BrowserWindow) {
  if (process.platform !== "darwin") {
    return;
  }

  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  window.setHiddenInMissionControl(false);
  window.setSkipTaskbar(true);
}

function revealWindow(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  if (process.platform === "darwin") {
    window.setAlwaysOnTop(true, "screen-saver");
    window.showInactive();
    window.moveTop();
    return;
  }

  window.setAlwaysOnTop(true, "screen-saver");
  window.show();
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

  window.setAlwaysOnTop(false);
  window.hide();
}

function syncMainWindowVisibility(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return;
  }

  if (mainWindowDesiredVisible) {
    if (mainWindowPhase === "shown" || mainWindowPhase === "showing") {
      return;
    }

    if (mainWindowPhase === "hiding") {
      return;
    }

    mainWindowPhase = "showing";
    revealWindow(window);
    return;
  }

  if (mainWindowPhase === "hidden" || mainWindowPhase === "hiding") {
    return;
  }

  mainWindowPhase = "hiding";
  hideWindow(window);
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
    skipTaskbar: process.platform === "darwin",
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

  configureMacWindow(window);

  window.on("show", () => {
    mainWindowPhase = "shown";

    if (!mainWindowDesiredVisible) {
      syncMainWindowVisibility(window);
    }
  });

  window.on("hide", () => {
    mainWindowPhase = "hidden";

    if (mainWindowDesiredVisible) {
      syncMainWindowVisibility(window);
    }
  });

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "Escape") {
      return;
    }

    event.preventDefault();
    mainWindowDesiredVisible = false;
    syncMainWindowVisibility(window);
  });

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindowDesiredVisible = false;
    syncMainWindowVisibility(window);
  });

  window.once("ready-to-show", () => {
    mainWindowDesiredVisible = true;
    syncMainWindowVisibility(window);
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

  mainWindowDesiredVisible = true;
  syncMainWindowVisibility(mainWindow);
}

function toggleMainWindow() {
  if (!mainWindow) {
    return;
  }

  mainWindowDesiredVisible = !mainWindowDesiredVisible;
  syncMainWindowVisibility(mainWindow);
}

async function bootstrap() {
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }

  if (process.platform === "darwin") {
    app.setActivationPolicy("accessory");
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

  void service.loadDashboard().then((response) => {
    updateTrayTitle(response);
  });
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
