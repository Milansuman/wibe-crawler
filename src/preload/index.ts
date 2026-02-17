import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
    onState: (callback: (state: { isMaximized: boolean; isMinimized: boolean }) => void) => {
      ipcRenderer.on('window-state', (_, data) => callback(data))
    },
    getState: async (): Promise<{ isMaximized: boolean; isMinimized: boolean }> => {
      return await ipcRenderer.invoke('window-get-state')
    }
  },
  crawler: {
    startCrawl: (url: string, context?: any) => ipcRenderer.invoke('start-crawl', url, context),
    stopCrawl: () => ipcRenderer.invoke('stop-crawl'),
    submitForm: (formData: any) => ipcRenderer.invoke('submit-form', formData),
    onProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('crawl-progress', (_, data) => callback(data))
    },
    onComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('crawl-complete', (_, data) => callback(data))
    },
    onError: (callback: (data: any) => void) => {
      ipcRenderer.on('crawl-error', (_, data) => callback(data))
    },
    onUrlsDiscovered: (callback: (data: any) => void) => {
      ipcRenderer.on('urls-discovered', (_, data) => callback(data))
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('crawl-progress')
      ipcRenderer.removeAllListeners('crawl-complete')
      ipcRenderer.removeAllListeners('crawl-error')
      ipcRenderer.removeAllListeners('urls-discovered')
    }
  },
  fuzzer: {
    getWordlists: () => ipcRenderer.invoke('get-wordlists'),
    startFuzz: (options: any) => ipcRenderer.invoke('start-fuzz', options),
    stopFuzz: () => ipcRenderer.invoke('stop-fuzz'),
    onProgress: (callback: (data: any) => void) => {
      ipcRenderer.on('fuzz-progress', (_, data) => callback(data))
    },
    onComplete: (callback: (data: any) => void) => {
      ipcRenderer.on('fuzz-complete', (_, data) => callback(data))
    },
    onStopped: (callback: () => void) => {
      ipcRenderer.on('fuzz-stopped', () => callback())
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('fuzz-progress')
      ipcRenderer.removeAllListeners('fuzz-complete')
      ipcRenderer.removeAllListeners('fuzz-stopped')
    }
  },
  analyzer: {
    analyzeVulnerabilities: (data: any) => ipcRenderer.invoke('analyze-vulnerabilities', data),
    generateReport: (data: any) => ipcRenderer.invoke('generate-report', data),
    onQuotaStatus: (callback: (data: { exhausted: boolean }) => void) => {
      ipcRenderer.on('quota-status', (_, data) => callback(data))
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('quota-status')
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
