import { makeAutoObservable, runInAction } from 'mobx'
import { AnalysisResult, DetectedIssue, Recommendation, FlightSegment } from '../domain/types/Analysis'
import { RuleEngine } from '../domain/engine/RuleEngine'
import { QuadProfile, QuadSize, ThresholdScaling } from '../domain/types/QuadProfile'
import { QUAD_PROFILES, DEFAULT_PROFILE } from '../domain/profiles/quadProfiles'
import { detectQuadSize, DetectionResult } from '../domain/profiles/detectQuadSize'
import { LogStore } from './LogStore'

export type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error'
export type AnalysisLevel = 'basic' | 'average' | 'expert'

/**
 * Threshold multipliers per analysis level.
 * Higher = more lenient (fewer issues detected).
 * Basic: very relaxed, only obvious problems.
 * Average: balanced baseline.
 * Expert: aggressive, catches subtle issues.
 */
const ANALYSIS_LEVEL_MULTIPLIER: Record<AnalysisLevel, number> = {
  basic: 4.0,
  average: 1.25,
  expert: 0.5,
}

/**
 * Store for analysis results and recommendations
 */
export class AnalysisStore {
  analysisStatus: AnalysisStatus = 'idle'
  analysisProgress: number = 0
  analysisMessage: string = ''
  result: AnalysisResult | null = null
  selectedSegmentId: string | null = null
  selectedIssueId: string | null = null
  selectedOccurrenceIdx: number | null = null
  selectedRecommendationId: string | null = null
  selectionBump: number = 0
  quadProfile: QuadProfile = DEFAULT_PROFILE
  analysisLevel: AnalysisLevel = 'average'
  isReanalyzing: boolean = false
  detectionResult: DetectionResult | null = null

  private logStore: LogStore
  private ruleEngine: RuleEngine

  constructor(logStore: LogStore) {
    this.logStore = logStore
    this.ruleEngine = new RuleEngine()

    makeAutoObservable<this, 'logStore' | 'ruleEngine'>(this, { logStore: false, ruleEngine: false })
  }

  get isComplete(): boolean {
    return this.result !== null
  }

  get issues(): DetectedIssue[] {
    return this.result?.issues ?? []
  }

  get recommendations(): Recommendation[] {
    return this.result?.recommendations ?? []
  }

  get segments(): FlightSegment[] {
    return this.result?.segments ?? []
  }

  get selectedSegment(): FlightSegment | undefined {
    if (!this.selectedSegmentId) return undefined
    return this.segments.find(s => s.id === this.selectedSegmentId)
  }

  get selectedIssue(): DetectedIssue | undefined {
    if (!this.selectedIssueId) return undefined
    return this.issues.find(i => i.id === this.selectedIssueId)
  }

  get highSeverityIssues(): DetectedIssue[] {
    return this.issues.filter(i => i.severity === 'high')
  }

  get highPriorityRecommendations(): Recommendation[] {
    return this.recommendations.filter(r => r.priority >= 7)
  }

  setQuadProfile = (sizeId: QuadSize): void => {
    this.quadProfile = QUAD_PROFILES[sizeId]
    if (this.logStore.isLoaded) {
      this.reanalyze()
    }
  }

  setAnalysisLevel = (level: AnalysisLevel): void => {
    this.analysisLevel = level
    if (this.logStore.isLoaded) {
      this.reanalyze()
    }
  }

  private reanalyze = (): void => {
    this.isReanalyzing = true

    setTimeout(() => {
      const m = ANALYSIS_LEVEL_MULTIPLIER[this.analysisLevel]
      const scaledThresholds: ThresholdScaling = {
        gyroNoise: this.quadProfile.thresholds.gyroNoise * m,
        dtermNoise: this.quadProfile.thresholds.dtermNoise * m,
        propwashAmplitude: this.quadProfile.thresholds.propwashAmplitude * m,
        bouncebackOvershoot: this.quadProfile.thresholds.bouncebackOvershoot * m,
        wobbleAmplitude: this.quadProfile.thresholds.wobbleAmplitude * m,
        motorSaturation: this.quadProfile.thresholds.motorSaturation * m,
        trackingError: this.quadProfile.thresholds.trackingError * m,
        highThrottleOscillation: this.quadProfile.thresholds.highThrottleOscillation * m,
      }
      const scaledProfile: QuadProfile = {
        ...this.quadProfile,
        thresholds: scaledThresholds,
      }

      const result = this.ruleEngine.analyzeLog(
        this.logStore.frames,
        this.logStore.metadata!,
        scaledProfile
      )

      runInAction(() => {
        this.result = result
        this.isReanalyzing = false
        this.selectedIssueId = null
        this.selectedOccurrenceIdx = null
        this.selectedRecommendationId = null
        this.selectedSegmentId = null
      })
    }, 0)
  }

  analyze = async (): Promise<void> => {
    if (!this.logStore.isLoaded) {
      throw new Error('No log loaded')
    }

    runInAction(() => {
      this.analysisStatus = 'analyzing'
      this.analysisProgress = 0
      this.analysisMessage = 'Starting analysis...'
      this.result = null
    })

    try {
      if (this.logStore.metadata && !this.detectionResult) {
        const detection = detectQuadSize(this.logStore.metadata)
        runInAction(() => {
          this.detectionResult = detection
          this.quadProfile = QUAD_PROFILES[detection.suggestedSize]
        })
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      runInAction(() => {
        this.analysisProgress = 25
        this.analysisMessage = 'Segmenting flight data...'
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      runInAction(() => {
        this.analysisProgress = 50
        this.analysisMessage = 'Detecting issues...'
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      runInAction(() => {
        this.analysisProgress = 75
        this.analysisMessage = 'Generating recommendations...'
      })

      const m = ANALYSIS_LEVEL_MULTIPLIER[this.analysisLevel]
      const scaledThresholds: ThresholdScaling = {
        gyroNoise: this.quadProfile.thresholds.gyroNoise * m,
        dtermNoise: this.quadProfile.thresholds.dtermNoise * m,
        propwashAmplitude: this.quadProfile.thresholds.propwashAmplitude * m,
        bouncebackOvershoot: this.quadProfile.thresholds.bouncebackOvershoot * m,
        wobbleAmplitude: this.quadProfile.thresholds.wobbleAmplitude * m,
        motorSaturation: this.quadProfile.thresholds.motorSaturation * m,
        trackingError: this.quadProfile.thresholds.trackingError * m,
        highThrottleOscillation: this.quadProfile.thresholds.highThrottleOscillation * m,
      }
      const scaledProfile: QuadProfile = {
        ...this.quadProfile,
        thresholds: scaledThresholds,
      }

      const result = this.ruleEngine.analyzeLog(
        this.logStore.frames,
        this.logStore.metadata!,
        scaledProfile
      )

      await new Promise(resolve => setTimeout(resolve, 100))

      runInAction(() => {
        this.result = result
        this.analysisStatus = 'complete'
        this.analysisProgress = 100
        this.analysisMessage = `Analysis complete! Found ${result.issues.length} issues.`
      })
    } catch (error) {
      runInAction(() => {
        this.analysisStatus = 'error'
        this.analysisMessage =
          error instanceof Error ? error.message : 'Analysis failed'
      })
    }
  }

  reset = (): void => {
    this.analysisStatus = 'idle'
    this.analysisProgress = 0
    this.analysisMessage = ''
    this.result = null
    this.selectedSegmentId = null
    this.selectedIssueId = null
    this.selectedOccurrenceIdx = null
    this.selectedRecommendationId = null
    this.quadProfile = DEFAULT_PROFILE
    this.analysisLevel = 'average'
    this.detectionResult = null
  }

  selectSegment = (segmentId: string | null): void => {
    this.selectedSegmentId = segmentId
  }

  selectIssue = (issueId: string | null, occurrenceIdx?: number): void => {
    this.selectedIssueId = issueId
    this.selectedOccurrenceIdx = occurrenceIdx ?? null
    this.selectionBump++
  }

  selectRecommendation = (recId: string | null): void => {
    this.selectedRecommendationId = recId
  }

  getRecommendationsForIssue(issueId: string): Recommendation[] {
    return this.recommendations.filter(
      r => r.issueId === issueId || r.relatedIssueIds?.includes(issueId)
    )
  }

  getIssuesInTimeRange(startTime: number, endTime: number): DetectedIssue[] {
    return this.issues.filter(issue => {
      const occurrences = issue.occurrences ?? [issue.timeRange]
      return occurrences.some((tr, idx) => {
        const peak = issue.peakTimes?.[idx] ?? issue.metrics.peakTime ?? (tr[0] + tr[1]) / 2
        return peak >= startTime && peak <= endTime
      })
    })
  }
}
