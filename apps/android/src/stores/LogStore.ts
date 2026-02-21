/**
 * MobX LogStore for React Native.
 *
 * Functionally identical to the web LogStore (src/stores/LogStore.ts) except:
 * - Uses parseLogFile() directly instead of a Web Worker
 * - No localStorage (no persistence needed — logs are ephemeral)
 * - Progress updates happen via runInAction instead of postMessage
 */
import { makeAutoObservable, observable, runInAction } from 'mobx'
import type { Axis } from '@bf-tuner/domain/types/Analysis'
import type { LogFrame, LogMetadata } from '@bf-tuner/domain/types/LogFrame'
import { trimFlightEdges } from '@bf-tuner/domain/utils/trimFlightEdges'
import { parseLogFile, type DomainRanges } from '../parsing/parseLogFile'

export type ParseStatus = 'idle' | 'parsing' | 'success' | 'error'

interface AutoAnalyzer {
  analyze(): Promise<void>
  reset(): void
}

export class LogStore {
  frames: LogFrame[] = []
  metadata: LogMetadata | null = null
  parseStatus: ParseStatus = 'idle'
  parseProgress: number = 0
  parseMessage: string = ''
  parseError: string | null = null
  trimInfo: { startSeconds: number; endSeconds: number } | null = null

  private autoAnalyzer: AutoAnalyzer | null = null
  private precomputedDomains: DomainRanges | null = null

  constructor() {
    makeAutoObservable<this, 'autoAnalyzer' | 'precomputedDomains'>(this, {
      frames: observable.ref,
      autoAnalyzer: false,
      precomputedDomains: false,
    })
  }

  setAutoAnalyzer(analyzer: AutoAnalyzer): void {
    this.autoAnalyzer = analyzer
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

  get hasFeedforward(): boolean {
    return this.metadata?.fieldNames.includes('axisF[0]') ?? false
  }

  get signalDomains(): Record<Axis, [number, number]> {
    if (this.precomputedDomains) return this.precomputedDomains.signal
    return { roll: [-500, 500], pitch: [-500, 500], yaw: [-500, 500] }
  }

  get pidDomains(): Record<Axis, [number, number]> {
    if (this.precomputedDomains) return this.precomputedDomains.pid
    return { roll: [-100, 100], pitch: [-100, 100], yaw: [-100, 100] }
  }

  get motorDomain(): [number, number] {
    if (this.precomputedDomains) return this.precomputedDomains.motor
    return [1000, 2000]
  }

  getFramesInRange(startTime: number, endTime: number): LogFrame[] {
    return this.frames.filter(f => f.time >= startTime && f.time <= endTime)
  }

  /**
   * Parse a log file from a device URI (from expo-document-picker).
   */
  async uploadFromUri(uri: string): Promise<void> {
    runInAction(() => {
      this.parseStatus = 'parsing'
      this.parseProgress = 0
      this.parseMessage = 'Starting...'
      this.parseError = null
      this.frames = []
      this.metadata = null
      this.precomputedDomains = null
      this.trimInfo = null
    })

    this.autoAnalyzer?.reset()

    try {
      const result = await parseLogFile(uri, (progress, message) => {
        runInAction(() => {
          this.parseProgress = progress
          this.parseMessage = message
        })
      })

      this.finishParse(result.frames, result.metadata, result.domains)
    } catch (error) {
      runInAction(() => {
        this.parseStatus = 'error'
        this.parseError = error instanceof Error ? error.message : 'Unknown parsing error'
        this.parseProgress = 0
        this.parseMessage = ''
      })
    }
  }

  /**
   * Load frames that were already parsed (e.g., from dataflash download).
   */
  loadParsedFrames(frames: LogFrame[], metadata: LogMetadata, domains: DomainRanges): void {
    this.finishParse(frames, metadata, domains)
  }

  reset(): void {
    runInAction(() => {
      this.frames = []
      this.metadata = null
      this.parseStatus = 'idle'
      this.parseProgress = 0
      this.parseMessage = ''
      this.parseError = null
      this.trimInfo = null
      this.precomputedDomains = null
    })
    this.autoAnalyzer?.reset()
  }

  private finishParse(frames: LogFrame[], metadata: LogMetadata, domains: DomainRanges): void {
    const trimResult = trimFlightEdges(frames, metadata)

    runInAction(() => {
      this.frames = trimResult.frames
      this.metadata = {
        ...metadata,
        frameCount: trimResult.frames.length,
        duration: trimResult.frames.length > 0
          ? (trimResult.frames[trimResult.frames.length - 1].time - trimResult.frames[0].time) / 1_000_000
          : 0,
      }
      this.precomputedDomains = domains
      this.trimInfo = {
        startSeconds: trimResult.trimmedStartSeconds,
        endSeconds: trimResult.trimmedEndSeconds,
      }
      this.parseStatus = 'success'
      this.parseProgress = 100
      this.parseMessage = 'Complete'
    })

    this.autoAnalyzer?.analyze()
  }
}
