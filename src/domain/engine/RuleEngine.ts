import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation, AnalysisResult, ParameterChange } from '../types/Analysis'
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
import { PARAMETER_DISPLAY_NAMES } from '../utils/CliExport'

/**
 * Parse the direction (sign) and magnitude from a recommendedChange string.
 * Returns { sign: +1|-1|0, magnitude: number } or null if unparseable.
 */
function parseChangeDirection(change: string): { sign: 1 | -1 | 0; magnitude: number } | null {
  const trimmed = change.trim()

  // Percentage: "+5%", "-10%"
  const pctMatch = trimmed.match(/^([+-])(\d+(?:\.\d+)?)%$/)
  if (pctMatch) {
    return {
      sign: pctMatch[1] === '+' ? 1 : -1,
      magnitude: parseFloat(pctMatch[2]) / 100,
    }
  }

  // Relative: "+0.3", "-0.2", "+10", "-50"
  const relMatch = trimmed.match(/^([+-])(\d+(?:\.\d+)?)$/)
  if (relMatch) {
    return {
      sign: relMatch[1] === '+' ? 1 : -1,
      magnitude: parseFloat(relMatch[2]),
    }
  }

  // Absolute value — no direction
  const absMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/)
  if (absMatch) {
    return { sign: 0, magnitude: parseFloat(absMatch[1]) }
  }

  return null
}

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
  analyzeLog(frames: LogFrame[], metadata: LogMetadata, profile?: QuadProfile): AnalysisResult {
    const activeProfile = profile ?? DEFAULT_PROFILE

    // Segment the log into analysis windows
    const windows = this.segmentLog(frames, metadata)

    // Detect issues using all rules
    const allIssues: DetectedIssue[] = []
    for (const window of windows) {
      const windowIssues = this.analyzeWindow(window, frames, activeProfile)
      allIssues.push(...windowIssues)
    }

    // Deduplicate and merge similar issues
    const deduplicatedIssues = this.deduplicateIssues(allIssues)

    // Generate recommendations and deduplicate
    const recommendations = this.deduplicateRecommendations(
      this.generateRecommendations(deduplicatedIssues, frames, activeProfile)
    )

    // Sort recommendations by priority
    recommendations.sort((a, b) => b.priority - a.priority)

    // Generate summary
    const summary = this.generateSummary(deduplicatedIssues, recommendations)

    // Generate flight segments for UI
    const segments = this.generateFlightSegments(frames, deduplicatedIssues)

    return {
      issues: deduplicatedIssues,
      recommendations,
      summary,
      segments,
    }
  }

  /**
   * Analyze a single window with all applicable rules
   */
  private analyzeWindow(window: AnalysisWindow, frames: LogFrame[], profile: QuadProfile): DetectedIssue[] {
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
      const ruleIssues = rule.detect(window, frames, profile)
      issues.push(...ruleIssues)
    }

    return issues
  }

  /**
   * Generate recommendations for all detected issues
   */
  private generateRecommendations(
    issues: DetectedIssue[],
    frames: LogFrame[],
    profile: QuadProfile
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
      for (const [, typeIssues] of issuesByType) {
        // Find issues this rule can address
        const relevantIssues = typeIssues.filter(issue => rule.issueTypes.includes(issue.type))

        if (relevantIssues.length > 0) {
          const ruleRecommendations = rule.recommend(relevantIssues, frames, profile)
          recommendations.push(...ruleRecommendations)
        }
      }
    }

    return recommendations
  }

  /**
   * Deduplicate recommendations with per-change conflict resolution.
   *
   * Resolves conflicts at the individual parameter+axis level across ALL recommendations,
   * not just those with identical change sets. For example, "Adjust P/D balance on roll"
   * (pidPGain+pidDGain) can conflict with "Reduce D on roll" (pidDGain) — both touch
   * pidDGain:roll and must be resolved together.
   *
   * Algorithm:
   * 1. Index every change by param:axis across all recs
   * 2. For each param:axis with multiple recs: detect conflicts, merge or pick winner
   * 3. Assign each resolved change to the best rec, drop recs with no remaining changes
   * 4. Merged values are rounded to Betaflight's 0.05 slider increments
   */
  private deduplicateRecommendations(recommendations: Recommendation[]): Recommendation[] {
    if (recommendations.length === 0) return []

    type ChangeEntry = {
      change: ParameterChange
      recIdx: number
      dir: ReturnType<typeof parseChangeDirection>
    }

    // Phase 1: Index all changes by param:axis
    const byParamAxis = new Map<string, ChangeEntry[]>()
    for (let i = 0; i < recommendations.length; i++) {
      for (const change of recommendations[i].changes) {
        const key = `${change.parameter}:${change.axis ?? '_global'}`
        const entries = byParamAxis.get(key) ?? []
        entries.push({ change, recIdx: i, dir: parseChangeDirection(change.recommendedChange) })
        byParamAxis.set(key, entries)
      }
    }

    // Phase 2: Resolve each param:axis — assign winner rec + resolved change
    const resolvedByRec = new Map<number, ParameterChange[]>()
    const extraIssuesByRec = new Map<number, Set<string>>()

    for (const [, entries] of byParamAxis) {
      if (entries.length === 1) {
        // Single rec owns this change — keep as-is
        this.addResolvedChange(resolvedByRec, entries[0].recIdx, entries[0].change)
        continue
      }

      // Multiple recs touch this param:axis — find winner
      const winnerIdx = entries.reduce((bestIdx, e) => {
        const best = recommendations[bestIdx]
        const curr = recommendations[e.recIdx]
        if (curr.priority > best.priority) return e.recIdx
        if (curr.priority === best.priority && curr.confidence > best.confidence) return e.recIdx
        return bestIdx
      }, entries[0].recIdx)

      // Check for directional conflicts
      const signs = new Set<number>()
      for (const e of entries) {
        if (e.dir && e.dir.sign !== 0) signs.add(e.dir.sign)
      }
      const hasConflict = signs.has(1) && signs.has(-1)

      if (hasConflict) {
        const merged = this.weightedMergeChange(entries.map(e => ({
          change: e.change,
          dir: e.dir,
          rec: recommendations[e.recIdx],
        })))
        if (merged) {
          this.addResolvedChange(resolvedByRec, winnerIdx, merged)
        }
        // If null, changes cancelled out — no change for anyone
      } else {
        // No conflict — keep the winner's version
        const winnerEntry = entries.find(e => e.recIdx === winnerIdx)!
        this.addResolvedChange(resolvedByRec, winnerIdx, winnerEntry.change)
      }

      // Merge issue IDs from losing recs into winner
      for (const e of entries) {
        if (e.recIdx !== winnerIdx) {
          this.absorbIssueIds(extraIssuesByRec, winnerIdx, recommendations[e.recIdx])
        }
      }
    }

    // Phase 3: Reconstruct recommendations
    const result: Recommendation[] = []
    const titleSeen = new Set<string>()

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i]

      // Title-only recs (no changes) — dedup by title
      if (rec.changes.length === 0) {
        if (titleSeen.has(rec.title)) continue
        titleSeen.add(rec.title)
        result.push(rec)
        continue
      }

      const changes = resolvedByRec.get(i)
      if (!changes || changes.length === 0) continue // all changes absorbed by other recs

      // Build related issue IDs
      const allRelated = new Set(rec.relatedIssueIds ?? [])
      const extra = extraIssuesByRec.get(i)
      if (extra) {
        for (const id of extra) {
          if (id !== rec.issueId) allRelated.add(id)
        }
      }

      // Check if any changes were modified by conflict resolution
      const wasModified = changes.some(c =>
        !rec.changes.some(orig =>
          orig.parameter === c.parameter && orig.axis === c.axis &&
          orig.recommendedChange === c.recommendedChange
        )
      )

      let title = rec.title
      let description = rec.description
      if (wasModified) {
        const paramNames = changes.map(c => {
          const name = PARAMETER_DISPLAY_NAMES[c.parameter] ?? c.parameter
          const axisLabel = c.axis ? ` on ${c.axis}` : ''
          return `${name}${axisLabel}`
        })
        title = `Adjust ${paramNames.join(', ')}`
        description = `Balanced adjustment based on multiple recommendations.`
      }

      result.push({
        ...rec,
        title,
        description,
        changes,
        relatedIssueIds: allRelated.size > 0 ? Array.from(allRelated) : undefined,
      })
    }

    return result
  }

  /** Helper: append a resolved change to a rec's change list */
  private addResolvedChange(map: Map<number, ParameterChange[]>, recIdx: number, change: ParameterChange): void {
    const arr = map.get(recIdx) ?? []
    arr.push(change)
    map.set(recIdx, arr)
  }

  /** Helper: merge a losing rec's issue IDs into the winner */
  private absorbIssueIds(map: Map<number, Set<string>>, hostIdx: number, losingRec: Recommendation): void {
    const set = map.get(hostIdx) ?? new Set()
    set.add(losingRec.issueId)
    if (losingRec.relatedIssueIds) {
      for (const id of losingRec.relatedIssueIds) set.add(id)
    }
    map.set(hostIdx, set)
  }

  /**
   * Weighted-average merge for conflicting changes on the same parameter+axis.
   * Returns null if the net change magnitude is below threshold (cancels out).
   * Values are rounded to Betaflight's 0.05 slider increments.
   */
  private weightedMergeChange(
    entries: { change: ParameterChange; dir: ReturnType<typeof parseChangeDirection>; rec: Recommendation }[]
  ): ParameterChange | null {
    // Filter to entries with parseable directions
    const valid = entries.filter(e => e.dir !== null && e.dir.sign !== 0) as
      { change: ParameterChange; dir: { sign: 1 | -1; magnitude: number }; rec: Recommendation }[]

    if (valid.length === 0) {
      return entries[0]?.change ?? null
    }

    // Weighted average: netChange = sum(sign * mag * confidence) / sum(confidence)
    let numerator = 0
    let denominator = 0
    for (const e of valid) {
      numerator += e.dir.sign * e.dir.magnitude * e.rec.confidence
      denominator += e.rec.confidence
    }

    if (denominator === 0) return null
    const netChange = numerator / denominator

    // Round to nearest Betaflight slider increment (0.05)
    const rounded = Math.round(netChange / 0.05) * 0.05

    // If net change rounds to zero, cancel out
    if (rounded === 0) return null

    const sign = rounded > 0 ? '+' : '-'
    const mag = Math.abs(rounded)

    // Check if original changes were percentage-based
    const isPercent = valid.some(e => e.change.recommendedChange.includes('%'))
    const changeStr = isPercent
      ? `${sign}${(mag * 100).toFixed(0)}%`
      : `${sign}${mag.toFixed(2)}`

    const representative = valid[0].change
    return {
      parameter: representative.parameter,
      axis: representative.axis,
      currentValue: representative.currentValue,
      recommendedChange: changeStr,
      explanation: `Balanced from ${valid.length} recommendations`,
    }
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
        occurrences: group.map(i => i.timeRange),
      })
    }

    return deduplicated
  }

  /**
   * Return the higher of two severity levels
   */
  private maxSeverity(a: DetectedIssue['severity'], b: DetectedIssue['severity']): DetectedIssue['severity'] {
    const order: Record<string, number> = { low: 0, medium: 1, high: 2 }
    return order[a] >= order[b] ? a : b
  }

  /**
   * Generate analysis summary
   */
  private generateSummary(
    issues: DetectedIssue[],
    recommendations: Recommendation[]
  ): any {
    const highCount = issues.filter(i => i.severity === 'high').length
    const mediumCount = issues.filter(i => i.severity === 'medium').length
    const lowCount = issues.filter(i => i.severity === 'low').length

    let overallHealth: 'excellent' | 'good' | 'needsWork' | 'poor'
    if (highCount > 3) {
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
      highIssueCount: highCount,
      mediumIssueCount: mediumCount,
      lowIssueCount: lowCount,
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
        const dur = (last.endTime - last.startTime) / 1_000_000
        last.description = `${last.phase.charAt(0).toUpperCase() + last.phase.slice(1)} (${dur.toFixed(1)}s)`
      } else {
        mergedSegments.push({ ...seg })
      }
    }

    // Recount issues against merged time ranges, expanding collapsed occurrences
    for (const seg of mergedSegments) {
      seg.issueCount = issues.reduce((count, issue) => {
        const occ = issue.occurrences ?? [issue.timeRange]
        return count + occ.filter(tr => tr[0] <= seg.endTime && tr[1] >= seg.startTime).length
      }, 0)
    }

    return mergedSegments
  }
}
