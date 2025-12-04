import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface FuzzResult {
  path: string
  url: string
  status: number
  contentLength: number
  responseTime: number
  error?: string
}

export class DirectoryFuzzer {
  private baseUrl: string
  private wordlist: string[]
  private stopped: boolean = false
  private extensions: string[]
  private concurrency: number

  constructor(
    baseUrl: string,
    wordlistPath: string,
    extensions: string[] = [''],
    concurrency: number = 10
  ) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    this.wordlist = this.loadWordlist(wordlistPath)
    this.extensions = extensions
    this.concurrency = concurrency
  }

  private loadWordlist(wordlistPath: string): string[] {
    const appPath = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const fullPath = path.join(appPath, 'wordlists', wordlistPath)
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Wordlist not found: ${fullPath}`)
    }

    const content = fs.readFileSync(fullPath, 'utf-8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  }

  stop(): void {
    this.stopped = true
  }

  async fuzz(
    onProgress: (result: FuzzResult) => void,
    onComplete: (results: FuzzResult[]) => void
  ): Promise<void> {
    const results: FuzzResult[] = []
    const tasks: Array<{ word: string; ext: string }> = []

    // Generate all combinations of words and extensions
    for (const word of this.wordlist) {
      for (const ext of this.extensions) {
        tasks.push({ word, ext })
      }
    }

    // Process tasks with concurrency limit
    for (let i = 0; i < tasks.length; i += this.concurrency) {
      if (this.stopped) break

      const batch = tasks.slice(i, i + this.concurrency)
      const batchPromises = batch.map(async ({ word, ext }) => {
        if (this.stopped) return null

        const pathSegment = word + ext
        const url = `${this.baseUrl}/${pathSegment}`
        const startTime = Date.now()

        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)

          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'manual',
            headers: {
              'User-Agent': 'Wibe-Crawler/1.0'
            }
          })

          clearTimeout(timeoutId)

          const responseTime = Date.now() - startTime
          const contentLength = parseInt(response.headers.get('content-length') || '0', 10)

          const result: FuzzResult = {
            path: pathSegment,
            url,
            status: response.status,
            contentLength,
            responseTime
          }

          results.push(result)
          onProgress(result)
          return result
        } catch (error: unknown) {
          const responseTime = Date.now() - startTime
          const result: FuzzResult = {
            path: pathSegment,
            url,
            status: 0,
            contentLength: 0,
            responseTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          }

          if (!String(error).includes('aborted')) {
            results.push(result)
            onProgress(result)
          }
          return result
        }
      })

      await Promise.all(batchPromises)
    }

    onComplete(results)
  }

  getWordlistSize(): number {
    return this.wordlist.length * this.extensions.length
  }
}

export function getAvailableWordlists(): string[] {
  const appPath = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const wordlistsPath = path.join(appPath, 'wordlists')

  if (!fs.existsSync(wordlistsPath)) {
    return []
  }

  return fs
    .readdirSync(wordlistsPath)
    .filter((file) => file.endsWith('.txt'))
    .map((file) => file)
}