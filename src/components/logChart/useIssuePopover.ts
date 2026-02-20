import { useTheme } from '@emotion/react'
import { useAnalysisStore } from '../../stores/RootStore'
import { useObservableState, useAutorun } from '../../lib/mobx-reactivity'
import type { DetectedIssue } from '../../domain/types/Analysis'

export interface HoveredIssues {
  issues: DetectedIssue[]
  x: number
  y: number
  /** Cursor time in seconds (from chart x-axis), used to pick closest occurrence when cycling. */
  cursorTimeSec?: number
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
  updateHoverPopover: (hovered: HoveredIssues | null) => void
  refreshPopoverContent: () => void
  showGlow: boolean
}

export function useIssuePopover(
  refs: PopoverRefs,
  severityColor?: (severity: string) => string,
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
    const hasHint = issues.length > 1
    if (hasHint) {
      parts.push(`<div style="break-inside:avoid;border-bottom:1px solid ${theme.colors.border.main};padding-bottom:0.5rem;margin-bottom:0.5rem">
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};font-style:italic">Press Space to cycle through issues</p></div>`)
    }
    issues.forEach((issue, idx) => {
      const isSelected = issue.id === analysisStore.selectedIssueId
      const borderStyle = isSelected
        ? `border-left:3px solid ${sevColor(issue.severity)};padding-left:0.5rem`
        : `border-left:3px solid transparent;padding-left:0.5rem`
      const isLast = idx === issues.length - 1
      const separatorStyle = !isLast
        ? `;border-bottom:1px solid ${theme.colors.border.main};padding-bottom:0.5rem;margin-bottom:0.5rem`
        : ''
      const metrics: string[] = []
      if (issue.metrics.overshoot !== undefined) metrics.push(`<p>Overshoot: ${issue.metrics.overshoot.toFixed(1)}</p>`)
      if (issue.metrics.frequency !== undefined) metrics.push(`<p>Frequency: ${issue.metrics.frequency.toFixed(1)} Hz</p>`)
      if (issue.metrics.amplitude !== undefined) metrics.push(`<p>Amplitude: ${issue.metrics.amplitude.toFixed(1)} deg/s</p>`)
      parts.push(`<div data-issue-id="${issue.id}" style="break-inside:avoid${separatorStyle}"><div style="${borderStyle}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;margin-bottom:0.25rem">
          <p style="font-size:0.875rem;font-weight:500;color:${theme.colors.text.primary}">${issue.description}</p>
          <span style="padding:0.125rem 0.375rem;border-radius:0.25rem;font-size:0.75rem;font-weight:500;flex-shrink:0;background-color:${sevBgColor(issue.severity)};color:${sevTextColor(issue.severity)}">${issue.severity.toUpperCase()}</span>
        </div>
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};margin-bottom:0.25rem">Axis: ${issue.crossAxisContext ? issue.crossAxisContext.description : issue.axis}</p>
        <div style="font-size:0.75rem;color:${theme.colors.text.secondary}">${metrics.join('')}</div>
      </div></div>`)
    })
    return parts.join('')
  }

  const updateHoverPopover = (hovered: HoveredIssues | null): void => {
    refs.hoveredIssuesRef.current = hovered
    refs.popoverSourceRef.current = hovered ? 'hover' : null
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
    el.style.overflow = ''

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
      el.style.overflow = 'auto'
      popoverHeight = maxAvailable
    } else {
      el.style.maxHeight = ''
      el.style.overflow = ''
    }

    const popoverWidth = el.offsetWidth
    el.style.visibility = ''

    // Always place beside the cursor (left or right), never above/below,
    // so the popover never covers the reference line being inspected.
    const GAP = 30
    const rightCandidate = hovered.x + GAP
    const leftCandidate = hovered.x - popoverWidth - GAP
    let leftPos: number
    if (rightCandidate + popoverWidth + VP_MARGIN <= window.innerWidth) {
      leftPos = rightCandidate
    } else if (leftCandidate >= VP_MARGIN) {
      leftPos = leftCandidate
    } else {
      leftPos = hovered.x >= window.innerWidth / 2
        ? Math.max(VP_MARGIN, leftCandidate)
        : Math.min(rightCandidate, window.innerWidth - popoverWidth - VP_MARGIN)
    }
    el.style.left = `${leftPos}px`

    // Vertically center on cursor, clamped to viewport
    el.style.bottom = ''
    let topPos = hovered.y - popoverHeight / 2
    topPos = Math.max(VP_MARGIN, Math.min(topPos, window.innerHeight - popoverHeight - VP_MARGIN))
    el.style.top = `${topPos}px`
  }

  const refreshPopoverContent = (): void => {
    const hovered = refs.hoveredIssuesRef.current
    const el = refs.popoverRef.current
    if (!hovered || !el || el.style.display === 'none') return
    el.innerHTML = buildPopoverHTML(hovered.issues)

    // Scroll the selected issue into view (handles multi-column overflow)
    const selectedId = analysisStore.selectedIssueId
    if (selectedId) {
      const target = el.querySelector(`[data-issue-id="${selectedId}"]`) as HTMLElement | null
      if (target) {
        const isFirst = target === el.querySelector('[data-issue-id]')
        if (isFirst) {
          // Wrap-around: scroll all the way back to the start
          el.scrollTo({ left: 0, behavior: 'smooth' })
        } else {
          const containerRect = el.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const MARGIN = 4
          if (targetRect.left - MARGIN < containerRect.left) {
            el.scrollTo({
              left: Math.max(0, el.scrollLeft + targetRect.left - containerRect.left - MARGIN),
              behavior: 'smooth',
            })
          } else if (targetRect.right + MARGIN > containerRect.right) {
            el.scrollTo({
              left: el.scrollLeft + targetRect.right - containerRect.right + MARGIN,
              behavior: 'smooth',
            })
          }
        }
      }
    }
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

  // Refresh popover content when selected issue changes (keeps hover popover up to date)
  useAutorun(() => {
    void analysisStore.selectedIssueId
    void analysisStore.selectedOccurrenceIdx
    void analysisStore.selectionBump
    if (refs.popoverSourceRef.current === 'hover') {
      refreshPopoverContent()
    }
  })

  return { updateHoverPopover, refreshPopoverContent, showGlow }
}
