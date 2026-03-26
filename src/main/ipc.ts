import { BrowserWindow, ipcMain } from 'electron'

import { UsageDashboardService } from './services/usageDashboardService'

export function registerIpc(service: UsageDashboardService) {
  ipcMain.handle('dashboard:cached', () => service.getCachedDashboard())
  ipcMain.handle('dashboard:load', () => service.loadDashboard())
  ipcMain.handle('dashboard:refresh', () => service.refreshDashboard())

  return service.subscribe((response) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('dashboard:updated', response)
    }
  })
}
