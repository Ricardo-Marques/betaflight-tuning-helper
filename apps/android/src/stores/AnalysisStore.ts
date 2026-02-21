/**
 * AnalysisStore for the Android app.
 *
 * Re-uses the web app's AnalysisStore logic almost verbatim. The only changes:
 * - Import paths point to @bf-tuner/domain (resolved by Metro extraNodeModules)
 * - No ThemeStore dependency
 */
import { makeAutoObservable, runInAction } from 'mobx'
import type { AnalysisResult, DetectedIssue, Recommendation, FlightSegment } from '@bf-tuner/domain/types/Analysis'
import { RuleEngine } from '@bf-tuner/domain/engine/RuleEngine'
import type { QuadProfile } from '@bf-tuner/domain/types/QuadProfile'
import { QUAD_PROFILES, DEFAULT_PROFILE } from '@bf-tuner/domain/profiles/quadProfiles'
import type { LogStore } from './LogStore'

export type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error'
export type AnalysisLevel = 'basic' | 'average' | 'expert'

const ANALYSIS_LEVEL_MULTIPLIER: Record<AnalysisLevel, number> = {
  basic: 4.0,
  average: 1.25,
  expert: 0.5,
}

export class AnalysisStore {
  analysisStatus: AnalysisStatus = 'idle'
  analysisProgress: number = 0
  analysisMessage: string = ''
  result: AnalysisResult | null = null
  selectedIssueId: string | null = null
  selectedRecommendationId: string | null = null
  quadProfile: QuadProfile = DEFAULT_PROFILE
  analysisLevel: AnalysisLevel = 'average'

  private logStore: LogStore
  private ruleEngine: RuleEngine
  private analysisGeneration: number = 0
  private resultCache: Map<string, AnalysisResult> = new Map()

  constructor(logStore: LogStore) {
    this.logStore = logStore
    this.ruleEngine = new RuleEngine()

    makeAutoObservable<this, 'logStore' | 'ruleEngine' | 'analysisGeneration' | 'resultCache'>(this, {
      logStore: false,
      ruleEngine: false,
      analysisGeneration: false,
      resultCache: false,
    })
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

  get selectedIssue(): DetectedIssue | undefined {
    if (!this.selectedIssueId) return undefined
    return this.issues.find(i => i.id === this.selectedIssueId)
  }

  get selectedRecommendation(): Recommendation | undefined {
    if (!this.selectedRecommendationId) return undefined
    return this.recommendations.find(r => r.id === this.selectedRecommendationId)
  }

  get highSeverityIssues(): DetectedIssue[] {
    return this.issues.filter(i => i.severity === 'high')
  }

  get availableProfiles(): QuadProfile[] {
    return Object.values(QUAD_PROFILES)
  }

  setQuadProfile(sizeId: string): void {
    const profile = Object.values(QUAD_PROFILES).find(p => p.id === sizeId)
    if (profile) {
      this.quadProfile = profile
      if (this.logStore.isLoaded) void this.analyze()
    }
  }

  setAnalysisLevel(level: AnalysisLevel): void {
    this.analysisLevel = level
    if (this.logStore.isLoaded) void this.analyze()
  }

  selectIssue(issueId: string | null): void {
    this.selectedIssueId = issueId
    this.selectedRecommendationId = null
  }

  selectRecommendation(recId: string | null): void {
    this.selectedRecommendationId = recId
  }

  getRecommendationsForIssue(issueId: string): Recommendation[] {
    return this.recommendations.filter(
      r => r.issueId === issueId || r.relatedIssueIds?.includes(issueId)
    )
  }

  async analyze(): Promise<void> {
    if (!this.logStore.isLoaded) return

    const cacheKey = `${this.quadProfile.id}:${this.analysisLevel}`
    if (this.resultCache.has(cacheKey)) {
      runInAction(() => {
        this.result = this.resultCache.get(cacheKey)!
        this.analysisStatus = 'complete'
      })
      return
    }

    const generation = ++this.analysisGeneration

    runInAction(() => {
      this.analysisStatus = 'analyzing'
      this.analysisProgress = 0
      this.analysisMessage = 'Analyzing flight data...'
    })

    try {
      const multiplier = ANALYSIS_LEVEL_MULTIPLIER[this.analysisLevel]
      const scaledProfile = {
        ...this.quadProfile,
        thresholds: Object.fromEntries(
          Object.entries(this.quadProfile.thresholds).map(([k, v]) => [k, v * multiplier])
        ) as unknown as typeof this.quadProfile.thresholds,
      }

      const result = await this.ruleEngine.analyzeLogAsync(
        this.logStore.frames,
        this.logStore.metadata!,
        (progress: number, message: string) => {
          if (generation === this.analysisGeneration) {
            runInAction(() => {
              this.analysisProgress = progress
              this.analysisMessage = message
            })
          }
        },
        scaledProfile,
      )

      if (generation !== this.analysisGeneration) return

      runInAction(() => {
        this.result = result
        this.analysisStatus = 'complete'
        this.analysisProgress = 100
      })

      this.resultCache.set(cacheKey, result)
    } catch (error) {
      if (generation !== this.analysisGeneration) return
      runInAction(() => {
        this.analysisStatus = 'error'
        this.analysisMessage = error instanceof Error ? error.message : 'Analysis failed'
      })
    }
  }

  reset(): void {
    runInAction(() => {
      this.result = null
      this.analysisStatus = 'idle'
      this.analysisProgress = 0
      this.analysisMessage = ''
      this.selectedIssueId = null
      this.selectedRecommendationId = null
      this.resultCache.clear()
    })
    this.analysisGeneration++
  }
}
