import { makeObservable, observable, action, computed, runInAction } from 'mobx'
import { AnalysisResult, DetectedIssue, Recommendation, FlightSegment } from '../domain/types/Analysis'
import { RuleEngine } from '../domain/engine/RuleEngine'
import { QuadProfile, QuadSize } from '../domain/types/QuadProfile'
import { QUAD_PROFILES, DEFAULT_PROFILE } from '../domain/profiles/quadProfiles'
import { detectQuadSize, DetectionResult } from '../domain/profiles/detectQuadSize'
import { LogStore } from './LogStore'

export type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error'

/**
 * Store for analysis results and recommendations
 */
export class AnalysisStore {
  // Observable state
  analysisStatus: AnalysisStatus = 'idle'
  analysisProgress: number = 0
  analysisMessage: string = ''
  result: AnalysisResult | null = null
  selectedSegmentId: string | null = null
  selectedIssueId: string | null = null
  selectedOccurrenceIdx: number | null = null
  selectedRecommendationId: string | null = null
  quadProfile: QuadProfile = DEFAULT_PROFILE
  detectionResult: DetectionResult | null = null

  // Dependencies
  private logStore: LogStore
  private ruleEngine: RuleEngine

  constructor(logStore: LogStore) {
    this.logStore = logStore
    this.ruleEngine = new RuleEngine()

    makeObservable(this, {
      analysisStatus: observable,
      analysisProgress: observable,
      analysisMessage: observable,
      result: observable,
      selectedSegmentId: observable,
      selectedIssueId: observable,
      selectedOccurrenceIdx: observable,
      selectedRecommendationId: observable,
      quadProfile: observable,
      detectionResult: observable,
      isComplete: computed,
      issues: computed,
      recommendations: computed,
      segments: computed,
      selectedSegment: computed,
      selectedIssue: computed,
      highSeverityIssues: computed,
      highPriorityRecommendations: computed,
      analyze: action,
      reset: action,
      selectSegment: action,
      selectIssue: action,
      selectRecommendation: action,
      setQuadProfile: action,
    })
  }

  /**
   * Computed: Is analysis complete?
   */
  get isComplete(): boolean {
    return this.result !== null
  }

  /**
   * Computed: All detected issues
   */
  get issues(): DetectedIssue[] {
    return this.result?.issues ?? []
  }

  /**
   * Computed: All recommendations
   */
  get recommendations(): Recommendation[] {
    return this.result?.recommendations ?? []
  }

  /**
   * Computed: Flight segments
   */
  get segments(): FlightSegment[] {
    return this.result?.segments ?? []
  }

  /**
   * Computed: Currently selected segment
   */
  get selectedSegment(): FlightSegment | undefined {
    if (!this.selectedSegmentId) return undefined
    return this.segments.find(s => s.id === this.selectedSegmentId)
  }

  /**
   * Computed: Currently selected issue
   */
  get selectedIssue(): DetectedIssue | undefined {
    if (!this.selectedIssueId) return undefined
    return this.issues.find(i => i.id === this.selectedIssueId)
  }

  /**
   * Computed: High severity issues only
   */
  get highSeverityIssues(): DetectedIssue[] {
    return this.issues.filter(i => i.severity === 'high')
  }

  /**
   * Computed: High-priority recommendations
   */
  get highPriorityRecommendations(): Recommendation[] {
    return this.recommendations.filter(r => r.priority >= 7)
  }

  /**
   * Set quad profile manually (triggers re-analysis)
   */
  setQuadProfile = (sizeId: QuadSize): void => {
    this.quadProfile = QUAD_PROFILES[sizeId]
    if (this.logStore.isLoaded) {
      this.analyze()
    }
  }

  /**
   * Run analysis on loaded log
   */
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
      // Auto-detect quad size if not manually overridden
      if (this.logStore.metadata && !this.detectionResult) {
        const detection = detectQuadSize(this.logStore.metadata)
        runInAction(() => {
          this.detectionResult = detection
          this.quadProfile = QUAD_PROFILES[detection.suggestedSize]
        })
      }

      // Simulate async analysis (in reality, rule engine is sync but we want UI feedback)
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

      // Run actual analysis with active profile
      const result = this.ruleEngine.analyzeLog(
        this.logStore.frames,
        this.logStore.metadata!,
        this.quadProfile
      )

      // Log analysis results for debugging
      console.log('Analysis complete:', {
        totalFrames: this.logStore.frames.length,
        duration: this.logStore.metadata!.duration,
        issuesFound: result.issues.length,
        recommendations: result.recommendations.length,
        windows: result.segments.length,
      })

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

  /**
   * Reset analysis state
   */
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
    this.detectionResult = null
  }

  /**
   * Select a flight segment
   */
  selectSegment = (segmentId: string | null): void => {
    this.selectedSegmentId = segmentId
  }

  /**
   * Select an issue and optionally a specific occurrence
   */
  selectIssue = (issueId: string | null, occurrenceIdx?: number): void => {
    this.selectedIssueId = issueId
    this.selectedOccurrenceIdx = occurrenceIdx ?? null
  }

  /**
   * Select a recommendation (for scroll-highlight)
   */
  selectRecommendation = (recId: string | null): void => {
    this.selectedRecommendationId = recId
  }

  /**
   * Get recommendations for a specific issue
   */
  getRecommendationsForIssue(issueId: string): Recommendation[] {
    return this.recommendations.filter(
      r => r.issueId === issueId || r.relatedIssueIds?.includes(issueId)
    )
  }

  /**
   * Get issues in a time range
   */
  getIssuesInTimeRange(startTime: number, endTime: number): DetectedIssue[] {
    return this.issues.filter(
      issue =>
        issue.timeRange[0] <= endTime && issue.timeRange[1] >= startTime
    )
  }
}
