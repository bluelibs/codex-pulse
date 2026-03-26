import { contextBridge, ipcRenderer } from 'electron'

import type { CodexPulseApi, DashboardListener, DashboardResponse } from '@shared/usage'

const api: CodexPulseApi = {
  getCachedDashboard: () => ipcRenderer.invoke('dashboard:cached') as Promise<DashboardResponse>,
  loadDashboard: () => ipcRenderer.invoke('dashboard:load') as Promise<DashboardResponse>,
  refreshDashboard: () => ipcRenderer.invoke('dashboard:refresh') as Promise<DashboardResponse>,
  onDashboardUpdated: (listener: DashboardListener) => {
    const handler = (_event: unknown, payload: DashboardResponse) => {
      listener(payload)
    }

    ipcRenderer.on('dashboard:updated', handler)

    return () => {
      ipcRenderer.removeListener('dashboard:updated', handler)
    }
  },
}

contextBridge.exposeInMainWorld('codexPulse', api)
