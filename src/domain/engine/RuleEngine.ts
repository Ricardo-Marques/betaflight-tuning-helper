import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation, AnalysisResult } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { BouncebackRule } from '../rules/BouncebackRule'
import { PropwashRule } from '../rules/PropwashRule'
import { WobbleRule } from '../rules/WobbleRule'
import { TrackingQualityRule } from '../rules/TrackingQualityRule'
import { MotorSaturationRule } from '../rules/MotorSaturationRule'
import { DTermNoiseRule } from '../rules/DTermNoiseRule'
import { HighThrottleOscillationRule } from '../rules/HighThrottleOscillationRule'
import { GyroNoiseRule } from '../rules/GyroNoiseRule'

/**
 * Central rule engine that orchestrates analysis
 */
export class RuleEngine {
  private rules: TuningRule[] = []

  constructor() {
    // Register built-in rules
    this.registerRule(BouncebackRule)
    this.registerRule(PropwashRule)
    this.registerRule(WobbleRule)
    this.registerRule(TrackingQualityRule)
    this.registerRule(MotorSaturationRule)
    this.registerRule(DTermNoiseRule)
    this.registerRule(HighThrottleOscillationRule)
    this.registerRule(GyroNoiseRule)
  }

  /**
   * Register a tuning rule
   */
  registerRule(rule: TuningRule): void {
    this.rules.push(rule)
  }

  /**
   * Analyze log frames and generate recommendations
   */
  analyzeLog(frames: LogFrame[], metadata: LogMetadata): AnalysisResult {
    // Segment the log into analysis windows
    const windows = this.segmentLog(frames, metadata)

    // Detect issues using all rules
    const allIssues: DetectedIssue[] = []
    for (const window of windows) {
      const windowIssues = this.analyzeWindow(window, frames)
      allIssues.push(...windowIssues)
    }

    // Deduplicate and merge similar issues
    const deduplicatedIssues = this.deduplicateIssues(allIssues)

    // Generate recommendations and deduplicate
    const recommendations = this.deduplicateRecommendations(
      this.generateRecommendations(deduplicatedIssues, frames)
    )

    // Sort recommendations by priority
    recommendations.sort((a, b) => b.priority - a.priority)

    // Generate summary
    const summary = this.generateSummary(deduplicatedIssues, recommendations)

    // Generate flight segments for UI
    const segments = this.generateFlightSegments(frames, deduplicatedIssues)

    return {
      issues: deduplicatedIssues,
      recommendations: recommendations.slice(0, 10), // Top 10 recommendations
      summary,
      segments,
    }
  }

  /**
   * Analyze a single window with all applicable rules
   */
  private analyzeWindow(window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] {
    const issues: DetectedIssue[] = []

    for (const rule of this.rules) {
      // Check if rule applies to this axis
      if (!rule.applicableAxes.includes(window.axis)) {
        continue
      }

      // Check if rule condition is met
      if (!rule.condition(window, frames)) {
        continue
      }

      // Detect issues
      const ruleIssues = rule.detect(window, frames)
      issues.push(...ruleIssues)
    }

    return issues
  }

  /**
   * Generate recommendations for all detected issues
   */
  private generateRecommendations(
    issues: DetectedIssue[],
    frames: LogFrame[]
  ): Recommendation[] {
    const recommendations: Recommendation[] = []

    // Group issues by type
    const issuesByType = new Map<string, DetectedIssue[]>()
    for (const issue of issues) {
      const existing = issuesByType.get(issue.type) || []
      existing.push(issue)
      issuesByType.set(issue.type, existing)
    }

    // Generate recommendations for each issue type
    for (const rule of this.rules) {
      for (const [type, typeIssues] of issuesByType) {
        // Find issues this rule can address
        const relevantIssues = typeIssues.filter(issue => rule.issueTypes.includes(issue.type))

        if (relevantIssues.length > 0) {
          const ruleRecommendations = rule.recommend(relevantIssues, frames)
          recommendations.push(...ruleRecommendations)
        }
      }
    }

    return recommendations
  }

  /**
   * Deduplicate recommendations by parameter+axis, keeping highest priority (confidence as tiebreaker).
   * Two recommendations targeting the same parameter+axis combo are semantic duplicates
   * even if their titles differ (e.g., "Increase P on pitch" vs "Increase P gain on pitch").
   * Falls back to title-based keying for informational recommendations with no changes.
   */
  private deduplicateRecommendations(recommendations: Recommendation[]): Recommendation[] {
    const byKey = new Map<string, Recommendation>()
    for (const rec of recommendations) {
      const key = this.recommendationKey(rec)
      const existing = byKey.get(key)
      if (!existing || rec.priority > existing.priority ||
          (rec.priority === existing.priority && rec.confidence > existing.confidence)) {
        byKey.set(key, rec)
      }
    }
    return Array.from(byKey.values())
  }

  /**
   * Build a deduplication key for a recommendation based on its parameter changes.
   * Recommendations with the same set of parameter+axis targets are considered duplicates.
   */
  private recommendationKey(rec: Recommendation): string {
    if (rec.changes.length === 0) {
      return `title:${rec.title}`
    }
    const parts = rec.changes
      .map(c => `${c.parameter}:${c.axis ?? '_global'}`)
      .sort()
    return parts.join('|')
  }

  /**
   * Segment log into analysis windows
   */
  private segmentLog(frames: LogFrame[], metadata: LogMetadata): AnalysisWindow[] {
    const windows: AnalysisWindow[] = []

    // Calculate frames per 100ms based on actual sample rate
    const sampleRate = metadata.looptime // Already in Hz
    const windowDurationMs = 100 // 100ms windows (more reasonable)
    const windowSize = Math.max(50, Math.floor((sampleRate * windowDurationMs) / 1000))
    const windowStep = Math.floor(windowSize / 2) // 50% overlap

    console.log(`Window size: ${windowSize} frames (${windowDurationMs}ms at ${sampleRate}Hz)`)

    // Debug: Scan entire log for maximum stick input
    const debugAxes: ('roll' | 'pitch' | 'yaw')[] = ['roll', 'pitch', 'yaw']
    for (const axis of debugAxes) {
      const allSetpoints = frames.map(f => Math.abs(f.setpoint[axis]))
      const allRcCommands = frames.map(f => Math.abs(f.rcCommand[axis]))
      const maxSetpoint = Math.max(...allSetpoints)
      const maxRcCommand = Math.max(...allRcCommands)
      console.log(`📊 ${axis.toUpperCase()} - Max setpoint: ${maxSetpoint.toFixed(1)}, Max rcCommand: ${maxRcCommand.toFixed(1)}`)
    }

    const axes: ('roll' | 'pitch' | 'yaw')[] = ['roll', 'pitch', 'yaw']

    for (const axis of axes) {
      for (let i = 0; i < frames.length - windowSize; i += windowStep) {
        const windowFrames = frames.slice(i, i + windowSize)
        const frameIndices = Array.from({ length: windowSize }, (_, idx) => i + idx)

        // Calculate window metadata
        const avgThrottle =
          windowFrames.reduce((sum, f) => sum + f.throttle, 0) / windowFrames.length

        // Use setpoint if available, fallback to rcCommand if setpoint is 0
        const rawSetpointValues = windowFrames.map(f => Math.abs(f.setpoint[axis]))
        const rawRcCommandValues = windowFrames.map(f => Math.abs(f.rcCommand[axis]))
        const usingSetpoint = Math.max(...rawSetpointValues) > 5 // Use setpoint if it has real values

        const setpoints = usingSetpoint ? rawSetpointValues : rawRcCommandValues
        const maxSetpoint = Math.max(...setpoints)
        const rmsSetpoint = Math.sqrt(
          setpoints.reduce((sum, s) => sum + s * s, 0) / setpoints.length
        )

        // Adjust threshold based on what we're using (setpoint in deg/s vs rcCommand in stick units)
        const hasStickInputThreshold = usingSetpoint ? 30 : 10 // Lower threshold for rcCommand
        const hasStickInput = rmsSetpoint > hasStickInputThreshold

        // Debug: Log setpoint values for first few windows to diagnose
        if (i < 5 && axis === 'roll') {
          console.log(`Window ${i} setpoint sample (${axis}):`, {
            setpoint_first5: rawSetpointValues.slice(0, 5),
            rcCommand_first5: rawRcCommandValues.slice(0, 5),
            maxSetpoint: maxSetpoint.toFixed(1),
            rmsSetpoint: rmsSetpoint.toFixed(1),
            threshold: hasStickInputThreshold,
            hasStickInput,
            source: usingSetpoint ? 'setpoint' : 'rcCommand'
          })
        }

        // Simple flight phase detection
        let flightPhase: 'hover' | 'cruise' | 'flip' | 'roll' | 'punch' | 'propwash' | 'idle' | 'unknown'
        if (avgThrottle < 1050) {
          flightPhase = 'idle'
        } else if (maxSetpoint > 400) {
          flightPhase = axis === 'roll' ? 'roll' : 'flip'
        } else if (avgThrottle > 1700 && hasStickInput) {
          flightPhase = 'punch'
        } else if (avgThrottle < 1400 && !hasStickInput) {
          flightPhase = 'propwash'
        } else if (avgThrottle < 1300) {
          flightPhase = 'hover'
        } else {
          flightPhase = 'cruise'
        }

        windows.push({
          startTime: windowFrames[0].time,
          endTime: windowFrames[windowFrames.length - 1].time,
          frameIndices,
          axis,
          metadata: {
            avgThrottle,
            maxSetpoint,
            rmsSetpoint,
            hasStickInput,
            flightPhase,
          },
        })
      }
    }

    return windows
  }

  /**
   * Deduplicate similar issues.
   * Pass 1: merge temporally overlapping/close issues (within 100ms) of the same type+axis.
   * Pass 2: collapse remaining groups so each type+axis appears at most once.
   */
  private deduplicateIssues(issues: DetectedIssue[]): DetectedIssue[] {
    // Group issues by type and axis
    const grouped = new Map<string, DetectedIssue[]>()

    for (const issue of issues) {
      const key = `${issue.type}-${issue.axis}`
      const existing = grouped.get(key) || []
      existing.push(issue)
      grouped.set(key, existing)
    }

    // Pass 1: For each group, merge overlapping/close issues
    const afterTemporalMerge = new Map<string, DetectedIssue[]>()

    for (const [key, group] of grouped) {
      // Sort by time
      group.sort((a, b) => a.timeRange[0] - b.timeRange[0])

      const merged: DetectedIssue[] = []
      let current = group[0]
      for (let i = 1; i < group.length; i++) {
        const next = group[i]

        // If issues overlap or are close (within 100ms), merge them
        if (next.timeRange[0] - current.timeRange[1] < 100000) {
          // Merge: extend time range, average metrics, use higher severity
          current = {
            ...current,
            timeRange: [current.timeRange[0], next.timeRange[1]],
            severity: this.maxSeverity(current.severity, next.severity),
            confidence: (current.confidence + next.confidence) / 2,
          }
        } else {
          merged.push(current)
          current = next
        }
      }
      merged.push(current)
      afterTemporalMerge.set(key, merged)
    }

    // Pass 2: Collapse each type+axis group into a single representative issue
    const deduplicated: DetectedIssue[] = []

    for (const [, group] of afterTemporalMerge) {
      if (group.length === 1) {
        deduplicated.push(group[0])
        continue
      }

      // Multiple entries for the same type+axis — collapse into one
      const representative = group[0]
      const count = group.length
      const highestSeverity = group.reduce<DetectedIssue['severity']>(
        (sev, issue) => this.maxSeverity(sev, issue.severity), 'low'
      )
      const avgConfidence = group.reduce((sum, issue) => sum + issue.confidence, 0) / count
      const timeStart = Math.min(...group.map(i => i.timeRange[0]))
      const timeEnd = Math.max(...group.map(i => i.timeRange[1]))

      // Build worst-case metrics from all entries
      const worstMetrics: typeof representative.metrics = { ...representative.metrics }
      for (const issue of group) {
        const m = issue.metrics
        if (m.overshoot !== undefined)
          worstMetrics.overshoot = Math.max(worstMetrics.overshoot ?? 0, m.overshoot)
        if (m.settlingTime !== undefined)
          worstMetrics.settlingTime = Math.max(worstMetrics.settlingTime ?? 0, m.settlingTime)
        if (m.amplitude !== undefined)
          worstMetrics.amplitude = Math.max(worstMetrics.amplitude ?? 0, m.amplitude)
        if (m.rmsError !== undefined)
          worstMetrics.rmsError = Math.max(worstMetrics.rmsError ?? 0, m.rmsError)
        if (m.dtermActivity !== undefined)
          worstMetrics.dtermActivity = Math.max(worstMetrics.dtermActivity ?? 0, m.dtermActivity)
        if (m.motorSaturation !== undefined)
          worstMetrics.motorSaturation = Math.max(worstMetrics.motorSaturation ?? 0, m.motorSaturation)
        if (m.noiseFloor !== undefined)
          worstMetrics.noiseFloor = Math.max(worstMetrics.noiseFloor ?? 0, m.noiseFloor)
      }

      // Prepend occurrence count to the description
      const description = `${representative.description} (×${count})`

      deduplicated.push({
        ...representative,
        severity: highestSeverity,
        confidence: avgConfidence,
        timeRange: [timeStart, timeEnd],
        description,
        metrics: worstMetrics,
      })
    }

    return deduplicated
  }

  /**
   * Return the higher of two severity levels
   */
  private maxSeverity(a: DetectedIssue['severity'], b: DetectedIssue['severity']): DetectedIssue['severity'] {
    const order: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }
    return order[a] >= order[b] ? a : b
  }

  /**
   * Generate analysis summary
   */
  private generateSummary(
    issues: DetectedIssue[],
    recommendations: Recommendation[]
  ): any {
    const criticalCount = issues.filter(i => i.severity === 'critical').length
    const highCount = issues.filter(i => i.severity === 'high').length
    const mediumCount = issues.filter(i => i.severity === 'medium').length
    const lowCount = issues.filter(i => i.severity === 'low').length

    let overallHealth: 'excellent' | 'good' | 'needsWork' | 'poor'
    if (criticalCount > 0 || highCount > 3) {
      overallHealth = 'poor'
    } else if (highCount > 0 || mediumCount > 5) {
      overallHealth = 'needsWork'
    } else if (mediumCount > 0 || lowCount > 3) {
      overallHealth = 'good'
    } else {
      overallHealth = 'excellent'
    }

    // Top 3 priorities
    const topPriorities = recommendations.slice(0, 3).map(r => r.title)

    return {
      overallHealth,
      criticalIssueCount: criticalCount,
      majorIssueCount: highCount,
      minorIssueCount: mediumCount + lowCount,
      topPriorities,
    }
  }

  /**
   * Generate flight segments for UI
   */
  private generateFlightSegments(
    frames: LogFrame[],
    issues: DetectedIssue[]
  ): any[] {
    const segments: any[] = []
    const segmentSize = 1000 // ~125ms at 8kHz

    for (let i = 0; i < frames.length; i += segmentSize) {
      const segmentFrames = frames.slice(i, Math.min(i + segmentSize, frames.length))
      const startTime = segmentFrames[0].time
      const endTime = segmentFrames[segmentFrames.length - 1].time

      // Count issues in this segment
      const issueCount = issues.filter(
        issue => issue.timeRange[0] <= endTime && issue.timeRange[1] >= startTime
      ).length

      // Simple phase detection
      const avgThrottle =
        segmentFrames.reduce((sum, f) => sum + f.throttle, 0) / segmentFrames.length
      let phase: string
      if (avgThrottle < 1050) phase = 'idle'
      else if (avgThrottle > 1700) phase = 'punch'
      else if (avgThrottle < 1300) phase = 'hover'
      else phase = 'cruise'

      segments.push({
        id: `segment-${i}`,
        startTime,
        endTime,
        phase,
        description: `${phase.charAt(0).toUpperCase() + phase.slice(1)} (${(
          (endTime - startTime) /
          1_000_000
        ).toFixed(1)}s)`,
        issueCount,
      })
    }

    const mergedSegments: typeof segments = []
    for (const seg of segments) {
      const last = mergedSegments[mergedSegments.length - 1]
      if (last && last.phase === seg.phase) {
        last.endTime = seg.endTime
        last.issueCount += seg.issueCount
        const dur = (last.endTime - last.startTime) / 1_000_000
        last.description = `${last.phase.charAt(0).toUpperCase() + last.phase.slice(1)} (${dur.toFixed(1)}s)`
      } else {
        mergedSegments.push({ ...seg })
      }
    }

    return mergedSegments
  }
}
