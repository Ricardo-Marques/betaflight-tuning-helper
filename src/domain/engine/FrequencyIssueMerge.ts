import { Axis, CrossAxisContext, DetectedIssue, IssueType, Recommendation } from '../types/Analysis'
import { severityRank } from './IssueDeduplication'

/** Issue types eligible for cross-axis frequency merging */
const MERGEABLE_TYPES: Set<IssueType> = new Set(['frameResonance', 'bearingNoise'])

/** Axis display order */
const AXIS_ORDER: Axis[] = ['roll', 'pitch', 'yaw']

/**
 * Merge same-frequency hardware issues across axes into a single entry.
 *
 * Frame resonance and bearing noise are structural problems that manifest on
 * all gyro axes simultaneously. When the same frequency is detected on
 * multiple axes, keep only the most-affected axis and annotate the others.
 */
export function mergeFrequencyIssues(
  issues: DetectedIssue[],
  crossAxisRecommendations: Recommendation[],
): { mergedIssues: DetectedIssue[]; updatedRecommendations: Recommendation[] } {
  const passThrough: DetectedIssue[] = []
  const eligible: DetectedIssue[] = []

  for (const issue of issues) {
    if (MERGEABLE_TYPES.has(issue.type) && issue.metrics.frequency !== undefined) {
      eligible.push(issue)
    } else {
      passThrough.push(issue)
    }
  }

  if (eligible.length === 0) {
    return { mergedIssues: issues, updatedRecommendations: crossAxisRecommendations }
  }

  // Group eligible issues by type
  const byType = new Map<IssueType, DetectedIssue[]>()
  for (const issue of eligible) {
    const list = byType.get(issue.type) ?? []
    list.push(issue)
    byType.set(issue.type, list)
  }

  const idRemap = new Map<string, string>()
  const survivors: DetectedIssue[] = []

  for (const [, group] of byType) {
    const clusters = clusterByFrequency(group)
    for (const cluster of clusters) {
      if (cluster.length === 1) {
        survivors.push(cluster[0])
        continue
      }
      const winner = pickWinner(cluster)
      const allAxes = cluster
        .map(i => i.axis)
        .sort((a, b) => AXIS_ORDER.indexOf(a) - AXIS_ORDER.indexOf(b))

      const crossAxisContext = buildMergedContext(winner.axis, allAxes)
      survivors.push({ ...winner, crossAxisContext })

      for (const loser of cluster) {
        if (loser.id !== winner.id) idRemap.set(loser.id, winner.id)
      }
    }
  }

  const updatedRecommendations = remapRecommendations(crossAxisRecommendations, idRemap)

  return {
    mergedIssues: [...passThrough, ...survivors],
    updatedRecommendations,
  }
}

/**
 * Cluster issues by similar frequency (within ±10% of the running cluster mean).
 * Issues are sorted by frequency first so single-pass grouping works.
 */
function clusterByFrequency(issues: DetectedIssue[]): DetectedIssue[][] {
  const sorted = [...issues].sort(
    (a, b) => (a.metrics.frequency ?? 0) - (b.metrics.frequency ?? 0),
  )
  const clusters: DetectedIssue[][] = []
  let current: DetectedIssue[] = [sorted[0]]
  let clusterMean = sorted[0].metrics.frequency!

  for (let i = 1; i < sorted.length; i++) {
    const freq = sorted[i].metrics.frequency!
    if (Math.abs(freq - clusterMean) / clusterMean <= 0.10) {
      current.push(sorted[i])
      clusterMean = current.reduce((s, iss) => s + iss.metrics.frequency!, 0) / current.length
    } else {
      clusters.push(current)
      current = [sorted[i]]
      clusterMean = freq
    }
  }
  clusters.push(current)
  return clusters
}

/** Build a crossAxisContext for a merged cluster */
function buildMergedContext(winnerAxis: Axis, allAxes: Axis[]): CrossAxisContext {
  const pattern = allAxes.length === 3 ? 'allAxes'
    : allAxes.length === 2 && !allAxes.includes('yaw') ? 'rollPitchOnly'
    : 'asymmetric'

  const description = allAxes.length === 3
    ? `Strongest on ${winnerAxis}, but present on all axes`
    : `Strongest on ${winnerAxis}, also on ${allAxes.filter(a => a !== winnerAxis).join(', ')}`

  return { pattern, affectedAxes: allAxes, description }
}

/** Pick winner: highest severity → highest amplitude → highest confidence */
function pickWinner(cluster: DetectedIssue[]): DetectedIssue {
  return cluster.reduce((best, issue) => {
    const sevDiff = (severityRank[issue.severity] ?? 0) - (severityRank[best.severity] ?? 0)
    if (sevDiff > 0) return issue
    if (sevDiff < 0) return best
    const ampDiff = (issue.metrics.amplitude ?? 0) - (best.metrics.amplitude ?? 0)
    if (ampDiff > 0) return issue
    if (ampDiff < 0) return best
    return issue.confidence > best.confidence ? issue : best
  })
}

/** Remap recommendation issueId / relatedIssueIds from removed issues to their surviving winner */
function remapRecommendations(
  recommendations: Recommendation[],
  idRemap: Map<string, string>,
): Recommendation[] {
  if (idRemap.size === 0) return recommendations

  return recommendations.map(rec => {
    const newIssueId = idRemap.get(rec.issueId) ?? rec.issueId
    const newRelated = rec.relatedIssueIds?.map(id => idRemap.get(id) ?? id)
    return { ...rec, issueId: newIssueId, relatedIssueIds: newRelated }
  })
}
