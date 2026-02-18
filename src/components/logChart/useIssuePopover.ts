import { useTheme } from '@emotion/react'
import { useAnalysisStore } from '../../stores/RootStore'
import { useObservableState, useAutorun } from '../../lib/mobx-reactivity'
import type { DetectedIssue } from '../../domain/types/Analysis'
import type { ChartDataPoint } from './useChartData'
import { CHART_MARGIN_LEFT, CHART_MARGIN_RIGHT } from './useIssueLabels'

export interface HoveredIssues {
  issues: DetectedIssue[]
  x: number
  y: number
}

export interface PopoverRefs {
  popoverRef: React.RefObject<HTMLDivElement | null>
  hoveredIssuesRef: React.MutableRefObject<HoveredIssues | null>
  popoverSourceRef: React.MutableRefObject<'hover' | 'forced' | null>
  forcedPopoverTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  hoverClearTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  glowTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  chartContainerRef: React.RefObject<HTMLDivElement | null>
}

export interface PopoverActions {
  updateHoverPopover: (hovered: HoveredIssues | null, source?: 'hover' | 'forced') => void
  refreshPopoverContent: () => void
  showGlow: boolean
}

export function useIssuePopover(
  refs: PopoverRefs,
  visibleIssues: DetectedIssue[],
  chartData: ChartDataPoint[],
  containerWidth: number,
  severityColor?: (severity: string) => string,
  chartMountedBox?: { value: boolean },
): PopoverActions {
  const theme = useTheme()
  const analysisStore = useAnalysisStore()
  const [showGlow, setShowGlow] = useObservableState(false)

  const sevColor = severityColor ?? ((severity: string): string =>
    severity === 'high'
      ? theme.colors.severity.high
      : severity === 'medium'
      ? theme.colors.severity.medium
      : theme.colors.severity.low)

  const buildPopoverHTML = (issues: DetectedIssue[]): string => {
    const sevBgColor = (s: string): string =>
      s === 'high' ? theme.colors.severity.highBg
        : s === 'medium' ? theme.colors.severity.mediumBg
        : theme.colors.severity.lowBg
    const sevTextColor = (s: string): string =>
      s === 'high' ? theme.colors.severity.highText
        : s === 'medium' ? theme.colors.severity.mediumText
        : theme.colors.severity.lowText

    const parts: string[] = []
    issues.forEach((issue, idx) => {
      const isSelected = issue.id === analysisStore.selectedIssueId
      const borderStyle = isSelected
        ? `border-left:3px solid ${sevColor(issue.severity)};padding-left:0.5rem;margin-left:-0.25rem`
        : ''
      const divider = idx > 0 ? `<hr style="border:none;border-top:1px solid ${theme.colors.border.main};margin:0.5rem 0"/>` : ''
      const metrics: string[] = []
      if (issue.metrics.overshoot !== undefined) metrics.push(`<p>Overshoot: ${issue.metrics.overshoot.toFixed(1)}</p>`)
      if (issue.metrics.frequency !== undefined) metrics.push(`<p>Frequency: ${issue.metrics.frequency.toFixed(1)} Hz</p>`)
      if (issue.metrics.amplitude !== undefined) metrics.push(`<p>Amplitude: ${issue.metrics.amplitude.toFixed(1)} deg/s</p>`)
      parts.push(`<div style="break-inside:avoid">${divider}<div style="${borderStyle}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;margin-bottom:0.25rem">
          <p style="font-size:0.875rem;font-weight:${isSelected ? 700 : 500};color:${theme.colors.text.primary}">${issue.description}</p>
          <span style="padding:0.125rem 0.375rem;border-radius:0.25rem;font-size:0.75rem;font-weight:500;flex-shrink:0;background-color:${sevBgColor(issue.severity)};color:${sevTextColor(issue.severity)}">${issue.severity.toUpperCase()}</span>
        </div>
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};margin-bottom:0.25rem">Axis: ${issue.axis}</p>
        <div style="font-size:0.75rem;color:${theme.colors.text.secondary}">${metrics.join('')}</div>
      </div></div>`)
    })
    if (issues.length > 1) {
      parts.push(`<div style="break-inside:avoid"><hr style="border:none;border-top:1px solid ${theme.colors.border.main};margin:0.5rem 0"/>
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};font-style:italic">Click to cycle through issues</p></div>`)
    }
    return parts.join('')
  }

  const updateHoverPopover = (hovered: HoveredIssues | null, source: 'hover' | 'forced' = 'hover'): void => {
    refs.hoveredIssuesRef.current = hovered
    refs.popoverSourceRef.current = hovered ? source : null
    const el = refs.popoverRef.current
    if (!el) return
    if (!hovered) {
      el.style.display = 'none'
      return
    }
    el.style.display = ''
    el.style.left = '0px'
    el.style.top = '-9999px'
    el.style.bottom = ''
    el.style.right = ''
    el.style.visibility = 'hidden'
    el.style.columns = ''
    el.style.columnGap = ''
    el.style.maxHeight = ''

    el.innerHTML = buildPopoverHTML(hovered.issues)

    const VP_MARGIN = 8
    const maxAvailable = window.innerHeight - VP_MARGIN * 2

    let popoverHeight = el.offsetHeight

    if (popoverHeight > maxAvailable && hovered.issues.length > 1) {
      el.style.columns = '2 18rem'
      el.style.columnGap = '1rem'
      popoverHeight = el.offsetHeight
    }

    if (popoverHeight > maxAvailable) {
      el.style.maxHeight = `${maxAvailable}px`
      el.style.overflowY = 'auto'
      popoverHeight = maxAvailable
    } else {
      el.style.maxHeight = ''
      el.style.overflowY = ''
    }

    const popoverWidth = el.offsetWidth
    el.style.visibility = ''

    let leftPos: number
    if (source === 'forced') {
      const spaceRight = window.innerWidth - hovered.x - 12
      if (spaceRight >= popoverWidth + VP_MARGIN) {
        leftPos = hovered.x + 12
      } else {
        leftPos = hovered.x - popoverWidth - 12
      }
    } else {
      const rcWrapper = refs.chartContainerRef.current?.querySelector('.recharts-tooltip-wrapper') as HTMLElement | null
      const rcRect = rcWrapper?.getBoundingClientRect()
      if (rcRect && rcRect.width > 0) {
        const rcOnRight = rcRect.left > hovered.x
        leftPos = rcOnRight
          ? rcRect.left - popoverWidth - 8
          : rcRect.right + 8
      } else {
        leftPos = hovered.x + 20
      }
    }
    leftPos = Math.max(VP_MARGIN, Math.min(leftPos, window.innerWidth - popoverWidth - VP_MARGIN))
    el.style.left = `${leftPos}px`

    el.style.bottom = ''
    let topPos: number
    const spaceAbove = hovered.y - 12
    if (spaceAbove >= popoverHeight) {
      topPos = hovered.y - 12 - popoverHeight
    } else {
      topPos = hovered.y + 12
    }
    topPos = Math.max(VP_MARGIN, Math.min(topPos, window.innerHeight - popoverHeight - VP_MARGIN))
    el.style.top = `${topPos}px`
  }

  const refreshPopoverContent = (): void => {
    const hovered = refs.hoveredIssuesRef.current
    const el = refs.popoverRef.current
    if (!hovered || !el || el.style.display === 'none') return
    el.innerHTML = buildPopoverHTML(hovered.issues)
  }

  // Flash glow when selected issue changes (or re-selected)
  useAutorun(() => {
    if (analysisStore.selectedIssueId) {
      void analysisStore.selectedOccurrenceIdx
      void analysisStore.selectionBump
      setShowGlow(true)
      if (refs.glowTimer.current) clearTimeout(refs.glowTimer.current)
      refs.glowTimer.current = setTimeout(() => setShowGlow(false), 1500)
    } else {
      setShowGlow(false)
    }
  })

  // Show forced popover for 2s when an issue is selected (or re-selected)
  useAutorun(() => {
    if (refs.forcedPopoverTimer.current) clearTimeout(refs.forcedPopoverTimer.current)
    const issueId = analysisStore.selectedIssueId
    const occIdx = analysisStore.selectedOccurrenceIdx
    void analysisStore.selectionBump
    // Read chartMountedBox.value to re-fire when DOM element mounts
    const mounted = chartMountedBox?.value ?? true
    if (!issueId || occIdx == null || !mounted || !refs.chartContainerRef.current || chartData.length < 2 || containerWidth === 0) {
      if (!refs.hoveredIssuesRef.current) updateHoverPopover(null)
      return
    }

    if (refs.popoverSourceRef.current === 'hover') {
      refreshPopoverContent()
      return
    }

    const issue = visibleIssues.find(i => i.id === issueId)
    if (!issue) { updateHoverPopover(null); return }
    const times = issue.occurrences ?? [issue.timeRange]
    const occ = times[occIdx]
    if (!occ) { updateHoverPopover(null); return }

    const timeStart = chartData[0].time
    const timeEnd = chartData[chartData.length - 1].time
    const timeSpan = timeEnd - timeStart
    const t = (issue.peakTimes?.[occIdx] ?? issue.metrics.peakTime ?? (occ[0] + occ[1]) / 2) / 1000000
    if (t < timeStart || t > timeEnd) { updateHoverPopover(null); return }

    const plotWidth = containerWidth - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT
    const pxLeft = CHART_MARGIN_LEFT + ((t - timeStart) / timeSpan) * plotWidth
    const rect = refs.chartContainerRef.current.getBoundingClientRect()
    const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const stacked = visibleIssues.filter(vi => {
      const viTimes = vi.occurrences ?? [vi.timeRange]
      return viTimes.some((tr, idx) => {
        const viT = (vi.peakTimes?.[idx] ?? vi.metrics.peakTime ?? (tr[0] + tr[1]) / 2) / 1000000
        return Math.abs(viT - t) < (timeSpan * 0.005)
      })
    }).sort((a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2))
    const issues = stacked.length > 0 ? stacked : [issue]

    updateHoverPopover({
      issues,
      x: rect.left + 16 + pxLeft,
      y: rect.top + rect.height / 2,
    }, 'forced')
    refs.forcedPopoverTimer.current = setTimeout(() => {
      if (refs.popoverSourceRef.current !== 'hover') updateHoverPopover(null)
    }, 2000)
  })

  return { updateHoverPopover, refreshPopoverContent, showGlow }
}
