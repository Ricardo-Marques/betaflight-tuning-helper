import { DetectedIssue, Axis, IssueType, TemporalPattern, Severity } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { generateId } from '../utils/generateId'

/** Minimum raw occurrences needed for temporal analysis */
const MIN_OCCURRENCES = 3

/** Minimum flight duration in microseconds (30 seconds) */
const MIN_FLIGHT_DURATION_US = 30_000_000

/** Issue types related to mechanical/motor problems */
const MECHANICAL_ISSUE_TYPES: Set<IssueType> = new Set([
  'bearingNoise', 'frameResonance', 'motorImbalance', 'escDesync', 'highFrequencyNoise',
])

/**
 * Analyzes temporal progression of issues throughout the flight.
 * Uses raw pre-dedup issues to compute trends, then annotates deduplicated issues.
 */
export function analyzeTemporalProgression(
  rawIssues: DetectedIssue[],
  deduplicatedIssues: DetectedIssue[],
  frames: LogFrame[],
  _metadata: LogMetadata,
): { annotatedIssues: DetectedIssue[]; metaIssues: DetectedIssue[] } {
  if (frames.length === 0) {
    return { annotatedIssues: deduplicatedIssues, metaIssues: [] }
  }

  const flightStart = frames[0].time
  const flightEnd = frames[frames.length - 1].time
  const flightDuration = flightEnd - flightStart

  if (flightDuration < MIN_FLIGHT_DURATION_US) {
    return { annotatedIssues: deduplicatedIssues, metaIssues: [] }
  }

  // Group raw issues by type+axis
  const groups = new Map<string, DetectedIssue[]>()
  for (const issue of rawIssues) {
    const key = `${issue.type}-${issue.axis}`
    const list = groups.get(key) ?? []
    list.push(issue)
    groups.set(key, list)
  }

  // Compute temporal pattern for each group
  const patterns = new Map<string, TemporalPattern>()
  for (const [key, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue
    const pattern = classifyTrend(group, flightStart, flightDuration)
    if (pattern) patterns.set(key, pattern)
  }

  // Annotate deduped issues with their temporal patterns
  const annotated = deduplicatedIssues.map(issue => {
    const key = `${issue.type}-${issue.axis}`
    const pattern = patterns.get(key)
    if (!pattern) return issue

    // For earlyOnly + coldStart: reduce severity by one level
    let severity = issue.severity
    if (pattern.trend === 'earlyOnly' && pattern.likelyCause === 'coldStart') {
      severity = reduceSeverity(severity)
    }

    return { ...issue, temporalPattern: pattern, severity }
  })

  const metaIssues = generateMetaIssues(patterns, groups, flightStart, flightEnd)

  return { annotatedIssues: annotated, metaIssues }
}

function classifyTrend(
  group: DetectedIssue[],
  flightStart: number,
  flightDuration: number,
): TemporalPattern | undefined {
  const sorted = [...group].sort((a, b) => a.timeRange[0] - b.timeRange[0])

  // Divide flight into quartiles
  const q1End = flightStart + flightDuration * 0.25
  const halfEnd = flightStart + flightDuration * 0.5
  const q3End = flightStart + flightDuration * 0.75

  const q1 = sorted.filter(i => midpoint(i) < q1End)
  const q2 = sorted.filter(i => midpoint(i) >= q1End && midpoint(i) < halfEnd)
  const q3 = sorted.filter(i => midpoint(i) >= halfEnd && midpoint(i) < q3End)
  const q4 = sorted.filter(i => midpoint(i) >= q3End)

  const total = sorted.length
  const firstHalf = q1.length + q2.length
  const secondHalf = q3.length + q4.length

  // Sudden onset: almost nothing in first half, then issues appear
  if (firstHalf <= 1 && secondHalf >= MIN_OCCURRENCES) {
    return {
      trend: 'suddenOnset',
      description: 'Issues appeared suddenly mid-flight, suggesting something changed during the flight',
      confidence: 0.7,
      likelyCause: 'mechanical',
    }
  }

  // Early only: concentrated in first half, nothing in Q4
  if (firstHalf > total * 0.7 && q4.length === 0) {
    return {
      trend: 'earlyOnly',
      description: 'Issues present mainly at the start of the flight and fade away — likely a warmup effect',
      confidence: 0.65,
      likelyCause: 'coldStart',
    }
  }

  // Late onset: concentrated in second half, nothing in Q1
  if (secondHalf > total * 0.7 && q1.length === 0) {
    return {
      trend: 'lateOnset',
      description: 'Issues appeared later in the flight — could indicate thermal buildup or battery sag',
      confidence: 0.65,
      likelyCause: 'thermal',
    }
  }

  // Linear regression on metric values vs normalized time
  const metrics = sorted.map(i => ({
    t: (midpoint(i) - flightStart) / flightDuration,
    value: getSeverityMetric(i) ?? i.confidence,
  }))
  const slope = linearRegressionSlope(metrics)

  if (slope === undefined) {
    return { trend: 'stable', description: 'Issue severity is consistent throughout the flight', confidence: 0.5 }
  }

  if (slope > 0.3) {
    return {
      trend: 'worsening',
      description: 'This issue gets progressively worse over the flight — may indicate thermal degradation or battery sag',
      confidence: Math.min(0.85, 0.5 + Math.abs(slope) * 0.3),
      likelyCause: 'thermal',
    }
  }

  if (slope < -0.3) {
    return {
      trend: 'improving',
      description: 'This issue improves over the flight — likely a cold-start or warmup effect',
      confidence: Math.min(0.85, 0.5 + Math.abs(slope) * 0.3),
      likelyCause: 'coldStart',
    }
  }

  return { trend: 'stable', description: 'Issue severity is consistent throughout the flight', confidence: 0.5 }
}

function midpoint(issue: DetectedIssue): number {
  return (issue.timeRange[0] + issue.timeRange[1]) / 2
}

function getSeverityMetric(issue: DetectedIssue): number | undefined {
  const m = issue.metrics
  return m.amplitude ?? m.noiseFloor ?? m.overshoot ?? m.rmsError ?? m.motorSaturation
}

function linearRegressionSlope(points: { t: number; value: number }[]): number | undefined {
  const n = points.length
  if (n < 3) return undefined

  let sumT = 0, sumV = 0, sumTV = 0, sumT2 = 0
  for (const { t, value } of points) {
    sumT += t
    sumV += value
    sumTV += t * value
    sumT2 += t * t
  }

  const denom = n * sumT2 - sumT * sumT
  if (Math.abs(denom) < 1e-10) return undefined

  const rawSlope = (n * sumTV - sumT * sumV) / denom

  // Normalize slope relative to mean so different metrics are comparable
  const meanValue = sumV / n
  if (Math.abs(meanValue) < 1e-10) return undefined

  return rawSlope / meanValue
}

function reduceSeverity(severity: Severity): Severity {
  if (severity === 'high') return 'medium'
  return 'low'
}

function generateMetaIssues(
  patterns: Map<string, TemporalPattern>,
  groups: Map<string, DetectedIssue[]>,
  flightStart: number,
  flightEnd: number,
): DetectedIssue[] {
  const metaIssues: DetectedIssue[] = []

  // Thermal degradation: 2+ issue types worsening on same axis
  const worseningByAxis = new Map<Axis, string[]>()
  for (const [key, pattern] of patterns) {
    if (pattern.trend !== 'worsening') continue
    const parts = key.split('-')
    const axis = parts[parts.length - 1] as Axis
    const type = parts.slice(0, -1).join('-')
    const types = worseningByAxis.get(axis) ?? []
    types.push(type)
    worseningByAxis.set(axis, types)
  }

  for (const [axis, types] of worseningByAxis) {
    if (types.length < 2) continue
    metaIssues.push({
      id: generateId(),
      type: 'thermalDegradation',
      severity: 'medium',
      axis,
      timeRange: [flightStart, flightEnd],
      description: `Multiple issues worsening over flight on ${axis}: ${types.join(', ')} — likely thermal degradation`,
      metrics: {},
      confidence: 0.7,
      temporalPattern: {
        trend: 'worsening',
        description: 'Multiple issues degrading simultaneously suggests a thermal root cause',
        confidence: 0.7,
        likelyCause: 'thermal',
      },
    })
  }

  // Mechanical event: sudden onset of mechanical issue types — one per axis
  const mechanicalByAxis = new Map<Axis, string[]>()
  for (const [key, pattern] of patterns) {
    if (pattern.trend !== 'suddenOnset') continue
    const parts = key.split('-')
    const axis = parts[parts.length - 1] as Axis
    const type = parts.slice(0, -1).join('-')
    if (!MECHANICAL_ISSUE_TYPES.has(type as IssueType)) continue
    const types = mechanicalByAxis.get(axis) ?? []
    types.push(type)
    mechanicalByAxis.set(axis, types)
  }

  for (const [axis, types] of mechanicalByAxis) {
    const earliest = Math.min(
      ...types.flatMap(type => {
        const group = groups.get(`${type}-${axis}`)
        return group ? group.map(i => i.timeRange[0]) : []
      })
    )

    metaIssues.push({
      id: generateId(),
      type: 'mechanicalEvent',
      severity: 'high',
      axis,
      timeRange: [earliest, flightEnd],
      description: `Sudden onset of ${types.join(', ')} on ${axis} mid-flight — inspect for physical damage`,
      metrics: {},
      confidence: 0.65,
      temporalPattern: {
        trend: 'suddenOnset',
        description: 'Mechanical issue appeared suddenly, suggesting physical damage or prop strike',
        confidence: 0.65,
        likelyCause: 'mechanical',
      },
    })
  }

  return metaIssues
}
