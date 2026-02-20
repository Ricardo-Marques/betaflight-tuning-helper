import { useUIStore, useAnalysisStore } from '../../stores/RootStore'
import { useComputed } from '../../lib/mobx-reactivity'
import type { LogFrame } from '../../domain/types/LogFrame'
import type { DetectedIssue } from '../../domain/types/Analysis'

export const CHART_MARGIN_LEFT = 5 + 50 // margin.left + YAxis width
export const CHART_MARGIN_RIGHT = 5     // margin.right

export interface LabelOccurrence {
  issue: DetectedIssue
  occIdx: number
}

export interface LabelEntry {
  key: string
  pxLeft: number
  /** Time in seconds of the primary (displayed) occurrence. */
  timeSec: number
  text: string
  color: string
  fontSize: number
  fontWeight: string
  issues: DetectedIssue[]
  issueOccurrences: LabelOccurrence[]
  onAxis: boolean
}

export interface ReferenceLineEntry {
  key: string
  /** Time in seconds for recharts x-axis. */
  x: number
  issue: DetectedIssue
  occIdx: number
  isSelected: boolean
}

interface IssueLabelsResult {
  visibleIssues: DetectedIssue[]
  visibleLabels: LabelEntry[]
  visibleReferenceLines: ReferenceLineEntry[]
}

export function useIssueLabels(
  visibleFrames: LogFrame[],
  containerWidth: number,
  severityColor: (severity: string) => string,
): IssueLabelsResult {
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()

  const visibleIssues = useComputed((): DetectedIssue[] => {
    if (!analysisStore.isComplete || visibleFrames.length === 0) return []

    const startTime = visibleFrames[0].time
    const endTime = visibleFrames[visibleFrames.length - 1].time

    const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const issues = analysisStore.getIssuesInTimeRange(startTime, endTime)
    return issues.sort((a, b) => {
      const aOccs = a.occurrences ?? [a.timeRange]
      const bOccs = b.occurrences ?? [b.timeRange]
      const aFirst = aOccs.find(tr => tr[0] >= startTime && tr[0] <= endTime)?.[0] ?? aOccs[0][0]
      const bFirst = bOccs.find(tr => tr[0] >= startTime && tr[0] <= endTime)?.[0] ?? bOccs[0][0]
      const timeDiff = aFirst - bFirst
      if (timeDiff !== 0) return timeDiff
      return (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2)
    })
  })

  const { visibleLabels, visibleReferenceLines } = useComputed((): { visibleLabels: LabelEntry[]; visibleReferenceLines: ReferenceLineEntry[] } => {
    if (visibleIssues.length === 0 || containerWidth === 0 || visibleFrames.length < 2) return { visibleLabels: [], visibleReferenceLines: [] }

    const MIN_GAP = 60
    const timeStart = visibleFrames[0].time / 1e6
    const timeEnd = visibleFrames[visibleFrames.length - 1].time / 1e6
    const timeSpan = timeEnd - timeStart
    if (timeSpan <= 0) return { visibleLabels: [], visibleReferenceLines: [] }

    const plotWidth = containerWidth - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT
    const sevOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }

    const entries: { key: string; px: number; timeSec: number; isSelected: boolean; sev: number; issue: DetectedIssue; occIdx: number }[] = []
    for (const issue of visibleIssues) {
      if (!uiStore.showIssues && issue.id !== analysisStore.selectedIssueId) continue
      const times = issue.occurrences ?? [issue.timeRange]
      const isIssueSelected = issue.id === analysisStore.selectedIssueId
      for (let idx = 0; idx < times.length; idx++) {
        const t = (issue.peakTimes?.[idx] ?? issue.metrics.peakTime ?? (times[idx][0] + times[idx][1]) / 2) / 1000000
        if (t < timeStart || t > timeEnd) continue
        const px = CHART_MARGIN_LEFT + ((t - timeStart) / timeSpan) * plotWidth
        const isThisOcc = isIssueSelected && analysisStore.selectedOccurrenceIdx === idx
        entries.push({ key: `${issue.id}-${idx}`, px, timeSec: t, isSelected: isThisOcc, sev: sevOrder[issue.severity] ?? 2, issue, occIdx: idx })
      }
    }

    entries.sort((a, b) => a.px - b.px || a.sev - b.sev || (a.isSelected ? -1 : b.isSelected ? 1 : 0))

    // Greedy label selection with stacking
    const labels: LabelEntry[] = []
    let lastPx = -Infinity
    let current: { entry: typeof entries[0]; issues: DetectedIssue[]; occurrences: LabelOccurrence[]; anySelected: boolean } | null = null

    const flush = (): void => {
      if (!current) return
      const { entry, issues, occurrences, anySelected } = current
      // Move the promoted entry's occurrence to the front so clicking
      // the label selects the issue whose name is displayed, not a
      // lower-priority neighbour that happens to be earlier in time.
      const primaryIdx = occurrences.findIndex(
        o => o.issue.id === entry.issue.id && o.occIdx === entry.occIdx
      )
      if (primaryIdx > 0) {
        const [primary] = occurrences.splice(primaryIdx, 1)
        occurrences.unshift(primary)
      }
      const stackCount = issues.length - 1
      labels.push({
        key: entry.key,
        pxLeft: entry.px,
        timeSec: entry.timeSec,
        text: stackCount > 0 ? `${shortLabel(entry.issue)} +${stackCount}` : shortLabel(entry.issue),
        color: severityColor(entry.issue.severity),
        fontSize: anySelected ? 11 : 9,
        fontWeight: anySelected ? 'bold' : 'normal',
        issues,
        issueOccurrences: occurrences,
        onAxis: entry.issue.axis === uiStore.selectedAxis,
      })
    }

    for (const e of entries) {
      if (e.px - lastPx >= MIN_GAP) {
        flush()
        current = { entry: e, issues: [e.issue], occurrences: [{ issue: e.issue, occIdx: e.occIdx }], anySelected: e.isSelected }
        lastPx = e.px
      } else if (current) {
        if (!current.issues.includes(e.issue)) current.issues.push(e.issue)
        current.occurrences.push({ issue: e.issue, occIdx: e.occIdx })
        if (e.isSelected) current.anySelected = true
        // Promote higher-priority entry to be the visible label
        const cur = current.entry
        if (e.isSelected && !cur.isSelected || (!cur.isSelected && e.sev < cur.sev)) {
          current.entry = e
        }
      }
    }
    flush()

    // Derive one reference line per label from its primary occurrence
    const lines: ReferenceLineEntry[] = labels.map(label => {
      const primary = label.issueOccurrences[0]
      return {
        key: label.key,
        x: label.timeSec,
        issue: primary.issue,
        occIdx: primary.occIdx,
        isSelected: label.fontWeight === 'bold',
      }
    })

    // Render order: low severity back, selected front
    lines.sort((a, b) => {
      const aSev = sevOrder[a.issue.severity] ?? 2
      const bSev = sevOrder[b.issue.severity] ?? 2
      return bSev - aSev || (a.isSelected ? 1 : b.isSelected ? -1 : 0)
    })

    return { visibleLabels: labels, visibleReferenceLines: lines }
  })

  return { visibleIssues, visibleLabels, visibleReferenceLines }
}

/** Extract a short label from the issue description prefix (before the colon). */
export function shortLabel(issue: DetectedIssue): string {
  const colonIdx = issue.description.indexOf(':')
  if (colonIdx > 0) {
    return issue.description.slice(0, colonIdx)
  }
  return issue.type
}
