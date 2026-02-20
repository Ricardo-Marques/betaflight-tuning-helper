import { useRef } from 'react'
import { useTheme } from '@emotion/react'
import { useLogStore, useUIStore, useAnalysisStore } from '../../stores/RootStore'
import { useAutorun } from '../../lib/mobx-reactivity'
import type { LogFrame } from '../../domain/types/LogFrame'
import type { HoveredIssues, PopoverActions } from './useIssuePopover'
import type { LabelEntry } from './useIssueLabels'

export interface InteractionRefs {
  chartContainerRef: React.RefObject<HTMLDivElement | null>
  hoveredIssuesRef: React.MutableRefObject<HoveredIssues | null>
  popoverSourceRef: React.MutableRefObject<'hover' | 'forced' | null>
  popoverRef: React.RefObject<HTMLDivElement | null>
  hoverClearTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  forcedPopoverTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  dataTooltipRef: React.RefObject<HTMLDivElement | null>
}

interface InteractionSetters {
  setIsDraggingObs: (v: boolean) => void
  setTooltipSuppressed: (v: boolean) => void
  setContainerWidth: (v: number) => void
  triggerFullZoomHint: () => void
  triggerMaxZoomHint: () => void
  triggerEdgeHint: () => void
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
  /** Timestamp (performance.now) until which popovers should stay suppressed after zoom/pan ends. */
  popoverCooldownUntil: React.MutableRefObject<number>
}

const PLOT_MARGIN_LEFT = 5 + 65 // chart margin.left + YAxis width
const PLOT_MARGIN_RIGHT = 5     // chart margin.right

/**
 * If the data tooltip and issue popover overlap, nudge the data tooltip:
 * 1. Move data tooltip to the opposite side of the cursor (it's narrower and may fit)
 * 2. Stack vertically above or below the issue popover
 * 3. Place side-by-side adjacent to the issue popover
 */
export function resolveTooltipCollision(
  dtEl: HTMLDivElement | null,
  popEl: HTMLDivElement | null,
  cursorX: number,
  cursorY: number,
): void {
  if (!dtEl || !popEl) return
  if (dtEl.style.display === 'none' || popEl.style.display === 'none') return

  const dtR = dtEl.getBoundingClientRect()
  const popR = popEl.getBoundingClientRect()

  // No collision — rects don't intersect
  if (dtR.right <= popR.left || dtR.left >= popR.right ||
      dtR.bottom <= popR.top || dtR.top >= popR.bottom) return

  const M = 8  // viewport margin
  const G = 8  // gap between stacked elements
  const CURSOR_GAP = 30 // gap from cursor (matches main positioning)

  // --- Try opposite side of cursor (data tooltip is narrower, may fit) ---
  const dtOnLeft = dtR.left + dtR.width / 2 < cursorX
  if (dtOnLeft) {
    // Currently LEFT of cursor — try RIGHT
    const rightPos = cursorX + CURSOR_GAP
    if (rightPos + dtR.width + M <= window.innerWidth) {
      dtEl.style.left = `${rightPos}px`
      return
    }
  } else {
    // Currently RIGHT of cursor — try LEFT
    const leftPos = cursorX - dtR.width - CURSOR_GAP
    if (leftPos >= M) {
      dtEl.style.left = `${leftPos}px`
      return
    }
  }

  // --- Try vertical stacking (keep same horizontal position) ---
  const aboveTop = popR.top - dtR.height - G
  const belowTop = popR.bottom + G
  const fitsAbove = aboveTop >= M
  const fitsBelow = belowTop + dtR.height <= window.innerHeight - M

  if (fitsAbove && fitsBelow) {
    // Both fit — prefer side away from cursor so it doesn't block the chart
    dtEl.style.top = `${cursorY < popR.top + popR.height / 2 ? belowTop : aboveTop}px`
    return
  }
  if (fitsAbove) { dtEl.style.top = `${aboveTop}px`; return }
  if (fitsBelow) { dtEl.style.top = `${belowTop}px`; return }

  // --- Vertical stacking doesn't fit — try side-by-side next to popover ---
  const adjLeft = popR.left - dtR.width - G
  const adjRight = popR.right + G
  const fitsAdjLeft = adjLeft >= M
  const fitsAdjRight = adjRight + dtR.width <= window.innerWidth - M

  if (fitsAdjLeft || fitsAdjRight) {
    dtEl.style.left = `${fitsAdjLeft ? adjLeft : adjRight}px`
    let top = cursorY - dtR.height / 2
    top = Math.max(M, Math.min(top, window.innerHeight - dtR.height - M))
    dtEl.style.top = `${top}px`
    return
  }

  // Last resort: push above or below, clamped to viewport
  dtEl.style.top = cursorY < window.innerHeight / 2
    ? `${Math.min(belowTop, window.innerHeight - dtR.height - M)}px`
    : `${Math.max(M, aboveTop)}px`
}

export function useChartInteractions(
  refs: InteractionRefs,
  setters: InteractionSetters,
  visibleLabels: LabelEntry[],
  visibleFrames: LogFrame[],
  isDraggingObs: boolean,
  popoverActions: PopoverActions,
  chartMountedBox: { value: boolean },
): ChartInteractionsResult {
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()
  const theme = useTheme()

  const { updateHoverPopover, refreshPopoverContent } = popoverActions

  // Drag state refs
  const dragStartX = useRef<number | null>(null)
  const dragStartZoom = useRef<{ start: number; end: number } | null>(null)
  const isDragging = useRef(false)
  const didDrag = useRef(false)
  const edgeHintShown = useRef(false)
  const pendingZoom = useRef<{ start: number; end: number } | null>(null)
  const rafId = useRef<number | null>(null)
  const wheelEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Popover/tooltip suppression cooldown — extends beyond isDraggingObs so short pauses
  // between scroll bursts don't flash popovers or the data tooltip.
  const popoverCooldownUntil = useRef(0)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMousePos = useRef<{ x: number; y: number } | null>(null)

  const COOLDOWN_MS = 300

  const startCooldown = (): void => {
    popoverCooldownUntil.current = performance.now() + COOLDOWN_MS
    setters.setTooltipSuppressed(true)
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
    cooldownTimer.current = setTimeout(() => {
      cooldownTimer.current = null
      popoverCooldownUntil.current = 0
      setters.setTooltipSuppressed(false)
      // Re-trigger hover detection at the last known cursor position so the
      // popover appears without requiring the user to move the mouse.
      const surface = refs.chartContainerRef.current?.querySelector('.recharts-surface')
      if (surface && lastMousePos.current) {
        surface.dispatchEvent(new MouseEvent('mousemove', {
          clientX: lastMousePos.current.x,
          clientY: lastMousePos.current.y,
          bubbles: true,
        }))
      }
    }, COOLDOWN_MS)
  }

  // Schedules a single RAF to commit the pending zoom. Coalesces rapid calls
  // into one paint-aligned commit, naturally adapting to machine speed.
  const commitViaRaf = (): void => {
    if (rafId.current !== null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      if (pendingZoom.current) {
        uiStore.setZoom(pendingZoom.current.start, pendingZoom.current.end)
      }
    })
  }

  const cancelRaf = (): void => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
  }

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
      // Chain from pending zoom so consecutive ticks accumulate correctly
      const zs = pendingZoom.current?.start ?? uiStore.zoomStart
      const ze = pendingZoom.current?.end ?? uiStore.zoomEnd
      const dur = ze - zs
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const minZoomPct = logStore.duration > 0 ? (0.2 / logStore.duration) * 100 : 1
      const newDur = Math.min(100, Math.max(minZoomPct, dur * factor))

      // At full zoom trying to zoom out further — show hint
      if (dur >= 99.99 && newDur >= 99.99) {
        setters.triggerFullZoomHint()
      }
      // At max zoom trying to zoom in further — show hint
      if (dur <= minZoomPct + 0.01 && newDur <= minZoomPct + 0.01 && e.deltaY < 0) {
        setters.triggerMaxZoomHint()
      }

      const rect = el.getBoundingClientRect()
      const plotWidth = rect.width - PLOT_MARGIN_LEFT - PLOT_MARGIN_RIGHT
      const cursorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left - PLOT_MARGIN_LEFT) / plotWidth))
      const center = zs + dur * cursorRatio
      let newStart = center - newDur * cursorRatio
      let newEnd = center + newDur * (1 - cursorRatio)
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      newStart = Math.max(0, newStart)
      newEnd = Math.min(100, newEnd)

      // Activate downsampling + Y-lerp on first wheel tick; dismiss popovers
      if (!isDraggingObs) {
        // Cancel any stale cooldown from a previous gesture so it doesn't
        // clear tooltipSuppressed mid-scroll
        if (cooldownTimer.current) { clearTimeout(cooldownTimer.current); cooldownTimer.current = null }
        setters.setIsDraggingObs(true)
        setters.setTooltipSuppressed(true)
        updateHoverPopover(null)
        if (refs.hoverClearTimer.current) { clearTimeout(refs.hoverClearTimer.current); refs.hoverClearTimer.current = null }
        const dtEl = refs.dataTooltipRef.current
        if (dtEl) dtEl.style.display = 'none'
      }
      pendingZoom.current = { start: newStart, end: newEnd }

      // RAF-based commit — naturally adapts to machine speed
      commitViaRaf()

      // Debounce wheel-end: flush pending + restore full resolution
      if (wheelEndTimer.current) clearTimeout(wheelEndTimer.current)
      wheelEndTimer.current = setTimeout(() => {
        wheelEndTimer.current = null
        cancelRaf()
        if (pendingZoom.current) {
          uiStore.setZoom(pendingZoom.current.start, pendingZoom.current.end)
          pendingZoom.current = null
        }
        startCooldown()
        setters.setIsDraggingObs(false)
      }, 150)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    wheelCleanupRef.current = () => {
      el.removeEventListener('wheel', handleWheel)
      if (wheelEndTimer.current) { clearTimeout(wheelEndTimer.current); wheelEndTimer.current = null }
    }
  })

  // Spacebar to cycle through issues in the visible popover
  const spaceCleanupRef = useRef<(() => void) | null>(null)
  useAutorun(() => {
    spaceCleanupRef.current?.()
    spaceCleanupRef.current = null
    if (!chartMountedBox.value) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return
      const hovered = refs.hoveredIssuesRef.current
      const popoverEl = refs.popoverRef.current
      if (!hovered || hovered.issues.length < 2 || !popoverEl || popoverEl.style.display === 'none') return

      e.preventDefault()
      e.stopImmediatePropagation()
      const issues = hovered.issues
      const currentIdx = issues.findIndex(i => i.id === analysisStore.selectedIssueId)
      const nextIssue = currentIdx < 0 ? issues[0] : issues[(currentIdx + 1) % issues.length]

      // Find the occurrence closest to the cursor position
      const times = nextIssue.occurrences ?? [nextIssue.timeRange]
      const cursorUs = (hovered.cursorTimeSec ?? 0) * 1e6
      let bestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < times.length; i++) {
        const peak = nextIssue.peakTimes?.[i] ?? nextIssue.metrics.peakTime ?? (times[i][0] + times[i][1]) / 2
        const dist = Math.abs(peak - cursorUs)
        if (dist < bestDist) { bestDist = dist; bestIdx = i }
      }

      analysisStore.selectIssue(nextIssue.id, bestIdx)
      refreshPopoverContent()
      uiStore.setActiveRightTab('issues')
      if (!uiStore.rightPanelOpen) uiStore.toggleRightPanel()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    spaceCleanupRef.current = () => document.removeEventListener('keydown', handleKeyDown, true)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseMove = (_state: any, event: React.MouseEvent): void => {
    lastMousePos.current = { x: event.clientX, y: event.clientY }

    // Drag-to-pan: throttled zoom commits
    if (isDragging.current && dragStartX.current != null && dragStartZoom.current && refs.chartContainerRef.current) {
      const dtEl = refs.dataTooltipRef.current
      if (dtEl) dtEl.style.display = 'none'
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

      // Full zoom pan — keep reminding (triggerZoomHint dedupes animation)
      if (dur >= 99.99) {
        setters.triggerFullZoomHint()
      // Edge hit — one-shot per drag gesture
      } else if (!edgeHintShown.current && (newStart < 0 || newEnd > 100)) {
        edgeHintShown.current = true
        setters.triggerEdgeHint()
      }

      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      newStart = Math.max(0, newStart)
      newEnd = Math.min(100, newEnd)
      pendingZoom.current = { start: newStart, end: newEnd }

      // RAF-based commit — naturally adapts to machine speed
      commitViaRaf()
      return
    }

    // Suppress hover popovers during active wheel zoom and briefly after zoom/pan ends
    if (wheelEndTimer.current || performance.now() < popoverCooldownUntil.current) {
      const dtEl = refs.dataTooltipRef.current
      if (dtEl) dtEl.style.display = 'none'
      return
    }

    // Update data tooltip (gyro/setpoint/PID values at cursor)
    const dtEl = refs.dataTooltipRef.current
    if (dtEl) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = _state?.activePayload as Array<{ name: string; value: number; color: string }> | undefined
      if (!payload?.length) {
        dtEl.style.display = 'none'
      } else {
        const timeVal = _state.activeLabel as number
        const timeFmt = timeVal >= 60
          ? `${Math.floor(timeVal / 60)}m:${(timeVal % 60).toFixed(3).padStart(6, '0')}s`
          : `${timeVal.toFixed(3)}s`
        let html = `<div style="font-weight:500;margin-bottom:2px;color:${theme.colors.text.primary}">${timeFmt}</div>`
        for (const entry of payload) {
          if (entry.value == null) continue
          const val = typeof entry.value === 'number' ? entry.value.toFixed(1) : String(entry.value)
          html += `<div style="display:flex;align-items:center;gap:6px;color:${entry.color}"><span style="display:inline-block;width:10px;height:3px;background:${entry.color};border-radius:1px;flex-shrink:0"></span>${entry.name} : ${val}</div>`
        }
        dtEl.innerHTML = html
        dtEl.style.display = ''
        dtEl.style.visibility = 'hidden'

        const DT_GAP = 30
        const VP_M = 8
        const dtWidth = dtEl.offsetWidth
        const dtHeight = dtEl.offsetHeight
        // Prefer LEFT of cursor (issue popover prefers RIGHT) to avoid collisions
        const leftCand = event.clientX - dtWidth - DT_GAP
        const rightCand = event.clientX + DT_GAP
        let dtLeft: number
        if (leftCand >= VP_M) {
          dtLeft = leftCand
        } else if (rightCand + dtWidth + VP_M <= window.innerWidth) {
          dtLeft = rightCand
        } else {
          dtLeft = event.clientX <= window.innerWidth / 2
            ? Math.min(rightCand, window.innerWidth - dtWidth - VP_M)
            : Math.max(VP_M, leftCand)
        }
        dtEl.style.left = `${dtLeft}px`
        let dtTop = event.clientY - dtHeight / 2
        dtTop = Math.max(VP_M, Math.min(dtTop, window.innerHeight - dtHeight - VP_M))
        dtEl.style.top = `${dtTop}px`
        dtEl.style.visibility = ''
      }
    }

    if (!_state?.activeLabel || visibleLabels.length === 0) {
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
      visibleFrames.length > 1
        ? (visibleFrames[visibleFrames.length - 1].time - visibleFrames[0].time) / 1e6
        : 1
    const threshold = visibleTimeRange * 0.015

    // Find the closest visible label — its stacked issues are the popover group.
    // This keeps the group stable as the cursor moves (labels don't shift).
    let closestLabel: LabelEntry | null = null
    let closestDist = Infinity
    for (const label of visibleLabels) {
      const dist = Math.abs(label.timeSec - cursorTime)
      if (dist < threshold && dist < closestDist) {
        closestDist = dist
        closestLabel = label
      }
    }

    if (closestLabel) {
      if (refs.hoverClearTimer.current) {
        clearTimeout(refs.hoverClearTimer.current)
        refs.hoverClearTimer.current = null
      }
      const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
      const issues = [...closestLabel.issues].sort((a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2))
      const prevIds = refs.hoveredIssuesRef.current?.issues.map(i => i.id).join(',')
      const nextIds = issues.map(i => i.id).join(',')
      if (prevIds !== nextIds) {
        updateHoverPopover({ issues, x: event.clientX, y: event.clientY, cursorTimeSec: cursorTime })
      } else if (refs.popoverRef.current) {
        const el = refs.popoverRef.current
        const pw = el.offsetWidth
        const ph = el.offsetHeight
        const M = 8
        const GAP = 30
        const rightCandidate = event.clientX + GAP
        const leftCandidate = event.clientX - pw - GAP
        let lp: number
        if (rightCandidate + pw + M <= window.innerWidth) {
          lp = rightCandidate
        } else if (leftCandidate >= M) {
          lp = leftCandidate
        } else {
          lp = event.clientX >= window.innerWidth / 2
            ? Math.max(M, leftCandidate)
            : Math.min(rightCandidate, window.innerWidth - pw - M)
        }
        el.style.left = `${lp}px`
        el.style.bottom = ''
        let tp = event.clientY - ph / 2
        tp = Math.max(M, Math.min(tp, window.innerHeight - ph - M))
        el.style.top = `${tp}px`
      }
      resolveTooltipCollision(refs.dataTooltipRef.current, refs.popoverRef.current, event.clientX, event.clientY)
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
    lastMousePos.current = null
    if (refs.hoverClearTimer.current) { clearTimeout(refs.hoverClearTimer.current); refs.hoverClearTimer.current = null }
    updateHoverPopover(null)
    const dtLeave = refs.dataTooltipRef.current
    if (dtLeave) dtLeave.style.display = 'none'
    if (isDragging.current) {
      isDragging.current = false
      didDrag.current = false
      setters.setIsDraggingObs(false)
      dragStartX.current = null
      dragStartZoom.current = null
      cancelRaf()
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
    edgeHintShown.current = false
    dragStartX.current = event.clientX
    dragStartZoom.current = { start: uiStore.zoomStart, end: uiStore.zoomEnd }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseUp = (state: any): void => {
    const wasDrag = didDrag.current
    isDragging.current = false
    didDrag.current = false
    dragStartX.current = null
    dragStartZoom.current = null
    cancelRaf()
    if (pendingZoom.current) {
      uiStore.setZoom(pendingZoom.current.start, pendingZoom.current.end)
      pendingZoom.current = null
    }

    if (wasDrag) {
      startCooldown()
      setters.setIsDraggingObs(false)
      return
    }
    setters.setIsDraggingObs(false)

    if (!state?.activeLabel) {
      if (analysisStore.selectedIssueId) analysisStore.selectIssue(null)
      return
    }
    const clickTime = state.activeLabel as number
    const visibleTimeRange = visibleFrames.length > 1
      ? (visibleFrames[visibleFrames.length - 1].time - visibleFrames[0].time) / 1e6
      : 1
    const threshold = visibleTimeRange * 0.015

    // Only allow clicks near a visible label position — issues whose labels
    // were merged/hidden due to space constraints are not directly clickable.
    let closestLabel: LabelEntry | null = null
    let closestLabelDist = Infinity
    for (const label of visibleLabels) {
      const dist = Math.abs(label.timeSec - clickTime)
      if (dist < threshold && dist < closestLabelDist) {
        closestLabelDist = dist
        closestLabel = label
      }
    }

    if (!closestLabel) {
      if (analysisStore.selectedIssueId) analysisStore.selectIssue(null)
      return
    }

    // Always select the primary (displayed) issue — spacebar cycles
    const pick = closestLabel.issueOccurrences[0]
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
    popoverCooldownUntil,
  }
}
