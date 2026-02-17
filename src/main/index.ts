import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { WebCrawler, CrawlResult } from './crawler_native'
import { DirectoryFuzzer, type FuzzResult, getAvailableWordlists } from './fuzzer'
import { VulnerabilityAgent, CrawledDataSummary } from './agent'

// ... existing code ...

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    // titleBarOverlay: {
    //   color: '#00000000',
    //   symbolColor: '#ffffff',
    //   height: 30
    // },
    // Improve Windows snapping and maximize behavior for frameless windows
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    thickFrame: true,
    // Transparency can interfere with snapping/maximize on Windows. Keep transparency off on win32.
    transparent: process.platform === 'win32' ? false : true,
    backgroundColor: '#000000',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Emit window state to renderer for UI updates
  const sendWindowState = () => {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused) {
      focused.webContents.send('window-state', {
        isMaximized: focused.isMaximized(),
        isMinimized: focused.isMinimized()
      })
    }
  }
  mainWindow.on('maximize', sendWindowState)
  mainWindow.on('unmaximize', sendWindowState)
  mainWindow.on('minimize', sendWindowState)
  mainWindow.on('restore', sendWindowState)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Crawler functionality
  let crawler: WebCrawler | null = null
  let fuzzer: DirectoryFuzzer | null = null

  ipcMain.handle('start-crawl', async (event, url: string, context?: any) => {
    console.log(`[IPC] start-crawl received for: ${url}`)
    if (crawler) {
      console.log('[IPC] Closing existing crawler instance...')
      try {
        await crawler.close()
      } catch (err) {
        console.error('Error closing crawler:', err)
      }
      crawler = null
    }

    console.log(context);
    const sender = event.sender

    const crawlStartTime = Date.now()
    crawler = new WebCrawler(
      context,
      (currentUrl: string, results: CrawlResult[]) => {
        // Send progress updates to renderer
        sender.send('crawl-progress', {
          currentUrl,
          duration: Date.now() - crawlStartTime,
          results: results.map((r) => ({
            url: r.url,
            status: r.status,
            title: r.title,
            forms: r.forms,
            apiCalls: r.apiCalls,
            cookies: r.cookies,
            emails: r.emails,
            assets: r.assets,
            error: r.error
          })),
          domains: crawler ? crawler.getAllDiscoveredDomains() : [],
          allApiCalls: crawler ? crawler.getAllApiCalls() : [],
          allCookies: crawler ? crawler.getAllCookies() : [],
          allEmails: crawler ? crawler.getAllEmails() : [],
          allAssets: crawler ? crawler.getAllAssets() : {}
        })
      },
      (urls: string[]) => {
        // Send URL discovery updates to renderer
        sender.send('urls-discovered', {
          urls
        })
      }
    )

    try {
      console.log('start crawl', context)
      const results = await crawler.crawl(url, 1000, 5) // Increased batch size to 5 for speed
      const totalDuration = Date.now() - crawlStartTime
      sender.send('crawl-complete', {
          totalDuration,
          results: results.map((r) => ({
            url: r.url,
            status: r.status,
            title: r.title,
            forms: r.forms,
            apiCalls: r.apiCalls,
            cookies: r.cookies,
            emails: r.emails,
            assets: r.assets,
            error: r.error
          })),
          domains: crawler ? crawler.getAllDiscoveredDomains() : [],
          allApiCalls: crawler ? crawler.getAllApiCalls() : [],
          allCookies: crawler ? crawler.getAllCookies() : [],
          allEmails: crawler ? crawler.getAllEmails() : [],
          allAssets: crawler ? crawler.getAllAssets() : {}
        })
      return { success: true, results }
    } catch (error) {
      console.error('Crawl failed:', error)
      sender.send('crawl-error', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      crawler = null
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('stop-crawl', async () => {
    if (crawler) {
      // Signal cooperative stop first
      try {
        crawler.stop()
      } catch (err) {
        console.error(err)
      }
      await crawler.close()
      crawler = null
    }
    return { success: true }
  })

  ipcMain.handle('submit-form', async (_, formData) => {
    if (!crawler) {
      crawler = new WebCrawler(undefined)
      await crawler.init()
    }

    try {
      const result = await crawler.submitForm(formData)
      return { success: true, result }
    } catch (error) {
      console.error(error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Directory fuzzing functionality
  ipcMain.handle('get-wordlists', async () => {
    try {
      const wordlists = getAvailableWordlists()
      return { success: true, wordlists }
    } catch (error) {
      console.error(error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('start-fuzz', async (event, options: {
    baseUrl: string
    wordlist: string
    extensions: string[]
    concurrency: number
  }) => {
    if (fuzzer) {
      fuzzer.stop()
      fuzzer = null
    }

    try {
      const sender = event.sender
      fuzzer = new DirectoryFuzzer(
        options.baseUrl,
        options.wordlist,
        options.extensions,
        options.concurrency
      )

      fuzzer.fuzz(
        (result: FuzzResult) => {
          sender.send('fuzz-progress', result)
        },
        (results: FuzzResult[]) => {
          sender.send('fuzz-complete', { results })
          fuzzer = null
        }
      )

      return {
        success: true,
        totalPaths: fuzzer.getWordlistSize()
      }
    } catch (error) {
      console.error(error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('stop-fuzz', async () => {
    if (fuzzer) {
      fuzzer.stop()
      fuzzer = null
      const window = BrowserWindow.getFocusedWindow()
      if (window) {
        window.webContents.send('fuzz-stopped')
      }
    }
    return { success: true }
  })

  // Vulnerability Analysis
  let vulnerabilityAgent: VulnerabilityAgent | null = null

  try {
    vulnerabilityAgent = new VulnerabilityAgent(process.env.GROQ_API_KEY)
  } catch (error) {
    console.warn('Failed to initialize VulnerabilityAgent:', error)
  }

  ipcMain.handle('analyze-vulnerabilities', async (event, data: CrawledDataSummary) => {
    const sender = event.sender
    console.log('[IPC] analyze-vulnerabilities received')
    if (!vulnerabilityAgent) {
      console.log('Initializing VulnerabilityAgent with key:', process.env.GROQ_API_KEY ? 'YES' : 'NO')
      // Try to initialize again if key is provided later or via env
      try {
        vulnerabilityAgent = new VulnerabilityAgent(process.env.GROQ_API_KEY)
      } catch (error) {
        console.error('Failed to init agent:', error)
        return { 
          success: false, 
          error: 'Vulnerability analysis requires GROQ_API_KEY environment variable. Please add it to your .env file.' 
        }
      }
    }

    try {
      const analysisStartTime = Date.now()
      const report = await vulnerabilityAgent.analyzeForVulnerabilities(data, (exhausted) => {
        sender.send('quota-status', { exhausted })
      })
      const analysisDuration = Date.now() - analysisStartTime
      console.log('Analysis complete, report:', report ? 'Generated' : 'Null')
      return { success: true, report, analysisDuration }
    } catch (error) {
      console.error('Vulnerability analysis failed:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during analysis' 
      }
    }
  })

  ipcMain.handle('generate-report', async (event, { vulnerabilities, data, url }) => {
    const sender = event.sender
    if (!vulnerabilityAgent) {
      return { 
        success: false, 
        error: 'Report generation requires GROQ_API_KEY environment variable.' 
      }
    }

    try {
      const report = await vulnerabilityAgent.generateFullReport(vulnerabilities, data, url, (exhausted) => {
        sender.send('quota-status', { exhausted })
      })
      return { success: true, report }
    } catch (error) {
      console.error('Report generation failed:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during report generation' 
      }
    }
  })

  // Window controls
  ipcMain.on('window-minimize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.minimize()
  })

  ipcMain.on('window-maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
      const focused = BrowserWindow.getFocusedWindow()
      if (focused) {
        focused.webContents.send('window-state', {
          isMaximized: focused.isMaximized(),
          isMinimized: focused.isMinimized()
        })
      }
    }
  })

  // Optional: allow renderer to request current window state
  ipcMain.handle('window-get-state', () => {
    const window = BrowserWindow.getFocusedWindow()
    return window
      ? { isMaximized: window.isMaximized(), isMinimized: window.isMinimized() }
      : { isMaximized: false, isMinimized: false }
  })

  // Support dblclick on custom title bar to toggle maximize
  ipcMain.on('window-toggle-maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) window.close()
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
