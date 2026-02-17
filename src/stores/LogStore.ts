import { makeObservable, observable, action, computed, runInAction } from 'mobx'
import { LogFrame, LogMetadata } from '../domain/types/LogFrame'

export type ParseStatus = 'idle' | 'parsing' | 'success' | 'error'

/**
 * Store for log data and parsing state
 */
export class LogStore {
  // Observable state
  frames: LogFrame[] = []
  metadata: LogMetadata | null = null
  parseStatus: ParseStatus = 'idle'
  parseProgress: number = 0
  parseMessage: string = ''
  parseError: string | null = null

  // Worker reference
  private worker: Worker | null = null

  constructor() {
    makeObservable(this, {
      frames: observable,
      metadata: observable,
      parseStatus: observable,
      parseProgress: observable,
      parseMessage: observable,
      parseError: observable,
      isLoaded: computed,
      frameCount: computed,
      duration: computed,
      sampleRate: computed,
      uploadFile: action,
      reset: action,
    })
  }

  /**
   * Computed: Is a log loaded?
   */
  get isLoaded(): boolean {
    return this.frames.length > 0 && this.metadata !== null
  }

  /**
   * Computed: Total frame count
   */
  get frameCount(): number {
    return this.frames.length
  }

  /**
   * Computed: Log duration in seconds
   */
  get duration(): number {
    return this.metadata?.duration ?? 0
  }

  /**
   * Computed: Sample rate in Hz
   */
  get sampleRate(): number {
    return this.metadata?.looptime ?? 8000
  }

  /**
   * Upload and parse a log file
   */
  uploadFile = async (file: File): Promise<void> => {
    // Determine file type
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['bbl', 'txt', 'csv'].includes(extension)) {
      runInAction(() => {
        this.parseStatus = 'error'
        this.parseError = 'Unsupported file type. Please upload a .bbl or .txt file.'
      })
      return
    }

    // Reset state
    runInAction(() => {
      this.parseStatus = 'parsing'
      this.parseProgress = 0
      this.parseMessage = 'Starting parse...'
      this.parseError = null
      this.frames = []
      this.metadata = null
    })

    // Create worker
    this.worker = new Worker(new URL('../workers/logParser.worker.ts', import.meta.url), {
      type: 'module',
    })

    // Set up worker message handler
    this.worker.onmessage = (e: MessageEvent) => {
      const message = e.data

      if (message.type === 'progress') {
        runInAction(() => {
          this.parseProgress = message.progress
          this.parseMessage = message.message
        })
      } else if (message.type === 'complete') {
        runInAction(() => {
          this.frames = message.frames
          this.metadata = message.metadata
          this.parseStatus = 'success'
          this.parseProgress = 100
          this.parseMessage = 'Parse complete!'
        })

        // Terminate worker
        this.worker?.terminate()
        this.worker = null
      } else if (message.type === 'error') {
        runInAction(() => {
          this.parseStatus = 'error'
          this.parseError = message.error
          this.parseMessage = 'Parse failed'
        })

        // Terminate worker
        this.worker?.terminate()
        this.worker = null
      }
    }

    this.worker.onerror = (error: ErrorEvent) => {
      runInAction(() => {
        this.parseStatus = 'error'
        this.parseError = error.message || 'Worker error'
        this.parseMessage = 'Parse failed'
      })

      this.worker?.terminate()
      this.worker = null
    }

    // Start parsing
    this.worker.postMessage({
      file,
      fileType: extension === 'txt' || extension === 'csv' ? 'txt' : extension,
    })
  }

  /**
   * Reset store to initial state
   */
  reset = (): void => {
    this.frames = []
    this.metadata = null
    this.parseStatus = 'idle'
    this.parseProgress = 0
    this.parseMessage = ''
    this.parseError = null

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  /**
   * Get frames in a time range
   */
  getFramesInRange(startTime: number, endTime: number): LogFrame[] {
    return this.frames.filter(f => f.time >= startTime && f.time <= endTime)
  }

  /**
   * Get frame at specific index
   */
  getFrame(index: number): LogFrame | undefined {
    return this.frames[index]
  }
}
