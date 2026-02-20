import { DetectedIssue, Recommendation, Axis, CrossAxisContext, IssueType } from '../types/Analysis'
import { generateId } from '../utils/generateId'

/**
 * Issue types that are global by convention (run only on roll to avoid 3x duplicates).
 * Cross-axis analysis is not meaningful for these.
 */
const GLOBAL_ISSUE_TYPES: Set<IssueType> = new Set([
  'cgOffset', 'motorImbalance', 'escDesync', 'voltageSag', 'motorSaturation',
  'thermalDegradation', 'mechanicalEvent',
])

/**
 * Post-processing step: groups deduplicated issues by type, determines which axes
 * are affected, classifies the cross-axis pattern, and generates cross-axis
 * recommendations for notable patterns.
 */
export function correlateAxes(issues: DetectedIssue[]): {
  annotatedIssues: DetectedIssue[]
  crossAxisRecommendations: Recommendation[]
} {
  const crossAxisRecommendations: Recommendation[] = []

  // Group by type
  const byType = new Map<IssueType, DetectedIssue[]>()
  for (const issue of issues) {
    const list = byType.get(issue.type) ?? []
    list.push(issue)
    byType.set(issue.type, list)
  }

  // Annotate each group
  const annotated: DetectedIssue[] = []
  for (const [type, typeIssues] of byType) {
    if (GLOBAL_ISSUE_TYPES.has(type)) {
      // No cross-axis analysis for global-only types
      annotated.push(...typeIssues)
      continue
    }

    const affectedAxes = [...new Set(typeIssues.map(i => i.axis))] as Axis[]
    const context = classifyPattern(affectedAxes)

    // Annotate issues with cross-axis context
    for (const issue of typeIssues) {
      annotated.push({ ...issue, crossAxisContext: context })
    }

    // Generate cross-axis recommendations for notable patterns
    const rec = generateCrossAxisRecommendation(type, typeIssues, context)
    if (rec) crossAxisRecommendations.push(rec)
  }

  return { annotatedIssues: annotated, crossAxisRecommendations }
}

function classifyPattern(affectedAxes: Axis[]): CrossAxisContext {
  const hasRoll = affectedAxes.includes('roll')
  const hasPitch = affectedAxes.includes('pitch')
  const hasYaw = affectedAxes.includes('yaw')
  const count = affectedAxes.length

  if (count === 3) {
    return {
      pattern: 'allAxes',
      affectedAxes,
      description: 'Same issue on all three axes - likely a frame-wide or global configuration problem',
    }
  }

  if (count === 2 && hasRoll && hasPitch) {
    return {
      pattern: 'rollPitchOnly',
      affectedAxes,
      description: 'Affects roll and pitch equally - likely a systematic issue (vibration, filtering, PID balance)',
    }
  }

  if (count === 1 && hasYaw) {
    return {
      pattern: 'yawOnly',
      affectedAxes,
      description: 'Only affects yaw - likely yaw-specific (motor timing, prop torque, yaw PID)',
    }
  }

  if (count === 1) {
    return {
      pattern: 'singleAxis',
      affectedAxes,
      description: `Only affects ${affectedAxes[0]} - check for physical asymmetry or axis-specific PID issues`,
    }
  }

  // 2 axes but not roll+pitch (e.g. roll+yaw or pitch+yaw)
  return {
    pattern: 'asymmetric',
    affectedAxes,
    description: `Asymmetric pattern (${affectedAxes.join(', ')}) - check for physical damage or weight imbalance`,
  }
}

function generateCrossAxisRecommendation(
  type: IssueType,
  issues: DetectedIssue[],
  context: CrossAxisContext,
): Recommendation | undefined {
  // Only generate recs for notable patterns
  if (context.pattern === 'singleAxis' || context.pattern === 'yawOnly') {
    return undefined
  }

  // Use the highest-severity issue as the anchor
  const sevOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
  const anchor = issues.reduce((best, cur) =>
    (sevOrder[cur.severity] ?? 0) > (sevOrder[best.severity] ?? 0) ? cur : best
  )

  if (context.pattern === 'allAxes') {
    return {
      id: generateId(),
      issueId: anchor.id,
      type: 'hardwareCheck',
      priority: 5,
      confidence: Math.min(0.85, anchor.confidence * 0.9),
      category: 'hardware',
      title: `${formatIssueType(type)} detected on all axes`,
      description: context.description,
      rationale:
        'When the same issue appears on all three axes simultaneously, it usually points to a frame-wide cause: vibration, loose hardware, or a global configuration problem rather than an axis-specific tune issue.',
      risks: [
        'May require physical inspection',
        'Could be normal for certain frame types',
      ],
      changes: [],
      expectedImprovement: 'Identifying the root cause can resolve the issue across all axes at once',
    }
  }

  if (context.pattern === 'asymmetric') {
    return {
      id: generateId(),
      issueId: anchor.id,
      type: 'hardwareCheck',
      priority: 4,
      confidence: Math.min(0.75, anchor.confidence * 0.8),
      category: 'hardware',
      title: `Asymmetric ${formatIssueType(type)} pattern`,
      description: context.description,
      rationale:
        'An asymmetric pattern - where one axis is affected but its counterpart is not - often indicates physical asymmetry: a bent prop, damaged motor, loose arm, or uneven weight distribution.',
      risks: [
        'Requires physical inspection',
        'May be normal for asymmetric builds',
      ],
      changes: [],
      expectedImprovement: 'Fixing the mechanical issue eliminates the root cause',
    }
  }

  return undefined
}

function formatIssueType(type: IssueType): string {
  const map: Partial<Record<IssueType, string>> = {
    bounceback: 'Bounceback',
    propwash: 'Propwash',
    midThrottleWobble: 'Mid-throttle wobble',
    highFrequencyNoise: 'High-frequency noise',
    lowFrequencyOscillation: 'Low-frequency oscillation',
    gyroNoise: 'Gyro noise',
    dtermNoise: 'D-term noise',
    feedforwardNoise: 'Feedforward noise',
    highThrottleOscillation: 'High-throttle oscillation',
    underdamped: 'Underdamped tracking',
    overdamped: 'Overdamped tracking',
    overFiltering: 'Over-filtering',
    bearingNoise: 'Bearing noise',
    frameResonance: 'Frame resonance',
    electricalNoise: 'Electrical noise',
    filterMismatch: 'Filter mismatch',
  }
  return map[type] ?? type
}
