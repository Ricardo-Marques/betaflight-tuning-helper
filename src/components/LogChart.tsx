import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useTheme } from '@emotion/react'
import { useLogStore, useUIStore, useAnalysisStore } from '../stores/RootStore'
import { useRef, useEffect, useCallback } from 'react'
import { useObservableState, useComputed, useAutorun } from '../lib/mobx-reactivity'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { DetectedIssue } from '../domain/types/Analysis'

interface HoveredIssues {
  issues: DetectedIssue[]
  x: number
  y: number
}

const ChartWrapper = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  color: ${p => p.theme.colors.text.primary};
`

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${p => p.theme.colors.text.muted};
`

const AxisBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
`

const AxisLabel = styled.span`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.primary};
`

const AxisButton = styled.button<{ isActive: boolean }>`
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.15s, color 0.15s;
  border: none;
  cursor: pointer;
  color: ${p => p.isActive ? p.theme.colors.button.primaryText : p.theme.colors.text.primary};
  background-color: ${p => p.isActive ? p.theme.colors.button.primary : p.theme.colors.button.secondary};

  &:hover {
    background-color: ${p => p.isActive ? p.theme.colors.button.primaryHover : p.theme.colors.button.secondaryHover};
  }
`

const ToggleBar = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.primary};
`

const StyledCheckbox = styled.input`
  border-radius: 0.25rem;
`

const IssueSummaryStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.main};
  background-color: ${p => p.theme.colors.background.section};
`

const IssueSummaryLabel = styled.span`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
`

const IssuePillList = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`

const IssuePill = styled.button`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`

const IssueDot = styled.span`
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
`

const ChartContainer = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 1rem;
  position: relative;
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`

const LabelOverlay = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  height: 20px;
  pointer-events: none;
  z-index: 10;
`

const ChartLabel = styled.span`
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: all;
  cursor: default;
`

const HoverPopover = styled.div`
  position: fixed;
  z-index: 50;
  pointer-events: none;
  background-color: ${p => p.theme.colors.background.panel};
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  padding: 0.75rem;
  max-width: 20rem;
`


const ZoomControls = styled.div`
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  border-top: 1px solid ${p => p.theme.colors.border.main};
`

const ZoomHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
`

const ZoomInfoLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.secondary};
`

const ZoomResetBtn = styled.button`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.link};
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
  }
`

/* ---- Range Slider (pan control) ---- */

const RangeSliderWrapper = styled.div`
  position: relative;
  width: 100%;
  height: 28px;
  margin-bottom: 0.75rem;
  user-select: none;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const RangeSliderTrack = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 3px;
  background-color: ${p => p.theme.colors.button.secondary};
`

const RangeSliderFill = styled.div`
  position: absolute;
  top: 50%;
  height: 10px;
  border-radius: 5px;
  background-color: ${p => p.theme.colors.button.primary};
  z-index: 1;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`

const RangeSliderHandle = styled.div`
  position: absolute;
  top: 50%;
  width: 12px;
  height: 24px;
  border-radius: 4px;
  background-color: ${p => p.theme.colors.button.primary};
  border: 1px solid ${p => p.theme.colors.button.primaryText};
  cursor: ew-resize;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
`

const HandleDot = styled.span`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background-color: ${p => p.theme.colors.button.primaryText};
  opacity: 0.7;
`

const MIN_WINDOW = 2 // 2% minimum zoom window
const HANDLE_W_PX = 12 // must match RangeSliderHandle width

function RangeSlider({ start, end, onChange }: {
  start: number
  end: number
  onChange: (start: number, end: number) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragType = useRef<'start' | 'end' | 'fill' | null>(null)
  const dragOrigin = useRef<{ x: number; startVal: number; endVal: number }>({ x: 0, startVal: 0, endVal: 0 })

  const pctFromEvent = useCallback((clientX: number) => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragType.current) return
      e.preventDefault()
      const pct = pctFromEvent(e.clientX)

      if (dragType.current === 'start') {
        onChange(Math.min(pct, end - MIN_WINDOW), end)
      } else if (dragType.current === 'end') {
        onChange(start, Math.max(pct, start + MIN_WINDOW))
      } else if (dragType.current === 'fill') {
        const trackRect = trackRef.current?.getBoundingClientRect()
        if (!trackRect) return
        const pxDelta = e.clientX - dragOrigin.current.x
        const pctDelta = (pxDelta / trackRect.width) * 100
        let newStart = dragOrigin.current.startVal + pctDelta
        let newEnd = dragOrigin.current.endVal + pctDelta
        if (newStart < 0) { newEnd -= newStart; newStart = 0 }
        if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
        onChange(Math.max(0, newStart), Math.min(100, newEnd))
      }
    }

    const handleMouseUp = () => {
      dragType.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [start, end, onChange, pctFromEvent])

  // Scroll-to-zoom on range slider
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dur = end - start
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const newDur = Math.min(100, Math.max(MIN_WINDOW, dur * factor))

      const rect = el.getBoundingClientRect()
      const cursorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const center = start + dur * cursorRatio
      let newStart = center - newDur * cursorRatio
      let newEnd = center + newDur * (1 - cursorRatio)
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      onChange(Math.max(0, newStart), Math.min(100, newEnd))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [start, end, onChange])

  const startDrag = useCallback((type: 'start' | 'end' | 'fill', e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragType.current = type
    dragOrigin.current = { x: e.clientX, startVal: start, endVal: end }
  }, [start, end])

  // Clamp handle left-edge positions so they never overflow the track
  const leftHandleLeft = `max(0px, calc(${start}% - ${HANDLE_W_PX}px))`
  const rightHandleLeft = `min(calc(100% - ${HANDLE_W_PX}px), ${end}%)`

  // Fill spans from left handle's left edge to right handle's right edge
  const fillLeft = leftHandleLeft
  const fillRight = `max(0px, calc(${100 - end}% - ${HANDLE_W_PX}px))`

  return (
    <RangeSliderWrapper ref={wrapperRef} onMouseDown={e => startDrag('fill', e)}>
      <RangeSliderTrack ref={trackRef} />
      <RangeSliderFill
        style={{
          left: fillLeft,
          right: fillRight,
          transform: 'translateY(-50%)',
        }}
        onMouseDown={e => startDrag('fill', e)}
      />
      <RangeSliderHandle
        style={{ left: leftHandleLeft, transform: 'translateY(-50%)' }}
        onMouseDown={e => startDrag('start', e)}
      >
        <HandleDot /><HandleDot /><HandleDot />
      </RangeSliderHandle>
      <RangeSliderHandle
        style={{ left: rightHandleLeft, transform: 'translateY(-50%)' }}
        onMouseDown={e => startDrag('end', e)}
      >
        <HandleDot /><HandleDot /><HandleDot />
      </RangeSliderHandle>
    </RangeSliderWrapper>
  )
}

export const LogChart = observer(() => {
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()
  const theme = useTheme()
  const forcedPopoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const hoveredIssuesRef = useRef<HoveredIssues | null>(null)
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showGlow, setShowGlow] = useObservableState(false)
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartX = useRef<number | null>(null)
  const dragStartZoom = useRef<{ start: number; end: number } | null>(null)
  const isDragging = useRef(false)
  const didDrag = useRef(false)
  const [isDraggingObs, setIsDraggingObs] = useObservableState(false)
  const lastZoomCommit = useRef(0)
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Track container width for label overlap calculations
  const [containerWidth, setContainerWidth] = useObservableState(0)
  useEffect(() => {
    const el = chartContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [logStore.isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const severityColor = (severity: string) =>
    severity === 'high'
      ? theme.colors.severity.high
      : severity === 'medium'
      ? theme.colors.severity.medium
      : theme.colors.severity.low

  // Imperatively update the issue hover popover — no React re-render
  const updateHoverPopover = (hovered: HoveredIssues | null): void => {
    hoveredIssuesRef.current = hovered
    const el = popoverRef.current
    if (!el) return
    if (!hovered) {
      el.style.display = 'none'
      return
    }
    el.style.display = ''
    // Render off-screen first to measure dimensions before positioning
    el.style.left = '0px'
    el.style.top = '-9999px'
    el.style.bottom = ''
    el.style.right = ''
    el.style.visibility = 'hidden'

    // Build inner HTML
    const sevBgColor = (s: string): string =>
      s === 'high' ? theme.colors.severity.highBg
        : s === 'medium' ? theme.colors.severity.mediumBg
        : theme.colors.severity.lowBg
    const sevTextColor = (s: string): string =>
      s === 'high' ? theme.colors.severity.highText
        : s === 'medium' ? theme.colors.severity.mediumText
        : theme.colors.severity.lowText

    const parts: string[] = []
    hovered.issues.forEach((issue, idx) => {
      const isSelected = issue.id === analysisStore.selectedIssueId
      const borderStyle = isSelected
        ? `border-left:3px solid ${severityColor(issue.severity)};padding-left:0.5rem;margin-left:-0.25rem`
        : ''
      const divider = idx > 0 ? `<hr style="border:none;border-top:1px solid ${theme.colors.border.main};margin:0.5rem 0"/>` : ''
      const metrics: string[] = []
      if (issue.metrics.overshoot !== undefined) metrics.push(`<p>Overshoot: ${issue.metrics.overshoot.toFixed(1)}</p>`)
      if (issue.metrics.frequency !== undefined) metrics.push(`<p>Frequency: ${issue.metrics.frequency.toFixed(1)} Hz</p>`)
      if (issue.metrics.amplitude !== undefined) metrics.push(`<p>Amplitude: ${issue.metrics.amplitude.toFixed(1)} deg/s</p>`)
      parts.push(`${divider}<div style="${borderStyle}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;margin-bottom:0.25rem">
          <p style="font-size:0.875rem;font-weight:${isSelected ? 700 : 500};color:${theme.colors.text.primary}">${issue.description}</p>
          <span style="padding:0.125rem 0.375rem;border-radius:0.25rem;font-size:0.75rem;font-weight:500;flex-shrink:0;background-color:${sevBgColor(issue.severity)};color:${sevTextColor(issue.severity)}">${issue.severity.toUpperCase()}</span>
        </div>
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};margin-bottom:0.25rem">Axis: ${issue.axis}</p>
        <div style="font-size:0.75rem;color:${theme.colors.text.secondary}">${metrics.join('')}</div>
      </div>`)
    })
    if (hovered.issues.length > 1) {
      parts.push(`<hr style="border:none;border-top:1px solid ${theme.colors.border.main};margin:0.5rem 0"/>
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};font-style:italic">Click to cycle through issues</p>`)
    }
    el.innerHTML = parts.join('')
    // Measure actual dimensions for smart positioning
    const popoverHeight = el.offsetHeight
    const popoverWidth = el.offsetWidth
    el.style.visibility = ''

    // Horizontal: place on opposite side from the Recharts tooltip.
    // Recharts puts its tooltip to the right when cursor is in the left half,
    // and to the left when cursor is in the right half.
    // We do the inverse so they never overlap.
    const chartRect = chartContainerRef.current?.getBoundingClientRect()
    const chartMidX = chartRect
      ? chartRect.left + chartRect.width / 2
      : window.innerWidth / 2
    if (hovered.x < chartMidX) {
      // Cursor in left half → Recharts tooltip right → issue popover LEFT
      el.style.left = `${Math.max(4, hovered.x - popoverWidth - 20)}px`
    } else {
      // Cursor in right half → Recharts tooltip left → issue popover RIGHT
      el.style.left = `${hovered.x + 20}px`
    }

    // Vertical: prefer above cursor, flip below if not enough space
    const spaceAbove = hovered.y - 12
    if (spaceAbove >= popoverHeight) {
      el.style.top = ''
      el.style.bottom = `${window.innerHeight - hovered.y + 12}px`
    } else {
      el.style.bottom = ''
      el.style.top = `${hovered.y + 12}px`
    }
  }

  // Rebuild popover innerHTML in-place (no repositioning) to update selected-issue highlight
  const refreshPopoverContent = (): void => {
    const hovered = hoveredIssuesRef.current
    const el = popoverRef.current
    if (!hovered || !el || el.style.display === 'none') return

    const sevBgColor = (s: string): string =>
      s === 'high' ? theme.colors.severity.highBg
        : s === 'medium' ? theme.colors.severity.mediumBg
        : theme.colors.severity.lowBg
    const sevTextColor = (s: string): string =>
      s === 'high' ? theme.colors.severity.highText
        : s === 'medium' ? theme.colors.severity.mediumText
        : theme.colors.severity.lowText

    const parts: string[] = []
    hovered.issues.forEach((issue, idx) => {
      const isSelected = issue.id === analysisStore.selectedIssueId
      const borderStyle = isSelected
        ? `border-left:3px solid ${severityColor(issue.severity)};padding-left:0.5rem;margin-left:-0.25rem`
        : ''
      const divider = idx > 0 ? `<hr style="border:none;border-top:1px solid ${theme.colors.border.main};margin:0.5rem 0"/>` : ''
      const metrics: string[] = []
      if (issue.metrics.overshoot !== undefined) metrics.push(`<p>Overshoot: ${issue.metrics.overshoot.toFixed(1)}</p>`)
      if (issue.metrics.frequency !== undefined) metrics.push(`<p>Frequency: ${issue.metrics.frequency.toFixed(1)} Hz</p>`)
      if (issue.metrics.amplitude !== undefined) metrics.push(`<p>Amplitude: ${issue.metrics.amplitude.toFixed(1)} deg/s</p>`)
      parts.push(`${divider}<div style="${borderStyle}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;margin-bottom:0.25rem">
          <p style="font-size:0.875rem;font-weight:${isSelected ? 700 : 500};color:${theme.colors.text.primary}">${issue.description}</p>
          <span style="padding:0.125rem 0.375rem;border-radius:0.25rem;font-size:0.75rem;font-weight:500;flex-shrink:0;background-color:${sevBgColor(issue.severity)};color:${sevTextColor(issue.severity)}">${issue.severity.toUpperCase()}</span>
        </div>
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};margin-bottom:0.25rem">Axis: ${issue.axis}</p>
        <div style="font-size:0.75rem;color:${theme.colors.text.secondary}">${metrics.join('')}</div>
      </div>`)
    })
    if (hovered.issues.length > 1) {
      parts.push(`<hr style="border:none;border-top:1px solid ${theme.colors.border.main};margin:0.5rem 0"/>
        <p style="font-size:0.75rem;color:${theme.colors.text.muted};font-style:italic">Click to cycle through issues</p>`)
    }
    el.innerHTML = parts.join('')
  }

  // Flash glow when selected issue changes, then fade after 1.5s
  useAutorun(() => {
    if (analysisStore.selectedIssueId) {
      // Read selectedOccurrenceIdx to track it as a dependency
      void analysisStore.selectedOccurrenceIdx
      setShowGlow(true)
      if (glowTimer.current) clearTimeout(glowTimer.current)
      glowTimer.current = setTimeout(() => setShowGlow(false), 1500)
    } else {
      setShowGlow(false)
    }
  })

  // Derive window duration from zoom range
  const zoomDuration = uiStore.zoomEnd - uiStore.zoomStart

  // Calculate visible frame range based on zoom
  const visibleFrames = useComputed(() => {
    if (logStore.frames.length === 0) return []

    const totalFrames = logStore.frames.length
    const startIdx = Math.floor((uiStore.zoomStart / 100) * totalFrames)
    const endIdx = Math.ceil((uiStore.zoomEnd / 100) * totalFrames)

    // Downsample: fewer points while dragging for snappier panning
    const maxPoints = isDraggingObs ? 500 : 2000
    const visibleRange = logStore.frames.slice(startIdx, endIdx)
    const step = Math.max(1, Math.floor(visibleRange.length / maxPoints))

    return visibleRange.filter((_, i) => i % step === 0)
  })

  // Transform frames to chart data
  const chartData = useComputed(() => {
    return visibleFrames.map(frame => ({
      time: frame.time / 1000000, // Convert to seconds
      gyro: frame.gyroADC[uiStore.selectedAxis],
      setpoint: frame.setpoint[uiStore.selectedAxis],
      pidSum: frame.pidSum[uiStore.selectedAxis],
      pidP: frame.pidP[uiStore.selectedAxis],
      pidI: frame.pidI[uiStore.selectedAxis],
      pidD: frame.pidD[uiStore.selectedAxis],
      motor1: frame.motor[0],
      motor2: frame.motor[1],
      motor3: frame.motor[2],
      motor4: frame.motor[3],
      throttle: frame.throttle,
    }))
  })

  // Compute cross-axis Y domain so Y-axis stays constant when switching axes
  const yDomain = useComputed((): [number, number] => {
    if (visibleFrames.length === 0) return [0, 1]

    let min = Infinity
    let max = -Infinity

    for (const frame of visibleFrames) {
      for (const axis of ['roll', 'pitch', 'yaw'] as const) {
        const g = frame.gyroADC[axis]
        const s = frame.setpoint[axis]
        const d = frame.pidD[axis]
        if (g < min) min = g
        if (g > max) max = g
        if (s < min) min = s
        if (s > max) max = s
        if (d < min) min = d
        if (d > max) max = d
      }
    }

    const range = max - min
    const margin = range * 0.05
    return [min - margin, max + margin]
  })

  // Get issues in visible range, sorted by first visible occurrence time
  const visibleIssues = useComputed(() => {
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

  // Compute visible issue labels with overlap prevention
  // Each label has: pixel position, display text, color, and list of stacked issues for popover
  const CHART_MARGIN_LEFT = 5 + 50 // margin.left + YAxis width
  const CHART_MARGIN_RIGHT = 5     // margin.right

  interface LabelEntry {
    key: string
    pxLeft: number // pixel position within the plot area (for HTML overlay)
    text: string
    color: string
    fontSize: number
    fontWeight: string
    issues: DetectedIssue[]
  }

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
      // When issues hidden, only build labels for the selected issue
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

    const flush = () => {
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

  // Show forced popover for 2 seconds when an issue is selected (only if no hover popover active)
  useAutorun(() => {
    if (forcedPopoverTimer.current) clearTimeout(forcedPopoverTimer.current)
    const issueId = analysisStore.selectedIssueId
    const occIdx = analysisStore.selectedOccurrenceIdx
    if (!issueId || occIdx == null || !chartContainerRef.current || chartData.length < 2 || containerWidth === 0) {
      // Only clear if not hovering
      if (!hoveredIssuesRef.current) updateHoverPopover(null)
      return
    }

    // If hover popover is already showing, just refresh its content (update selected highlight)
    if (hoveredIssuesRef.current) {
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
    const t = occ[0] / 1000000
    if (t < timeStart || t > timeEnd) { updateHoverPopover(null); return }

    const plotWidth = containerWidth - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT
    const pxLeft = CHART_MARGIN_LEFT + ((t - timeStart) / timeSpan) * plotWidth
    const rect = chartContainerRef.current.getBoundingClientRect()
    // Collect all stacked issues at this position
    const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const stacked = visibleIssues.filter(vi => {
      const viTimes = vi.occurrences ?? [vi.timeRange]
      return viTimes.some(tr => Math.abs(tr[0] / 1000000 - t) < (timeSpan * 0.005))
    }).sort((a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2))
    const issues = stacked.length > 0 ? stacked : [issue]

    updateHoverPopover({
      issues,
      x: rect.left + 16 + pxLeft, // 16 = 1rem padding
      y: rect.top + 30,
    })
    forcedPopoverTimer.current = setTimeout(() => {
      // Only auto-dismiss if no hover popover took over
      if (!hoveredIssuesRef.current) updateHoverPopover(null)
    }, 2000)
  })

  // Pending zoom values during drag — applied via rAF to avoid per-mousemove re-renders
  const pendingZoom = useRef<{ start: number; end: number } | null>(null)

  // Handle chart mouse move for issue hover detection + drag-to-pan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseMove = (_state: any, event: React.MouseEvent) => {
    // Drag-to-pan: throttled zoom commits
    if (isDragging.current && dragStartX.current != null && dragStartZoom.current && chartContainerRef.current) {
      const pxDelta = event.clientX - dragStartX.current
      if (Math.abs(pxDelta) > 3) {
        if (!didDrag.current) {
          didDrag.current = true
          updateHoverPopover(null)
          if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null }
        }
        if (!isDraggingObs) setIsDraggingObs(true)
      }

      const rect = chartContainerRef.current.getBoundingClientRect()
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

      // Commit zoom at most once per 80ms to keep Recharts re-renders manageable
      const now = performance.now()
      if (now - lastZoomCommit.current > 80) {
        lastZoomCommit.current = now
        uiStore.setZoom(newStart, newEnd)
      }
      return
    }

    if (!_state?.activeLabel || visibleIssues.length === 0) {
      if (hoveredIssuesRef.current && !hoverClearTimer.current) {
        hoverClearTimer.current = setTimeout(() => {
          hoverClearTimer.current = null
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
      const times = issue.occurrences ?? [issue.timeRange]
      for (const tr of times) {
        const occTime = tr[0] / 1000000
        if (Math.abs(occTime - cursorTime) < threshold) {
          nearby.push(issue)
          break // one match per issue is enough
        }
      }
    }

    if (nearby.length > 0) {
      if (hoverClearTimer.current) {
        clearTimeout(hoverClearTimer.current)
        hoverClearTimer.current = null
      }
      const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
      nearby.sort((a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2))
      // Only rebuild innerHTML when the issue set changes — otherwise just reposition
      const prevIds = hoveredIssuesRef.current?.issues.map(i => i.id).join(',')
      const nextIds = nearby.map(i => i.id).join(',')
      if (prevIds !== nextIds) {
        updateHoverPopover({ issues: nearby, x: event.clientX, y: event.clientY })
      } else if (popoverRef.current) {
        // Reposition only — opposite side from Recharts tooltip + smart vertical
        const el = popoverRef.current
        const popoverWidth = el.offsetWidth
        const popoverHeight = el.offsetHeight
        const chartRect = chartContainerRef.current?.getBoundingClientRect()
        const midX = chartRect ? chartRect.left + chartRect.width / 2 : window.innerWidth / 2
        if (event.clientX < midX) {
          el.style.left = `${Math.max(4, event.clientX - popoverWidth - 20)}px`
        } else {
          el.style.left = `${event.clientX + 20}px`
        }
        const spaceAbove = event.clientY - 12
        if (spaceAbove >= popoverHeight) {
          el.style.top = ''
          el.style.bottom = `${window.innerHeight - event.clientY + 12}px`
        } else {
          el.style.bottom = ''
          el.style.top = `${event.clientY + 12}px`
        }
      }
    } else {
      if (hoveredIssuesRef.current && !hoverClearTimer.current) {
        hoverClearTimer.current = setTimeout(() => {
          hoverClearTimer.current = null
          updateHoverPopover(null)
        }, 100)
      }
    }
  }

  const handleChartMouseLeave = () => {
    if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null }
    updateHoverPopover(null)
    if (isDragging.current) {
      isDragging.current = false
      didDrag.current = false
      setIsDraggingObs(false)
      dragStartX.current = null
      dragStartZoom.current = null
      // Flush any pending zoom
      if (pendingZoom.current) {
        uiStore.setZoom(pendingZoom.current.start, pendingZoom.current.end)
        pendingZoom.current = null
      }
    }
  }

  // Drag-to-pan handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseDown = (_state: any, event: React.MouseEvent) => {
    isDragging.current = true
    didDrag.current = false
    dragStartX.current = event.clientX
    dragStartZoom.current = { start: uiStore.zoomStart, end: uiStore.zoomEnd }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseUp = (state: any) => {
    const wasDrag = didDrag.current
    isDragging.current = false
    didDrag.current = false
    setIsDraggingObs(false)
    dragStartX.current = null
    dragStartZoom.current = null
    // Flush any pending zoom
    if (pendingZoom.current) {
      uiStore.setZoom(pendingZoom.current.start, pendingZoom.current.end)
      pendingZoom.current = null
    }

    // If it was a real drag, the panning already happened in onMouseMove
    if (wasDrag) return

    // Click (not drag) — select nearest issue occurrence, cycling through stacked issues
    if (!state?.activeLabel) return
    const clickTime = state.activeLabel as number
    const visibleTimeRange = chartData.length > 1
      ? chartData[chartData.length - 1].time - chartData[0].time
      : 1
    const threshold = visibleTimeRange * 0.015

    // Collect all issues at this click position
    const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const nearby: { issue: DetectedIssue; occIdx: number }[] = []
    for (const issue of visibleIssues) {
      const times = issue.occurrences ?? [issue.timeRange]
      for (let tIdx = 0; tIdx < times.length; tIdx++) {
        const occTime = times[tIdx][0] / 1000000
        if (Math.abs(occTime - clickTime) < threshold) {
          nearby.push({ issue, occIdx: tIdx })
          break // one match per issue
        }
      }
    }

    if (nearby.length === 0) return

    // Sort by severity: high first
    nearby.sort((a, b) => (sevRank[a.issue.severity] ?? 2) - (sevRank[b.issue.severity] ?? 2))

    // Always start from highest priority; if already selected, cycle to next
    const currentIdx = nearby.findIndex(n => n.issue.id === analysisStore.selectedIssueId)
    let pick: typeof nearby[0]
    if (currentIdx < 0) {
      // Nothing selected at this position — pick highest priority
      pick = nearby[0]
    } else {
      // Already selected something here — cycle to next
      pick = nearby[(currentIdx + 1) % nearby.length]
    }

    analysisStore.selectIssue(pick.issue.id, pick.occIdx)
    // Refresh popover content to update selected-issue highlight
    refreshPopoverContent()
    uiStore.setActiveRightTab('issues')
    if (!uiStore.rightPanelOpen) uiStore.toggleRightPanel()
  }

  // Range slider change handler
  const handleRangeChange = (newStart: number, newEnd: number) => {
    uiStore.setZoom(newStart, newEnd)
  }

  // Scroll-to-zoom: wheel up zooms in, wheel down zooms out
  useEffect(() => {
    const el = chartContainerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zs = uiStore.zoomStart
      const ze = uiStore.zoomEnd
      const dur = ze - zs
      // Zoom factor per scroll tick — shrink or grow the window by 15%
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const newDur = Math.min(100, Math.max(1, dur * factor))

      // Zoom centered on cursor position within the chart
      const rect = el.getBoundingClientRect()
      const cursorRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const center = zs + dur * cursorRatio
      let newStart = center - newDur * cursorRatio
      let newEnd = center + newDur * (1 - cursorRatio)
      // Clamp to [0, 100]
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      newStart = Math.max(0, newStart)
      newEnd = Math.min(100, newEnd)
      uiStore.setZoom(newStart, newEnd)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [uiStore, logStore.isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute zoom info for display
  const totalDuration = logStore.duration
  const windowSec = (zoomDuration / 100) * totalDuration
  const zoomLevel = 100 / zoomDuration

  if (!logStore.isLoaded) {
    return (
      <EmptyState data-testid="chart-empty-state">
        <p>Upload a log file to view data</p>
      </EmptyState>
    )
  }

  return (
    <ChartWrapper>
      {/* Axis selector */}
      <AxisBar data-testid="axis-selector">
        <AxisLabel>Axis:</AxisLabel>
        {(['roll', 'pitch', 'yaw'] as const).map(axis => (
          <AxisButton
            key={axis}
            data-testid={`axis-button-${axis}`}
            data-active={uiStore.selectedAxis === axis || undefined}
            isActive={uiStore.selectedAxis === axis}
            onClick={() => uiStore.setAxis(axis)}
          >
            {axis.charAt(0).toUpperCase() + axis.slice(1)}
          </AxisButton>
        ))}

        <ToggleBar>
          <ToggleLabel>
            <StyledCheckbox
              data-testid="toggle-gyro"
              type="checkbox"
              checked={uiStore.showGyro}
              onChange={uiStore.toggleGyro}
            />
            Gyro
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox
              data-testid="toggle-setpoint"
              type="checkbox"
              checked={uiStore.showSetpoint}
              onChange={uiStore.toggleSetpoint}
            />
            Setpoint
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox
              data-testid="toggle-dterm"
              type="checkbox"
              checked={uiStore.showPidD}
              onChange={uiStore.togglePidD}
            />
            D-term
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox
              data-testid="toggle-motors"
              type="checkbox"
              checked={uiStore.showMotors}
              onChange={uiStore.toggleMotors}
            />
            Motors
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox
              data-testid="toggle-issues"
              type="checkbox"
              checked={uiStore.showIssues}
              onChange={uiStore.toggleIssues}
            />
            Issues
          </ToggleLabel>
        </ToggleBar>
      </AxisBar>

      {/* Issue summary strip */}
      {uiStore.showIssues && visibleIssues.length > 0 && (
        <IssueSummaryStrip data-testid="issues-in-view">
          <IssueSummaryLabel>{visibleIssues.length} issue{visibleIssues.length !== 1 ? 's' : ''} in view</IssueSummaryLabel>
          <IssuePillList>
            {visibleIssues.map(issue => (
              <IssuePill
                key={issue.id}
                data-testid={`issue-pill-${issue.id}`}
                data-issue-type={issue.type}
                data-severity={issue.severity}
                onClick={() => {
                  const times = issue.occurrences ?? [issue.timeRange]
                  // Find the first occurrence that's currently in view
                  const viewStart = visibleFrames.length > 0 ? visibleFrames[0].time : 0
                  const viewEnd = visibleFrames.length > 0 ? visibleFrames[visibleFrames.length - 1].time : Infinity
                  const inViewIdx = times.findIndex(tr => tr[0] >= viewStart && tr[0] <= viewEnd)
                  const occIdx = inViewIdx >= 0 ? inViewIdx : 0
                  analysisStore.selectIssue(issue.id, occIdx)
                  uiStore.setActiveRightTab('issues')
                  if (!uiStore.rightPanelOpen) uiStore.toggleRightPanel()
                  // Only navigate if the occurrence is not already visible
                  if (inViewIdx < 0) {
                    const frames = logStore.frames
                    if (times.length > 0 && frames.length > 0) {
                      const tr = times[occIdx]
                      const occTime = tr[0]
                      let lo = 0, hi = frames.length - 1
                      while (lo < hi) {
                        const mid = (lo + hi) >> 1
                        if (frames[mid].time < occTime) lo = mid + 1
                        else hi = mid
                      }
                      const centerPct = (lo / frames.length) * 100
                      const halfDur = (uiStore.zoomEnd - uiStore.zoomStart) / 2
                      let newStart = centerPct - halfDur
                      let newEnd = centerPct + halfDur
                      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
                      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
                      uiStore.animateZoom(Math.max(0, newStart), Math.min(100, newEnd))
                    }
                  }
                }}
                style={{ color: severityColor(issue.severity) }}
              >
                <IssueDot style={{ backgroundColor: severityColor(issue.severity) }} />
                {issue.type}
              </IssuePill>
            ))}
          </IssuePillList>
        </IssueSummaryStrip>
      )}

      {/* Chart */}
      <ChartContainer data-testid="chart-container" ref={chartContainerRef}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 5, bottom: 5, left: 5 }}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.chart.grid} />
            <XAxis
              dataKey="time"
              type="number"
              domain={chartData.length > 0 ? [chartData[0].time, chartData[chartData.length - 1].time] : [0, 1]}
              allowDataOverflow
              height={50}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -2 }}
              stroke={theme.colors.chart.axis}
              tick={{ dy: 4 }}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <YAxis
              yAxisId="primary"
              width={50}
              domain={yDomain}
              allowDataOverflow
              label={{ value: 'deg/s', angle: -90, position: 'insideLeft' }}
              stroke={theme.colors.chart.axis}
            />
            <YAxis
              yAxisId="motor"
              hide
            />
            <Tooltip
              active={isDraggingObs ? false : undefined}
              contentStyle={{
                backgroundColor: theme.colors.chart.tooltipBg,
                border: `1px solid ${theme.colors.chart.tooltipBorder}`,
                borderRadius: '6px',
                color: theme.colors.text.primary,
              }}
            />
            <Legend wrapperStyle={{ paddingTop: 8 }} />

            {/* Issue markers — vertical lines at each occurrence start */}
            {(() => {
              // Collect all reference line entries
              const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
              const allLines: { x: number; issue: DetectedIssue; idx: number; isSelected: boolean; sev: number }[] = []
              for (const issue of visibleIssues) {
                // When issues hidden, only include the selected issue
                if (!uiStore.showIssues && issue.id !== analysisStore.selectedIssueId) continue
                const times = issue.occurrences ?? [issue.timeRange]
                const isIssueSelected = issue.id === analysisStore.selectedIssueId
                for (let idx = 0; idx < times.length; idx++) {
                  const isThisOcc = isIssueSelected && analysisStore.selectedOccurrenceIdx === idx
                  allLines.push({
                    x: times[idx][0] / 1000000,
                    issue,
                    idx,
                    isSelected: isThisOcc,
                    sev: sevRank[issue.severity] ?? 2,
                  })
                }
              }

              // Find highest severity at each position (for stacked lines)
              const posHighest = new Map<string, number>() // x-key → best sev rank
              const posHasSelected = new Map<string, boolean>()
              for (const l of allLines) {
                const xKey = l.x.toFixed(6)
                const best = posHighest.get(xKey)
                if (best === undefined || l.sev < best) posHighest.set(xKey, l.sev)
                if (l.isSelected) posHasSelected.set(xKey, true)
              }

              // Sort: low severity first (bottom), high severity last (top)
              allLines.sort((a, b) => b.sev - a.sev || (a.isSelected ? 1 : -1))

              return allLines.flatMap(l => {
                const xKey = l.x.toFixed(6)
                const isHighestAtPos = l.sev === posHighest.get(xKey)
                const anySelectedAtPos = posHasSelected.get(xKey) ?? false
                // Only the highest severity line at a stacked position gets the selected visual
                const showAsSelected = isHighestAtPos && anySelectedAtPos
                const elements = []

                if (showAsSelected && showGlow) {
                  elements.push(
                    <ReferenceLine
                      key={`issue-glow-${l.issue.id}-${l.idx}`}
                      x={l.x}
                      yAxisId="primary"
                      stroke={severityColor(l.issue.severity)}
                      strokeWidth={10}
                      strokeOpacity={0.25}
                      ifOverflow="hidden"
                    />
                  )
                }
                elements.push(
                  <ReferenceLine
                    key={`issue-${l.issue.id}-${l.idx}`}
                    x={l.x}
                    yAxisId="primary"
                    stroke={severityColor(l.issue.severity)}
                    strokeWidth={showAsSelected ? 3.5 : 1.5}
                    strokeDasharray={showAsSelected ? undefined : '4 3'}
                    ifOverflow="hidden"
                  />
                )
                return elements
              })
            })()}

            {uiStore.showGyro && (
              <Line
                type="monotone"
                dataKey="gyro"
                yAxisId="primary"
                stroke={theme.colors.chart.gyro}
                strokeWidth={2}
                dot={false}
                name="Gyro"
                isAnimationActive={false}
              />
            )}

            {uiStore.showSetpoint && (
              <Line
                type="monotone"
                dataKey="setpoint"
                yAxisId="primary"
                stroke={theme.colors.chart.setpoint}
                strokeWidth={2}
                dot={false}
                name="Setpoint"
                isAnimationActive={false}
                strokeDasharray="5 5"
              />
            )}

            {uiStore.showPidD && (
              <Line
                type="monotone"
                dataKey="pidD"
                yAxisId="primary"
                stroke={theme.colors.chart.pidD}
                strokeWidth={1.5}
                dot={false}
                name="D-term"
                isAnimationActive={false}
              />
            )}

            {uiStore.showMotors && (
              <>
                <Line
                  type="monotone"
                  dataKey="motor1"
                  yAxisId="motor"
                  stroke={theme.colors.chart.motor1}
                  strokeWidth={1}
                  dot={false}
                  name="M1"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor2"
                  yAxisId="motor"
                  stroke={theme.colors.chart.motor2}
                  strokeWidth={1}
                  dot={false}
                  name="M2"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor3"
                  yAxisId="motor"
                  stroke={theme.colors.chart.motor3}
                  strokeWidth={1}
                  dot={false}
                  name="M3"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor4"
                  yAxisId="motor"
                  stroke={theme.colors.chart.motor4}
                  strokeWidth={1}
                  dot={false}
                  name="M4"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
              </>
            )}

          </LineChart>
        </ResponsiveContainer>

        {/* HTML issue labels (outside SVG so mouse events work) */}
        {visibleLabels.length > 0 && (
          <LabelOverlay data-testid="label-overlay">
            {visibleLabels.map(label => (
              <ChartLabel
                key={label.key}
                data-testid="chart-label"
                style={{
                  left: `${label.pxLeft}px`,
                  color: label.color,
                  fontSize: `${label.fontSize}px`,
                  fontWeight: label.fontWeight,
                }}
                onMouseEnter={(e) => {
                  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
                  const sorted = [...label.issues].sort(
                    (a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2)
                  )
                  if (forcedPopoverTimer.current) { clearTimeout(forcedPopoverTimer.current); forcedPopoverTimer.current = null }
                  updateHoverPopover({ issues: sorted, x: e.clientX, y: e.clientY })
                }}
                onMouseLeave={() => updateHoverPopover(null)}
              >
                {label.text}
              </ChartLabel>
            ))}
          </LabelOverlay>
        )}

        {/* Issue hover popover — always mounted, managed imperatively */}
        <HoverPopover
          ref={popoverRef}
          data-testid="issue-popover"
          style={{ display: 'none' }}
        />
      </ChartContainer>

      {/* Zoom controls */}
      <ZoomControls>
        <ZoomHeader>
          <ZoomInfoLabel>
            {zoomLevel.toFixed(1)}x ({windowSec.toFixed(1)}s window)
          </ZoomInfoLabel>
          <ZoomResetBtn
            data-testid="zoom-reset-button"
            onClick={() => uiStore.setZoom(0, 100)}
          >
            Reset
          </ZoomResetBtn>
        </ZoomHeader>
        <RangeSlider
          start={uiStore.zoomStart}
          end={uiStore.zoomEnd}
          onChange={handleRangeChange}
        />
      </ZoomControls>
    </ChartWrapper>
  )
})
