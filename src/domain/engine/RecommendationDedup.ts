import { Recommendation, ParameterChange } from '../types/Analysis'
import { PARAMETER_DISPLAY_NAMES } from '../utils/CliExport'

/**
 * Parse the direction (sign) and magnitude from a recommendedChange string.
 * Returns { sign: +1|-1|0, magnitude: number } or null if unparseable.
 */
export function parseChangeDirection(change: string): { sign: 1 | -1 | 0; magnitude: number } | null {
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

  // Absolute value - no direction
  const absMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/)
  if (absMatch) {
    return { sign: 0, magnitude: parseFloat(absMatch[1]) }
  }

  return null
}

/**
 * Deduplicate recommendations with per-change conflict resolution.
 *
 * Resolves conflicts at the individual parameter+axis level across ALL recommendations,
 * not just those with identical change sets.
 *
 * Algorithm:
 * 1. Index every change by param:axis across all recs
 * 2. For each param:axis with multiple recs: detect conflicts, merge or pick winner
 * 3. Assign each resolved change to the best rec, drop recs with no remaining changes
 */
export function deduplicateRecommendations(recommendations: Recommendation[]): Recommendation[] {
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

  // Phase 2: Resolve each param:axis - assign winner rec + resolved change
  const resolvedByRec = new Map<number, ParameterChange[]>()
  const extraIssuesByRec = new Map<number, Set<string>>()

  for (const [, entries] of byParamAxis) {
    if (entries.length === 1) {
      addResolvedChange(resolvedByRec, entries[0].recIdx, entries[0].change)
      continue
    }

    // Multiple recs touch this param:axis - find winner
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
      const merged = weightedMergeChange(entries.map(e => ({
        change: e.change,
        dir: e.dir,
        rec: recommendations[e.recIdx],
      })))
      if (merged) {
        addResolvedChange(resolvedByRec, winnerIdx, merged)
      }
    } else {
      const winnerEntry = entries.find(e => e.recIdx === winnerIdx)!
      addResolvedChange(resolvedByRec, winnerIdx, winnerEntry.change)
    }

    // Merge issue IDs from losing recs into winner
    for (const e of entries) {
      if (e.recIdx !== winnerIdx) {
        absorbIssueIds(extraIssuesByRec, winnerIdx, recommendations[e.recIdx])
      }
    }
  }

  // Phase 3: Reconstruct recommendations
  const result: Recommendation[] = []
  const titleSeen = new Set<string>()

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i]

    // Title-only recs (no changes) - dedup by title
    if (rec.changes.length === 0) {
      if (titleSeen.has(rec.title)) continue
      titleSeen.add(rec.title)
      result.push(rec)
      continue
    }

    const changes = resolvedByRec.get(i)
    if (!changes || changes.length === 0) continue

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
    let conflictContext: string | undefined
    if (wasModified) {
      const paramNames = changes.map(c => {
        const name = PARAMETER_DISPLAY_NAMES[c.parameter] ?? c.parameter
        const axisLabel = c.axis ? ` on ${c.axis}` : ''
        return `${name}${axisLabel}`
      })
      title = `Adjust ${paramNames.join(', ')}`
      description = `Balanced adjustment based on multiple recommendations.`
      conflictContext = `This value was merged from conflicting recommendations that disagreed on direction.`
    }

    result.push({
      ...rec,
      title,
      description,
      changes,
      relatedIssueIds: allRelated.size > 0 ? Array.from(allRelated) : undefined,
      conflictContext,
    })
  }

  return result
}

function addResolvedChange(map: Map<number, ParameterChange[]>, recIdx: number, change: ParameterChange): void {
  const arr = map.get(recIdx) ?? []
  arr.push(change)
  map.set(recIdx, arr)
}

function absorbIssueIds(map: Map<number, Set<string>>, hostIdx: number, losingRec: Recommendation): void {
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
 */
function weightedMergeChange(
  entries: { change: ParameterChange; dir: ReturnType<typeof parseChangeDirection>; rec: Recommendation }[]
): ParameterChange | null {
  const valid = entries.filter(e => e.dir !== null && e.dir.sign !== 0) as
    { change: ParameterChange; dir: { sign: 1 | -1; magnitude: number }; rec: Recommendation }[]

  if (valid.length === 0) {
    return entries[0]?.change ?? null
  }

  let numerator = 0
  let denominator = 0
  for (const e of valid) {
    numerator += e.dir.sign * e.dir.magnitude * e.rec.confidence
    denominator += e.rec.confidence
  }

  if (denominator === 0) return null
  const netChange = numerator / denominator

  if (Math.abs(netChange) < 0.01) return null

  const sign = netChange > 0 ? '+' : '-'
  const mag = Math.abs(netChange)

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
