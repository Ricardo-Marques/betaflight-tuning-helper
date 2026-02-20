import { makeAutoObservable, observable, runInAction } from 'mobx'
import type { Axis } from '../domain/types/Analysis'
import { LogFrame, LogMetadata } from '../domain/types/LogFrame'
import { trimFlightEdges } from '../domain/utils/trimFlightEdges'
import type { DomainRanges } from '../workers/logParser.worker'

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
  trimInfo: { startSeconds: number; endSeconds: number } | null = null

  private worker: Worker | null = null
  private autoAnalyzer: AutoAnalyzer | null = null

  // Pre-computed chart domains from the worker (non-reactive, used as short-circuit cache)
  private precomputedDomains: DomainRanges | null = null

  // Chunked transfer state (non-reactive, only used internally)
  private transferChunks: LogFrame[][] = []
  private transferExpected: number = 0
  private transferTotalFrames: number = 0
  private transferProgressStart: number = 0

  setAutoAnalyzer(analyzer: AutoAnalyzer): void {
    this.autoAnalyzer = analyzer
  }

  constructor() {
    makeAutoObservable<this, 'worker' | 'autoAnalyzer' | 'precomputedDomains' | 'transferChunks' | 'transferExpected' | 'transferTotalFrames' | 'transferProgressStart'>(this, {
      // Reference-only: frames array is replaced wholesale, never mutated in place.
      // Avoids O(n) Proxy wrapping of 100k+ elements on assignment.
      frames: observable.ref,
      worker: false,
      autoAnalyzer: false,
      precomputedDomains: false,
      transferChunks: false,
      transferExpected: false,
      transferTotalFrames: false,
      transferProgressStart: false,
    })
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

  /** Gyro + setpoint min/max per axis with 2% padding. Cached by MobX. */
  get signalDomains(): Record<Axis, [number, number]> {
    if (this.precomputedDomains) return this.precomputedDomains.signal

    const frames = this.frames
    if (frames.length === 0) {
      return { roll: [0, 1], pitch: [0, 1], yaw: [0, 1] }
    }

    const mins = { roll: Infinity, pitch: Infinity, yaw: Infinity }
    const maxs = { roll: -Infinity, pitch: -Infinity, yaw: -Infinity }
    const axes: Axis[] = ['roll', 'pitch', 'yaw']

    for (const frame of frames) {
      for (const axis of axes) {
        const g = frame.gyroADC[axis]
        const s = frame.setpoint[axis]
        if (g < mins[axis]) mins[axis] = g
        if (g > maxs[axis]) maxs[axis] = g
        if (s < mins[axis]) mins[axis] = s
        if (s > maxs[axis]) maxs[axis] = s
      }
    }

    const result = {} as Record<Axis, [number, number]>
    for (const axis of axes) {
      const range = maxs[axis] - mins[axis]
      const margin = range * 0.02
      result[axis] = [mins[axis] - margin, maxs[axis] + margin]
    }
    return result
  }

  /** PID (P/I/D/Sum) min/max per axis with 2% padding. Cached by MobX. */
  get pidDomains(): Record<Axis, [number, number]> {
    if (this.precomputedDomains) return this.precomputedDomains.pid

    const frames = this.frames
    if (frames.length === 0) {
      return { roll: [-500, 500], pitch: [-500, 500], yaw: [-500, 500] }
    }

    const mins = { roll: Infinity, pitch: Infinity, yaw: Infinity }
    const maxs = { roll: -Infinity, pitch: -Infinity, yaw: -Infinity }
    const axes: Axis[] = ['roll', 'pitch', 'yaw']

    for (const frame of frames) {
      for (const axis of axes) {
        const p = frame.pidP[axis]
        const i = frame.pidI[axis]
        const d = frame.pidD[axis]
        const sum = frame.pidSum[axis]
        const lo = Math.min(p, i, d, sum)
        const hi = Math.max(p, i, d, sum)
        if (lo < mins[axis]) mins[axis] = lo
        if (hi > maxs[axis]) maxs[axis] = hi
      }
    }

    const result = {} as Record<Axis, [number, number]>
    for (const axis of axes) {
      const range = maxs[axis] - mins[axis]
      const margin = range * 0.02
      result[axis] = [mins[axis] - margin, maxs[axis] + margin]
    }
    return result
  }

  /** Motor + throttle min/max with 5% padding, precomputed in worker. */
  get motorDomain(): [number, number] | null {
    return this.precomputedDomains?.motor ?? null
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
        this.precomputedDomains = message.domains
        this.finishParse(message.frames, message.metadata)
      } else if (message.type === 'transfer-start') {
        this.transferChunks = []
        this.transferExpected = message.chunkCount
        this.transferTotalFrames = message.totalFrames
        this.transferProgressStart = this.parseProgress
        this.precomputedDomains = message.domains
        runInAction(() => {
          this.metadata = message.metadata
        })
      } else if (message.type === 'transfer-chunk') {
        this.transferChunks.push(message.frames)
        const received = this.transferChunks.length
        const fraction = received / this.transferExpected
        const progressRange = 100 - this.transferProgressStart
        const framesReceived = Math.round(
          (received / this.transferExpected) * this.transferTotalFrames / 1000,
        )
        const framesTotal = Math.round(this.transferTotalFrames / 1000)

        runInAction(() => {
          this.parseProgress = Math.floor(this.transferProgressStart + fraction * progressRange)
          this.parseMessage = `Transferring frames (${framesReceived}k / ${framesTotal}k)...`
        })

        if (received === this.transferExpected) {
          const allFrames = this.transferChunks.flat()
          this.transferChunks = []
          this.finishParse(allFrames, this.metadata!)
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

  private finishParse(rawFrames: LogFrame[], rawMetadata: LogMetadata): void {
    this.worker?.terminate()
    this.worker = null

    // Trim takeoff/landing noise before rendering
    runInAction(() => {
      this.parseMessage = 'Trimming takeoff and landing noise...'
    })

    const { frames, metadata, trimmedStartSeconds, trimmedEndSeconds } = trimFlightEdges(rawFrames, rawMetadata)

    // Show "Rendering chart..." at 100% and let it paint before mounting the chart.
    // With observable.ref on frames, the assignment is instant (no Proxy wrapping),
    // so only the React mount + Recharts SVG build remains as a brief block.
    runInAction(() => {
      this.parseProgress = 100
      this.parseMessage = 'Rendering chart...'
    })

    requestAnimationFrame(() => setTimeout(() => {
      runInAction(() => {
        this.frames = frames
        this.metadata = metadata
        this.trimInfo = trimmedStartSeconds > 0 || trimmedEndSeconds > 0
          ? { startSeconds: trimmedStartSeconds, endSeconds: trimmedEndSeconds }
          : null
        this.parseStatus = 'success'
        this.parseMessage = 'Parse complete!'
      })

      if (this.autoAnalyzer) {
        this.autoAnalyzer.analyze().catch((err: unknown) => {
          console.error('Auto-analysis failed:', err)
        })
      }
    }, 0))
  }

  reset = (): void => {
    this.frames = []
    this.metadata = null
    this.parseStatus = 'idle'
    this.parseProgress = 0
    this.parseMessage = ''
    this.parseError = null
    this.trimInfo = null
    this.precomputedDomains = null
    this.transferChunks = []
    this.transferExpected = 0
    this.transferTotalFrames = 0
    this.transferProgressStart = 0

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
