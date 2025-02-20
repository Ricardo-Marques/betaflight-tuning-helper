import { DetectedIssue, Severity } from '../types/Analysis'

/**
 * Return the higher of two severity levels
 */
const severityRank: Record<string, number> = { low: 0, medium: 1, high: 2 }

export function maxSeverity(a: Severity, b: Severity): Severity {
  return severityRank[a] >= severityRank[b] ? a : b
}

/** Maximum occurrences displayed per collapsed issue */
export const MAX_DISPLAYED_OCCURRENCES = 5

/**
 * Deduplicate similar issues.
 * Pass 1: merge temporally overlapping/close issues (within 100ms) of the same type+axis.
 * Pass 2: collapse remaining groups so each type+axis appears at most once.
 */
export function deduplicateIssues(issues: DetectedIssue[]): DetectedIssue[] {
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
        // Keep peakTime from the higher-confidence detection
        const bestPeakTime = next.confidence > current.confidence
          ? (next.metrics.peakTime ?? current.metrics.peakTime)
          : (current.metrics.peakTime ?? next.metrics.peakTime)
        const better = next.confidence > current.confidence ? next : current
        current = {
          ...better,
          timeRange: [current.timeRange[0], next.timeRange[1]],
          severity: maxSeverity(current.severity, next.severity),
          confidence: (current.confidence + next.confidence) / 2,
          metrics: { ...better.metrics, peakTime: bestPeakTime },
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

    // Multiple entries for the same type+axis - collapse into one
    // Pick the issue with highest severity (then highest confidence) as representative,
    // so its description (which may carry window-specific data like motor number) is correct
    const representative = group.reduce((best, issue) => {
      const bestSev = severityRank[best.severity]
      const issueSev = severityRank[issue.severity]
      if (issueSev > bestSev) return issue
      if (issueSev === bestSev && issue.confidence > best.confidence) return issue
      return best
    })
    const count = group.length
    const highestSeverity = group.reduce<Severity>(
      (sev, issue) => maxSeverity(sev, issue.severity), 'low'
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

    // Limit displayed occurrences to the most confident detections
    const displayed = count > MAX_DISPLAYED_OCCURRENCES
      ? [...group]
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, MAX_DISPLAYED_OCCURRENCES)
          .sort((a, b) => a.timeRange[0] - b.timeRange[0])
      : group

    deduplicated.push({
      ...representative,
      severity: highestSeverity,
      confidence: avgConfidence,
      timeRange: [timeStart, timeEnd],
      description,
      metrics: worstMetrics,
      occurrences: displayed.map(i => i.timeRange),
      peakTimes: displayed.map(i => i.metrics.peakTime ?? (i.timeRange[0] + i.timeRange[1]) / 2),
      ...(count > MAX_DISPLAYED_OCCURRENCES ? { totalOccurrences: count } : {}),
    })
  }

  return deduplicated
}
