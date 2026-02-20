import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation, AnalysisResult } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { DEFAULT_PROFILE } from '../profiles/quadProfiles'
import { BouncebackRule } from '../rules/BouncebackRule'
import { PropwashRule } from '../rules/PropwashRule'
import { WobbleRule } from '../rules/WobbleRule'
import { TrackingQualityRule } from '../rules/TrackingQualityRule'
import { MotorSaturationRule } from '../rules/MotorSaturationRule'
import { DTermNoiseRule } from '../rules/DTermNoiseRule'
import { HighThrottleOscillationRule } from '../rules/HighThrottleOscillationRule'
import { GyroNoiseRule } from '../rules/GyroNoiseRule'
import { FeedforwardNoiseRule } from '../rules/FeedforwardNoiseRule'
import { ElectricalNoiseRule } from '../rules/ElectricalNoiseRule'
import { CgOffsetRule } from '../rules/CgOffsetRule'
import { MotorHealthRule } from '../rules/MotorHealthRule'
import { BearingNoiseRule } from '../rules/BearingNoiseRule'
import { FrameResonanceRule } from '../rules/FrameResonanceRule'
import { EscDesyncRule } from '../rules/EscDesyncRule'
import { VoltageSagRule } from '../rules/VoltageSagRule'
import { segmentLog } from './LogSegmenter'
import { deduplicateIssues } from './IssueDeduplication'
import { deduplicateRecommendations } from './RecommendationDedup'
import { generateSummary, generateFlightSegments } from './AnalysisSummary'

/**
 * Central rule engine that orchestrates analysis
 */
export class RuleEngine {
  private rules: TuningRule[] = []

  constructor() {
    this.registerRule(BouncebackRule)
    this.registerRule(PropwashRule)
    this.registerRule(WobbleRule)
    this.registerRule(TrackingQualityRule)
    this.registerRule(MotorSaturationRule)
    this.registerRule(DTermNoiseRule)
    this.registerRule(HighThrottleOscillationRule)
    this.registerRule(GyroNoiseRule)
    this.registerRule(FeedforwardNoiseRule)
    this.registerRule(ElectricalNoiseRule)
    this.registerRule(CgOffsetRule)
    this.registerRule(MotorHealthRule)
    this.registerRule(BearingNoiseRule)
    this.registerRule(FrameResonanceRule)
    this.registerRule(EscDesyncRule)
    this.registerRule(VoltageSagRule)
  }

  registerRule(rule: TuningRule): void {
    this.rules.push(rule)
  }

  analyzeLog(frames: LogFrame[], metadata: LogMetadata, profile?: QuadProfile): AnalysisResult {
    const activeProfile = profile ?? DEFAULT_PROFILE

    const windows = segmentLog(frames, metadata)

    const allIssues: DetectedIssue[] = []
    for (const window of windows) {
      const windowIssues = this.analyzeWindow(window, frames, activeProfile, metadata)
      allIssues.push(...windowIssues)
    }

    return this.finalizeAnalysis(allIssues, frames, activeProfile, metadata)
  }

  /**
   * Async version of analyzeLog that yields between window batches so the UI
   * stays responsive and progress can be reported accurately.
   */
  async analyzeLogAsync(
    frames: LogFrame[],
    metadata: LogMetadata,
    onProgress: (progress: number, message: string) => void,
    profile?: QuadProfile,
  ): Promise<AnalysisResult> {
    const activeProfile = profile ?? DEFAULT_PROFILE

    onProgress(5, 'Segmenting flight data...')
    const windows = segmentLog(frames, metadata)
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const allIssues: DetectedIssue[] = []
    const batchSize = 40
    for (let i = 0; i < windows.length; i++) {
      const windowIssues = this.analyzeWindow(windows[i], frames, activeProfile, metadata)
      allIssues.push(...windowIssues)

      if ((i + 1) % batchSize === 0 || i === windows.length - 1) {
        const progress = 10 + Math.round(((i + 1) / windows.length) * 75)
        onProgress(progress, `Analyzing flight data (${i + 1}/${windows.length})...`)
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      }
    }

    onProgress(90, 'Generating recommendations...')
    await new Promise<void>(resolve => setTimeout(resolve, 0))

    const result = this.finalizeAnalysis(allIssues, frames, activeProfile, metadata)

    onProgress(100, `Analysis complete! Found ${result.issues.length} issues.`)
    return result
  }

  private finalizeAnalysis(
    allIssues: DetectedIssue[],
    frames: LogFrame[],
    profile: QuadProfile,
    metadata: LogMetadata,
  ): AnalysisResult {
    const deduplicatedIssues = deduplicateIssues(allIssues)

    const recommendations = deduplicateRecommendations(
      this.generateRecommendations(deduplicatedIssues, frames, profile, metadata)
    )

    recommendations.sort((a, b) => b.priority - a.priority)

    // Sort issues to align with recommendation order within each severity group
    const issueRecPriority = new Map<string, number>()
    for (const rec of recommendations) {
      const update = (id: string): void => {
        const current = issueRecPriority.get(id) ?? 0
        if (rec.priority > current) issueRecPriority.set(id, rec.priority)
      }
      update(rec.issueId)
      if (rec.relatedIssueIds) {
        for (const id of rec.relatedIssueIds) update(id)
      }
    }

    const sevRank: Record<string, number> = { high: 2, medium: 1, low: 0 }
    deduplicatedIssues.sort((a, b) => {
      const sevDiff = (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0)
      if (sevDiff !== 0) return sevDiff
      const priDiff = (issueRecPriority.get(b.id) ?? 0) - (issueRecPriority.get(a.id) ?? 0)
      if (priDiff !== 0) return priDiff
      return b.confidence - a.confidence
    })

    const summary = generateSummary(deduplicatedIssues, recommendations)
    const segments = generateFlightSegments(frames, deduplicatedIssues)

    return {
      issues: deduplicatedIssues,
      recommendations,
      summary,
      segments,
    }
  }

  private analyzeWindow(window: AnalysisWindow, frames: LogFrame[], profile: QuadProfile, metadata: LogMetadata): DetectedIssue[] {
    const issues: DetectedIssue[] = []

    for (const rule of this.rules) {
      if (!rule.applicableAxes.includes(window.axis)) continue
      if (!rule.condition(window, frames)) continue

      const ruleIssues = rule.detect(window, frames, profile, metadata)

      if (ruleIssues.length > 0) {
        const peakTime = this.findPeakTime(window, frames)
        for (const issue of ruleIssues) {
          issue.metrics.peakTime = peakTime
        }
      }

      issues.push(...ruleIssues)
    }

    return issues
  }

  private findPeakTime(window: AnalysisWindow, frames: LogFrame[]): number {
    const axis = window.axis
    let maxError = -1
    let peakTime = (window.startTime + window.endTime) / 2

    for (const idx of window.frameIndices) {
      const frame = frames[idx]
      if (!frame) continue
      const error = Math.abs(frame.gyroADC[axis] - frame.setpoint[axis])
      if (error > maxError) {
        maxError = error
        peakTime = frame.time
      }
    }

    return peakTime
  }

  private generateRecommendations(
    issues: DetectedIssue[],
    frames: LogFrame[],
    profile: QuadProfile,
    metadata: LogMetadata
  ): Recommendation[] {
    const recommendations: Recommendation[] = []

    const issuesByType = new Map<string, DetectedIssue[]>()
    for (const issue of issues) {
      const existing = issuesByType.get(issue.type) || []
      existing.push(issue)
      issuesByType.set(issue.type, existing)
    }

    for (const rule of this.rules) {
      for (const [, typeIssues] of issuesByType) {
        const relevantIssues = typeIssues.filter(issue => rule.issueTypes.includes(issue.type))
        if (relevantIssues.length > 0) {
          const ruleRecommendations = rule.recommend(relevantIssues, frames, profile, metadata)
          recommendations.push(...ruleRecommendations)
        }
      }
    }

    return recommendations
  }
}
