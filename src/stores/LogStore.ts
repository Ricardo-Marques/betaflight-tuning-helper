import { makeAutoObservable, runInAction } from 'mobx'
import { LogFrame, LogMetadata } from '../domain/types/LogFrame'

export type ParseStatus = 'idle' | 'parsing' | 'success' | 'error'

interface AutoAnalyzer {
  analyze(): Promise<void>
  reset(): void
}

/**
 * Store for log data and parsing state
 */
export class LogStore {
  frames: LogFrame[] = []
  metadata: LogMetadata | null = null
  parseStatus: ParseStatus = 'idle'
  parseProgress: number = 0
  parseMessage: string = ''
  parseError: string | null = null

  private worker: Worker | null = null
  private autoAnalyzer: AutoAnalyzer | null = null

  setAutoAnalyzer(analyzer: AutoAnalyzer): void {
    this.autoAnalyzer = analyzer
  }

  constructor() {
    makeAutoObservable<this, 'worker' | 'autoAnalyzer'>(this, { worker: false, autoAnalyzer: false })
  }

  get isLoaded(): boolean {
    return this.frames.length > 0 && this.metadata !== null
  }

  get frameCount(): number {
    return this.frames.length
  }

  get duration(): number {
    return this.metadata?.duration ?? 0
  }

  get sampleRate(): number {
    return this.metadata?.looptime ?? 8000
  }

  uploadFile = async (file: File): Promise<void> => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['bbl', 'bfl', 'txt', 'csv'].includes(extension)) {
      runInAction(() => {
        this.parseStatus = 'error'
        this.parseError = 'Unsupported file type. Please upload a .bbl, .bfl, .txt, or .csv file.'
      })
      return
    }

    runInAction(() => {
      this.parseStatus = 'parsing'
      this.parseProgress = 0
      this.parseMessage = 'Starting parse...'
      this.parseError = null
      this.frames = []
      this.metadata = null
    })

    this.worker = new Worker(new URL('../workers/logParser.worker.ts', import.meta.url), {
      type: 'module',
    })

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

        this.worker?.terminate()
        this.worker = null

        if (this.autoAnalyzer) {
          this.autoAnalyzer.analyze()
        }
      } else if (message.type === 'error') {
        runInAction(() => {
          this.parseStatus = 'error'
          this.parseError = message.error
          this.parseMessage = 'Parse failed'
        })

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

    this.worker.postMessage({
      file,
      fileType: extension === 'txt' || extension === 'csv' ? 'txt' : 'bbl',
    })
  }

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

  getFramesInRange(startTime: number, endTime: number): LogFrame[] {
    return this.frames.filter(f => f.time >= startTime && f.time <= endTime)
  }

  getFrame(index: number): LogFrame | undefined {
    return this.frames[index]
  }
}
