import { EventEmitter } from 'events'

/**
 * Backend Agent Client for Wibe Crawler
 * 
 * Integrates with a separate backend service that performs security scanning
 * using tools like nmap, nikto, sqlmap, xsstrike, gobuster, and wpscan.
 * 
 * Configuration:
 * Set the BACKEND_API_ENDPOINT environment variable to configure the backend URL.
 * Default: http://localhost:8000
 * 
 * Example:
 * export BACKEND_API_ENDPOINT=http://your-backend-server:8000
 */

// Global API endpoint configuration
export let BACKEND_API_ENDPOINT = process.env.BACKEND_API_ENDPOINT || 'http://127.0.0.1:8000'

/**
 * Set the backend API endpoint
 */
export function setBackendApiEndpoint(endpoint: string): void {
  BACKEND_API_ENDPOINT = endpoint
}

/**
 * Get the current backend API endpoint
 */
export function getBackendApiEndpoint(): string {
  return BACKEND_API_ENDPOINT
}

// ============================================================================
// Type Definitions
// ============================================================================

export type ScanType = 'quick' | 'full' | 'targeted'

export interface ScanRequest {
  target: string
  scan_type: ScanType
  thread_id: string
}

export interface ThinkingEvent {
  type: 'thinking'
  data: {
    action: string
    args: Record<string, any>
  }
}

export interface ToolCallEvent {
  type: 'tool_call'
  data: {
    tool: string
    status: 'completed'
    output: string
  }
}

export interface TodoUpdateEvent {
  type: 'todo_update'
  data: {
    message?: string
    todos: string | string[]
  }
}

export interface ResponseEvent {
  type: 'response'
  data: {
    content: string
  }
}

export interface CompleteEvent {
  type: 'complete'
  data: {
    thread_id: string
    status: 'completed'
  }
}

export interface ErrorEvent {
  type: 'error'
  data: {
    error: string
  }
}

export type SSEEvent =
  | ThinkingEvent
  | ToolCallEvent
  | TodoUpdateEvent
  | ResponseEvent
  | CompleteEvent
  | ErrorEvent

// ============================================================================
// Backend Agent Client
// ============================================================================

export class BackendAgent extends EventEmitter {
  private abortController: AbortController | null = null
  private isScanning = false

  constructor(private apiEndpoint: string = BACKEND_API_ENDPOINT) {
    super()
  }

  /**
   * Check if a scan is currently running
   */
  public isActive(): boolean {
    return this.isScanning
  }

  /**
   * Start a security scan with the backend agent
   * @param target Target URL to scan
   * @param scanType Type of scan (quick, full, targeted)
   * @param threadId Optional unique scan ID
   */
  async startScan(
    target: string,
    scanType: ScanType = 'quick',
    threadId?: string
  ): Promise<void> {
    if (this.isScanning) {
      throw new Error('A scan is already in progress. Stop it before starting a new one.')
    }

    this.isScanning = true
    this.abortController = new AbortController()

    const scanRequest: ScanRequest = {
      target,
      scan_type: scanType,
      thread_id: threadId || this.generateThreadId()
    }

    console.log(`[BackendAgent] Starting ${scanType} scan for: ${target}`)
    this.emit('scan-started', scanRequest)

    try {
      const response = await fetch(`${this.apiEndpoint}/scan/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(scanRequest),
        signal: this.abortController.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is null')
      }

      await this.processSSEStream(response.body)
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[BackendAgent] Scan aborted by user')
        this.emit('scan-aborted')
      } else {
        console.error('[BackendAgent] Scan error:', error)
        this.emit('error', { error: error.message || 'Unknown error' })
      }
    } finally {
      this.isScanning = false
      this.abortController = null
    }
  }

  /**
   * Stop the current scan
   */
  stop(): void {
    if (this.abortController) {
      console.log('[BackendAgent] Stopping scan...')
      this.abortController.abort()
    }
  }

  /**
   * Process the SSE stream from the backend
   */
  private async processSSEStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          console.log('[BackendAgent] Stream completed')
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE messages
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            
            if (data) {
              try {
                const event: SSEEvent = JSON.parse(data)
                this.handleSSEEvent(event)
              } catch (parseError) {
                console.error('[BackendAgent] Failed to parse SSE data:', data)
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Handle individual SSE events
   */
  private handleSSEEvent(event: SSEEvent): void {
    console.log(`[BackendAgent] Event: ${event.type}`)

    switch (event.type) {
      case 'thinking':
        this.emit('thinking', event.data)
        break

      case 'tool_call':
        this.emit('tool-call', event.data)
        break

      case 'todo_update':
        this.emit('todo-update', event.data)
        break

      case 'response':
        this.emit('response', event.data)
        break

      case 'complete':
        this.emit('complete', event.data)
        this.isScanning = false
        break

      case 'error':
        this.emit('error', event.data)
        this.isScanning = false
        break

      default:
        console.warn('[BackendAgent] Unknown event type:', (event as any).type)
    }
  }

  /**
   * Generate a unique thread ID for the scan
   */
  private generateThreadId(): string {
    return `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Test the backend connection
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log(`[BackendAgent] Testing connection to: ${this.apiEndpoint}`)
      
      const response = await fetch(`${this.apiEndpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000 * 60 * 30)
      })

      return response.ok
    } catch (error) {
      console.error('[BackendAgent] Connection test failed:', error)
      return false
    }
  }
}

// ============================================================================
// Event Emitter Type Safety
// ============================================================================

export interface BackendAgentEvents {
  'scan-started': (request: ScanRequest) => void
  'scan-aborted': () => void
  'thinking': (data: ThinkingEvent['data']) => void
  'tool-call': (data: ToolCallEvent['data']) => void
  'todo-update': (data: TodoUpdateEvent['data']) => void
  'response': (data: ResponseEvent['data']) => void
  'complete': (data: CompleteEvent['data']) => void
  'error': (data: ErrorEvent['data']) => void
}

export declare interface BackendAgent {
  on<K extends keyof BackendAgentEvents>(
    event: K,
    listener: BackendAgentEvents[K]
  ): this
  once<K extends keyof BackendAgentEvents>(
    event: K,
    listener: BackendAgentEvents[K]
  ): this
  emit<K extends keyof BackendAgentEvents>(
    event: K,
    ...args: Parameters<BackendAgentEvents[K]>
  ): boolean
}
