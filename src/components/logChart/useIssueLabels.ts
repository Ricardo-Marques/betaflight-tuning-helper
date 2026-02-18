import { useUIStore, useAnalysisStore } from '../../stores/RootStore'
import { useComputed } from '../../lib/mobx-reactivity'
import type { LogFrame } from '../../domain/types/LogFrame'
import type { DetectedIssue } from '../../domain/types/Analysis'
import type { ChartDataPoint } from './useChartData'

export const CHART_MARGIN_LEFT = 5 + 50 // margin.left + YAxis width
export const CHART_MARGIN_RIGHT = 5     // margin.right

export interface LabelEntry {
  key: string
  pxLeft: number
  text: string
  color: string
  fontSize: number
  fontWeight: string
  issues: DetectedIssue[]
}

interface IssueLabelsResult {
  visibleIssues: DetectedIssue[]
  visibleLabels: LabelEntry[]
}

export function useIssueLabels(
  visibleFrames: LogFrame[],
  chartData: ChartDataPoint[],
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

  const visibleLabels: LabelEntry[] = useComputed(() => {
    if (visibleIssues.length === 0 || containerWidth === 0 || chartData.length < 2) return []

    const MIN_GAP = 60
    const timeStart = chartData[0].time
    const timeEnd = chartData[chartData.length - 1].time
    const timeSpan = timeEnd - timeStart
    if (timeSpan <= 0) return []

    const plotWidth = containerWidth - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT
    const sevOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }

    const entries: { key: string; px: number; isSelected: boolean; sev: number; issue: DetectedIssue }[] = []
    for (const issue of visibleIssues) {
      if (!uiStore.showIssues && issue.id !== analysisStore.selectedIssueId) continue
      const times = issue.occurrences ?? [issue.timeRange]
      const isIssueSelected = issue.id === analysisStore.selectedIssueId
      for (let idx = 0; idx < times.length; idx++) {
        const t = times[idx][0] / 1000000
        const px = CHART_MARGIN_LEFT + ((t - timeStart) / timeSpan) * plotWidth
        const isThisOcc = isIssueSelected && analysisStore.selectedOccurrenceIdx === idx
        entries.push({ key: `${issue.id}-${idx}`, px, isSelected: isThisOcc, sev: sevOrder[issue.severity] ?? 2, issue })
      }
    }

    entries.sort((a, b) => a.px - b.px || a.sev - b.sev || (a.isSelected ? -1 : b.isSelected ? 1 : 0))

    // Greedy selection with stacking
    const result: LabelEntry[] = []
    let lastPx = -Infinity
    let current: { entry: typeof entries[0]; issues: DetectedIssue[]; anySelected: boolean } | null = null

    const flush = (): void => {
      if (!current) return
      const { entry, issues, anySelected } = current
      const stackCount = issues.length - 1
      result.push({
        key: entry.key,
        pxLeft: entry.px,
        text: stackCount > 0 ? `${entry.issue.type} +${stackCount}` : entry.issue.type,
        color: severityColor(entry.issue.severity),
        fontSize: anySelected ? 11 : 9,
        fontWeight: anySelected ? 'bold' : 'normal',
        issues,
      })
    }

    for (const e of entries) {
      if (e.px - lastPx >= MIN_GAP) {
        flush()
        current = { entry: e, issues: [e.issue], anySelected: e.isSelected }
        lastPx = e.px
      } else if (current) {
        if (!current.issues.includes(e.issue)) current.issues.push(e.issue)
        if (e.isSelected) current.anySelected = true
      }
    }
    flush()

    return result
  })

  return { visibleIssues, visibleLabels }
}
