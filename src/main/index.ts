import { app, BrowserWindow, Menu, Tray } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { registerIpc } from './ipc'
import { createCcusageRunner } from './services/runCcusage'
import { UsageDashboardService } from './services/usageDashboardService'
import { createTrayIcon } from './trayIcon'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function revealWindow(window: BrowserWindow) {
  if (process.platform === 'darwin') {
    app.focus({ steal: true })
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  if (window.isMinimized()) {
    window.restore()
  }

  window.setAlwaysOnTop(true, 'screen-saver')
  window.show()
  window.focus()
  window.moveTop()

  setTimeout(() => {
    if (window.isDestroyed()) {
      return
    }

    window.setAlwaysOnTop(false)

    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true })
    }
  }, 180)
}

function createWindow() {
  const window = new BrowserWindow({
    width: 840,
    height: 760,
    minWidth: 720,
    minHeight: 700,
    show: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f3ede2',
    vibrancy: 'sidebar',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  window.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    window.hide()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return window
}

function toggleWindow() {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }

  revealWindow(mainWindow)
}

async function bootstrap() {
  const service = new UsageDashboardService({
    cachePath: path.join(app.getPath('userData'), 'usage-cache.json'),
    mirrorRoot: path.join(app.getPath('userData'), 'codex-home-mirror'),
    runner: createCcusageRunner(app.getAppPath()),
  })

  registerIpc(service)
  mainWindow = createWindow()
  revealWindow(mainWindow)
  tray = new Tray(createTrayIcon())

  tray.setToolTip('Codex Pulse')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Codex Pulse', click: () => toggleWindow() },
      { label: 'Refresh Usage', click: () => void service.refreshDashboard() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => toggleWindow())

  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  void service.loadDashboard()
}

app.on('before-quit', () => {
  isQuitting = true
})

app.whenReady().then(bootstrap)

app.on('activate', () => {
  if (!mainWindow) {
    return
  }

  revealWindow(mainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
