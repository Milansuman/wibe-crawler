import { ElectronAPI } from '@electron-toolkit/preload'

interface WindowControls {
  minimize: () => void
  maximize: () => void
  close: () => void
  toggleMaximize: () => void
  onState: (callback: (state: { isMaximized: boolean; isMinimized: boolean }) => void) => void
  getState: () => Promise<{ isMaximized: boolean; isMinimized: boolean }>
}

interface CrawlerAPI {
  startCrawl: (url: string, context?: any) => Promise<any>
  stopCrawl: () => Promise<any>
  submitForm: (formData: any) => Promise<any>
  onProgress: (callback: (data: any) => void) => void
  onUrlsDiscovered: (callback: (data: any) => void) => void
  onComplete: (callback: (data: any) => void) => void
  onError: (callback: (data: any) => void) => void
  removeAllListeners: () => void
}

interface FuzzerAPI {
  getWordlists: () => Promise<any>
  startFuzz: (options: any) => Promise<any>
  stopFuzz: () => Promise<any>
  onProgress: (callback: (data: any) => void) => void
  onComplete: (callback: (data: any) => void) => void
  onStopped: (callback: () => void) => void
  removeAllListeners: () => void
}

interface AnalyzerAPI {
  analyzeVulnerabilities: (data: any) => Promise<any>
  generateReport: (data: any) => Promise<any>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      windowControls: WindowControls
      crawler: CrawlerAPI
      fuzzer: FuzzerAPI
      analyzer: AnalyzerAPI
    }
  }
}
