import { useRef } from 'react'
import { useLogStore, useUIStore, useAnalysisStore } from '../../stores/RootStore'
import { useAutorun } from '../../lib/mobx-reactivity'
import type { DetectedIssue } from '../../domain/types/Analysis'
import type { ChartDataPoint } from './useChartData'
import type { HoveredIssues, PopoverActions } from './useIssuePopover'

export interface InteractionRefs {
  chartContainerRef: React.RefObject<HTMLDivElement | null>
  hoveredIssuesRef: React.MutableRefObject<HoveredIssues | null>
  popoverSourceRef: React.MutableRefObject<'hover' | 'forced' | null>
  popoverRef: React.RefObject<HTMLDivElement | null>
  hoverClearTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  forcedPopoverTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
}

interface InteractionSetters {
  setIsDraggingObs: (v: boolean) => void
  setContainerWidth: (v: number) => void
}

export interface ChartInteractionsResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleChartMouseMove: (state: any, event: React.MouseEvent) => void
  handleChartMouseLeave: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleChartMouseDown: (state: any, event: React.MouseEvent) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleChartMouseUp: (state: any) => void
  handleRangeChange: (newStart: number, newEnd: number) => void
}

export function useChartInteractions(
  refs: InteractionRefs,
  setters: InteractionSetters,
  visibleIssues: DetectedIssue[],
  chartData: ChartDataPoint[],
  isDraggingObs: boolean,
  popoverActions: PopoverActions,
  chartMountedBox: { value: boolean },
): ChartInteractionsResult {
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()

  const { updateHoverPopover, refreshPopoverContent } = popoverActions

  // Drag state refs
  const dragStartX = useRef<number | null>(null)
  const dragStartZoom = useRef<{ start: number; end: number } | null>(null)
  const isDragging = useRef(false)
  const didDrag = useRef(false)
  const lastZoomCommit = useRef(0)
  const pendingZoom = useRef<{ start: number; end: number } | null>(null)

  // ResizeObserver for container width (converted from useEffect)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  useAutorun(() => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
      resizeObserverRef.current = null
    }
    // Read chartMountedBox.value so autorun re-fires when DOM element mounts
    if (!logStore.isLoaded || !chartMountedBox.value) return
    const el = refs.chartContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setters.setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    resizeObserverRef.current = ro
  })

  // Scroll-to-zoom on chart (converted from useEffect)
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  useAutorun(() => {
    wheelCleanupRef.current?.()
    wheelCleanupRef.current = null
    // Read chartMountedBox.value so autorun re-fires when DOM element mounts
    if (!logStore.isLoaded || !chartMountedBox.value) return
    const el = refs.chartContainerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const zs = uiStore.zoomStart
      const ze = uiStore.zoomEnd
      const dur = ze - zs
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const newDur = Math.min(100, Math.max(1, dur * factor))
      const rect = el.getBoundingClientRect()
      const cursorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const center = zs + dur * cursorRatio
      let newStart = center - newDur * cursorRatio
      let newEnd = center + newDur * (1 - cursorRatio)
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      newStart = Math.max(0, newStart)
      newEnd = Math.min(100, newEnd)
      uiStore.setZoom(newStart, newEnd)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    wheelCleanupRef.current = () => el.removeEventListener('wheel', handleWheel)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseMove = (_state: any, event: React.MouseEvent): void => {
    // Drag-to-pan: throttled zoom commits
    if (isDragging.current && dragStartX.current != null && dragStartZoom.current && refs.chartContainerRef.current) {
      const pxDelta = event.clientX - dragStartX.current
      if (Math.abs(pxDelta) > 3) {
        if (!didDrag.current) {
          didDrag.current = true
          updateHoverPopover(null)
          if (refs.hoverClearTimer.current) { clearTimeout(refs.hoverClearTimer.current); refs.hoverClearTimer.current = null }
        }
        if (!isDraggingObs) setters.setIsDraggingObs(true)
      }

      const rect = refs.chartContainerRef.current.getBoundingClientRect()
      const { start: origStart, end: origEnd } = dragStartZoom.current
      const dur = origEnd - origStart
      const pctDelta = -(pxDelta / rect.width) * dur
      let newStart = origStart + pctDelta
      let newEnd = origEnd + pctDelta
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      newStart = Math.max(0, newStart)
      newEnd = Math.min(100, newEnd)
      pendingZoom.current = { start: newStart, end: newEnd }

      const now = performance.now()
      if (now - lastZoomCommit.current > 80) {
        lastZoomCommit.current = now
        uiStore.setZoom(newStart, newEnd)
      }
      return
    }

    if (!_state?.activeLabel || visibleIssues.length === 0) {
      if (refs.hoveredIssuesRef.current && !refs.hoverClearTimer.current) {
        refs.hoverClearTimer.current = setTimeout(() => {
          refs.hoverClearTimer.current = null
          updateHoverPopover(null)
        }, 100)
      }
      return
    }

    const cursorTime = _state.activeLabel as number
    const visibleTimeRange =
      chartData.length > 1
        ? chartData[chartData.length - 1].time - chartData[0].time
        : 1
    const threshold = visibleTimeRange * 0.015

    const nearby: DetectedIssue[] = []
    for (const issue of visibleIssues) {
      if (!uiStore.showIssues && issue.id !== analysisStore.selectedIssueId) continue
      const times = issue.occurrences ?? [issue.timeRange]
      for (const tr of times) {
        const occTime = tr[0] / 1000000
        if (Math.abs(occTime - cursorTime) < threshold) {
          nearby.push(issue)
          break
        }
      }
    }

    if (nearby.length > 0) {
      if (refs.hoverClearTimer.current) {
        clearTimeout(refs.hoverClearTimer.current)
        refs.hoverClearTimer.current = null
      }
      const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
      nearby.sort((a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2))
      const prevIds = refs.hoveredIssuesRef.current?.issues.map(i => i.id).join(',')
      const nextIds = nearby.map(i => i.id).join(',')
      if (prevIds !== nextIds) {
        updateHoverPopover({ issues: nearby, x: event.clientX, y: event.clientY })
      } else if (refs.popoverRef.current) {
        const el = refs.popoverRef.current
        const pw = el.offsetWidth
        const ph = el.offsetHeight
        const M = 8
        const rcW = refs.chartContainerRef.current?.querySelector('.recharts-tooltip-wrapper') as HTMLElement | null
        const rcR = rcW?.getBoundingClientRect()
        let lp: number
        if (rcR && rcR.width > 0) {
          lp = rcR.left > event.clientX ? rcR.left - pw - 8 : rcR.right + 8
        } else {
          lp = event.clientX + 20
        }
        el.style.left = `${Math.max(M, Math.min(lp, window.innerWidth - pw - M))}px`
        el.style.bottom = ''
        let tp = event.clientY - 12 >= ph ? event.clientY - 12 - ph : event.clientY + 12
        tp = Math.max(M, Math.min(tp, window.innerHeight - ph - M))
        el.style.top = `${tp}px`
      }
    } else {
      if (refs.hoveredIssuesRef.current && !refs.hoverClearTimer.current) {
        refs.hoverClearTimer.current = setTimeout(() => {
          refs.hoverClearTimer.current = null
          updateHoverPopover(null)
        }, 100)
      }
    }
  }

  const handleChartMouseLeave = (): void => {
    if (refs.hoverClearTimer.current) { clearTimeout(refs.hoverClearTimer.current); refs.hoverClearTimer.current = null }
    updateHoverPopover(null)
    if (isDragging.current) {
      isDragging.current = false
      didDrag.current = false
      setters.setIsDraggingObs(false)
      dragStartX.current = null
      dragStartZoom.current = null
      if (pendingZoom.current) {
        uiStore.setZoom(pendingZoom.current.start, pendingZoom.current.end)
        pendingZoom.current = null
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseDown = (_state: any, event: React.MouseEvent): void => {
    isDragging.current = true
    didDrag.current = false
    dragStartX.current = event.clientX
    dragStartZoom.current = { start: uiStore.zoomStart, end: uiStore.zoomEnd }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseUp = (state: any): void => {
    const wasDrag = didDrag.current
    isDragging.current = false
    didDrag.current = false
    setters.setIsDraggingObs(false)
    dragStartX.current = null
    dragStartZoom.current = null
    if (pendingZoom.current) {
      uiStore.setZoom(pendingZoom.current.start, pendingZoom.current.end)
      pendingZoom.current = null
    }

    if (wasDrag) return

    if (!state?.activeLabel) return
    const clickTime = state.activeLabel as number
    const visibleTimeRange = chartData.length > 1
      ? chartData[chartData.length - 1].time - chartData[0].time
      : 1
    const threshold = visibleTimeRange * 0.015

    const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const nearbyClicks: { issue: DetectedIssue; occIdx: number }[] = []
    for (const issue of visibleIssues) {
      const times = issue.occurrences ?? [issue.timeRange]
      for (let tIdx = 0; tIdx < times.length; tIdx++) {
        const occTime = times[tIdx][0] / 1000000
        if (Math.abs(occTime - clickTime) < threshold) {
          nearbyClicks.push({ issue, occIdx: tIdx })
          break
        }
      }
    }

    if (nearbyClicks.length === 0) return

    nearbyClicks.sort((a, b) => (sevRank[a.issue.severity] ?? 2) - (sevRank[b.issue.severity] ?? 2))

    const currentIdx = nearbyClicks.findIndex(n => n.issue.id === analysisStore.selectedIssueId)
    let pick: typeof nearbyClicks[0]
    if (currentIdx < 0) {
      pick = nearbyClicks[0]
    } else {
      pick = nearbyClicks[(currentIdx + 1) % nearbyClicks.length]
    }

    analysisStore.selectIssue(pick.issue.id, pick.occIdx)
    refreshPopoverContent()
    uiStore.setActiveRightTab('issues')
    if (!uiStore.rightPanelOpen) uiStore.toggleRightPanel()
  }

  const handleRangeChange = (newStart: number, newEnd: number): void => {
    uiStore.setZoom(newStart, newEnd)
  }

  return {
    handleChartMouseMove,
    handleChartMouseLeave,
    handleChartMouseDown,
    handleChartMouseUp,
    handleRangeChange,
  }
}
