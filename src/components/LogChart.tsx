import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useTheme } from '@emotion/react'
import { useLogStore, useUIStore, useAnalysisStore } from '../stores/RootStore'
import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
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

interface HoveredIssue {
  issue: DetectedIssue
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

const ToggleLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.primary};
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
  padding: 1rem;
  position: relative;
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
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

const PopoverTitle = styled.p`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.primary};
`

const SeverityBadgeInline = styled.span<{ severity: string }>`
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  flex-shrink: 0;
  background-color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.highBg
    : p.severity === 'medium' ? p.theme.colors.severity.mediumBg
    : p.theme.colors.severity.lowBg};
  color: ${p =>
    p.severity === 'high' ? p.theme.colors.severity.highText
    : p.severity === 'medium' ? p.theme.colors.severity.mediumText
    : p.theme.colors.severity.lowText};
`

const PopoverMeta = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.muted};
  margin-bottom: 0.25rem;
`

const PopoverMetrics = styled.div`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};

  & > p + p {
    margin-top: 0.125rem;
  }
`

const ZoomControls = styled.div`
  padding: 0.75rem 1rem;
  border-top: 1px solid ${p => p.theme.colors.border.main};
`

const ZoomLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${p => p.theme.colors.text.secondary};
`

const ZoomResetBtn = styled.button`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.link};
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;

  &:hover {
    color: ${p => p.theme.colors.text.linkHover};
  }
`

export const LogChart = observer(() => {
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()
  const theme = useTheme()
  const [hoveredIssue, setHoveredIssue] = useState<HoveredIssue | null>(null)
  const [showGlow, setShowGlow] = useState(false)
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartX = useRef<number | null>(null)
  const dragStartZoom = useRef<{ start: number; end: number } | null>(null)
  const isDragging = useRef(false)
  const didDrag = useRef(false)

  // Flash glow when selected issue changes, then fade after 1.5s
  useEffect(() => {
    if (analysisStore.selectedIssueId) {
      setShowGlow(true)
      if (glowTimer.current) clearTimeout(glowTimer.current)
      glowTimer.current = setTimeout(() => setShowGlow(false), 1500)
    } else {
      setShowGlow(false)
    }
    return () => { if (glowTimer.current) clearTimeout(glowTimer.current) }
  }, [analysisStore.selectedIssueId, analysisStore.selectedOccurrenceIdx])

  // Derive window duration from zoom range
  const zoomDuration = uiStore.zoomEnd - uiStore.zoomStart

  // Calculate visible frame range based on zoom
  const visibleFrames = useMemo(() => {
    if (logStore.frames.length === 0) return []

    const totalFrames = logStore.frames.length
    const startIdx = Math.floor((uiStore.zoomStart / 100) * totalFrames)
    const endIdx = Math.ceil((uiStore.zoomEnd / 100) * totalFrames)

    // Downsample for performance (max 2000 points)
    const visibleRange = logStore.frames.slice(startIdx, endIdx)
    const step = Math.max(1, Math.floor(visibleRange.length / 2000))

    return visibleRange.filter((_, i) => i % step === 0)
  }, [logStore.frames, uiStore.zoomStart, uiStore.zoomEnd])

  // Transform frames to chart data
  const chartData = useMemo(() => {
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
  }, [visibleFrames, uiStore.selectedAxis])

  // Get issues in visible range
  const visibleIssues = useMemo(() => {
    if (!analysisStore.isComplete || visibleFrames.length === 0) return []

    const startTime = visibleFrames[0].time
    const endTime = visibleFrames[visibleFrames.length - 1].time

    return analysisStore.getIssuesInTimeRange(startTime, endTime)
  }, [analysisStore.isComplete, visibleFrames, analysisStore.issues])

  // Handle chart mouse move for issue hover detection + drag-to-pan
  const handleChartMouseMove = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_state: any, event: React.MouseEvent) => {
      // Drag-to-pan: convert pixel delta to percentage shift
      if (isDragging.current && dragStartX.current != null && dragStartZoom.current && chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect()
        const pxDelta = event.clientX - dragStartX.current
        const { start: origStart, end: origEnd } = dragStartZoom.current
        const dur = origEnd - origStart
        // Convert pixel movement to percentage of total log
        const pctDelta = -(pxDelta / rect.width) * dur
        let newStart = origStart + pctDelta
        let newEnd = origEnd + pctDelta
        // Clamp
        if (newStart < 0) { newEnd -= newStart; newStart = 0 }
        if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
        newStart = Math.max(0, newStart)
        newEnd = Math.min(100, newEnd)
        if (Math.abs(pxDelta) > 3) didDrag.current = true
        uiStore.setZoom(newStart, newEnd)
        setHoveredIssue(null)
        return
      }

      if (!_state?.activeLabel || visibleIssues.length === 0) {
        setHoveredIssue(null)
        return
      }

      const cursorTime = _state.activeLabel as number
      const visibleTimeRange =
        chartData.length > 1
          ? chartData[chartData.length - 1].time - chartData[0].time
          : 1
      const threshold = visibleTimeRange * 0.015

      let closest: DetectedIssue | null = null
      let closestDist = Infinity

      for (const issue of visibleIssues) {
        const times = issue.occurrences ?? [issue.timeRange]
        for (const tr of times) {
          const occTime = tr[0] / 1000000
          const dist = Math.abs(occTime - cursorTime)
          if (dist < threshold && dist < closestDist) {
            closest = issue
            closestDist = dist
          }
        }
      }

      if (closest) {
        setHoveredIssue({
          issue: closest,
          x: event.clientX,
          y: event.clientY,
        })
      } else {
        setHoveredIssue(null)
      }
    },
    [visibleIssues, chartData, uiStore]
  )

  const handleChartMouseLeave = useCallback(() => {
    setHoveredIssue(null)
    if (isDragging.current) {
      isDragging.current = false
      didDrag.current = false
      dragStartX.current = null
      dragStartZoom.current = null
    }
  }, [])

  // Drag-to-pan handlers
  const handleChartMouseDown = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_state: any, event: React.MouseEvent) => {
      isDragging.current = true
      didDrag.current = false
      dragStartX.current = event.clientX
      dragStartZoom.current = { start: uiStore.zoomStart, end: uiStore.zoomEnd }
    },
    [uiStore]
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseUp = useCallback((state: any) => {
    const wasDrag = didDrag.current
    isDragging.current = false
    didDrag.current = false
    dragStartX.current = null
    dragStartZoom.current = null

    // If it was a real drag, the panning already happened in onMouseMove
    if (wasDrag) return

    // Click (not drag) — select nearest issue occurrence
    if (!state?.activeLabel) return
    const clickTime = state.activeLabel as number
    const visibleTimeRange = chartData.length > 1
      ? chartData[chartData.length - 1].time - chartData[0].time
      : 1
    const threshold = visibleTimeRange * 0.015
    let closest: DetectedIssue | null = null
    let closestOccIdx = 0
    let closestDist = Infinity

    for (const issue of visibleIssues) {
      const times = issue.occurrences ?? [issue.timeRange]
      for (let tIdx = 0; tIdx < times.length; tIdx++) {
        const occTime = times[tIdx][0] / 1000000
        const dist = Math.abs(occTime - clickTime)
        if (dist < threshold && dist < closestDist) {
          closest = issue
          closestOccIdx = tIdx
          closestDist = dist
        }
      }
    }

    if (closest) {
      analysisStore.selectIssue(closest.id, closestOccIdx)
      uiStore.setActiveRightTab('issues')
      if (!uiStore.rightPanelOpen) uiStore.toggleRightPanel()
    }
  }, [chartData, uiStore, visibleIssues, analysisStore])

  // Zoom slider handler — slider value is zoom level (1x to 20x)
  // Zoom level = 100 / windowPct, so windowPct = 100 / zoomLevel
  const handleZoomChange = useCallback(
    (zoomLevel: number) => {
      const newDuration = 100 / zoomLevel
      const center = (uiStore.zoomStart + uiStore.zoomEnd) / 2
      const halfDur = newDuration / 2
      let newStart = center - halfDur
      let newEnd = center + halfDur
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      newStart = Math.max(0, newStart)
      newEnd = Math.min(100, newEnd)
      uiStore.setZoom(newStart, newEnd)
    },
    [uiStore]
  )

  // Scroll-to-zoom: wheel up zooms in, wheel down zooms out
  const chartContainerRef = useRef<HTMLDivElement>(null)
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
  }, [uiStore, logStore.isLoaded])

  // Compute time labels and zoom level
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

  const severityColor = (severity: string) =>
    severity === 'high'
      ? theme.colors.severity.high
      : severity === 'medium'
      ? theme.colors.severity.medium
      : theme.colors.severity.low

  return (
    <ChartWrapper>
      {/* Axis selector */}
      <AxisBar data-testid="axis-selector">
        <AxisLabel>Axis:</AxisLabel>
        {(['roll', 'pitch', 'yaw'] as const).map(axis => (
          <AxisButton
            key={axis}
            data-testid={`axis-button-${axis}`}
            isActive={uiStore.selectedAxis === axis}
            onClick={() => uiStore.setAxis(axis)}
          >
            {axis.charAt(0).toUpperCase() + axis.slice(1)}
          </AxisButton>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <ToggleLabel>
            <input
              data-testid="toggle-gyro"
              type="checkbox"
              checked={uiStore.showGyro}
              onChange={uiStore.toggleGyro}
              className="rounded"
            />
            Gyro
          </ToggleLabel>
          <ToggleLabel>
            <input
              data-testid="toggle-setpoint"
              type="checkbox"
              checked={uiStore.showSetpoint}
              onChange={uiStore.toggleSetpoint}
              className="rounded"
            />
            Setpoint
          </ToggleLabel>
          <ToggleLabel>
            <input
              data-testid="toggle-dterm"
              type="checkbox"
              checked={uiStore.showPidD}
              onChange={uiStore.togglePidD}
              className="rounded"
            />
            D-term
          </ToggleLabel>
          <ToggleLabel>
            <input
              data-testid="toggle-motors"
              type="checkbox"
              checked={uiStore.showMotors}
              onChange={uiStore.toggleMotors}
              className="rounded"
            />
            Motors
          </ToggleLabel>
        </div>
      </AxisBar>

      {/* Issue summary strip */}
      {visibleIssues.length > 0 && (
        <IssueSummaryStrip>
          <IssueSummaryLabel>{visibleIssues.length} issue{visibleIssues.length !== 1 ? 's' : ''} in view</IssueSummaryLabel>
          <div className="flex items-center gap-2 flex-wrap">
            {visibleIssues.map(issue => (
              <IssuePill
                key={issue.id}
                onClick={() => {
                  analysisStore.selectIssue(issue.id, 0)
                  const times = issue.occurrences ?? [issue.timeRange]
                  if (times.length > 0 && logStore.frames.length > 0) {
                    const firstTime = logStore.frames[0].time
                    const totalDuration = logStore.frames[logStore.frames.length - 1].time - firstTime
                    if (totalDuration > 0) {
                      const tr = times[0]
                      const span = tr[1] - tr[0]
                      const padding = Math.max(span * 2, 500_000)
                      const startPct = Math.max(0, ((tr[0] - padding - firstTime) / totalDuration) * 100)
                      const endPct = Math.min(100, ((tr[1] + padding - firstTime) / totalDuration) * 100)
                      uiStore.animateZoom(startPct, endPct)
                    }
                  }
                }}
                style={{ color: severityColor(issue.severity) }}
              >
                <IssueDot style={{ backgroundColor: severityColor(issue.severity) }} />
                {issue.type}
              </IssuePill>
            ))}
          </div>
        </IssueSummaryStrip>
      )}

      {/* Chart */}
      <ChartContainer data-testid="chart-container" ref={chartContainerRef}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.chart.grid} />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              height={50}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -2 }}
              stroke={theme.colors.chart.axis}
              tick={{ dy: 4 }}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <YAxis
              label={{ value: 'deg/s', angle: -90, position: 'insideLeft' }}
              stroke={theme.colors.chart.axis}
            />
            <Tooltip
              active={hoveredIssue ? false : undefined}
              contentStyle={{
                backgroundColor: theme.colors.chart.tooltipBg,
                border: `1px solid ${theme.colors.chart.tooltipBorder}`,
                borderRadius: '6px',
                color: theme.colors.text.primary,
              }}
            />
            <Legend wrapperStyle={{ paddingTop: 8 }} />

            {/* Issue markers — vertical lines at each occurrence start */}
            {visibleIssues.flatMap(issue => {
              const times = issue.occurrences ?? [issue.timeRange]
              const isIssueSelected = issue.id === analysisStore.selectedIssueId
              return times.flatMap((tr, idx) => {
                const x = tr[0] / 1000000
                const isThisOccurrence = isIssueSelected && analysisStore.selectedOccurrenceIdx === idx
                const lines = []
                // Temporary glow halo behind the specific selected occurrence
                if (isThisOccurrence && showGlow) {
                  lines.push(
                    <ReferenceLine
                      key={`issue-glow-${issue.id}-${idx}`}
                      x={x}
                      stroke={severityColor(issue.severity)}
                      strokeWidth={10}
                      strokeOpacity={0.25}
                    />
                  )
                }
                lines.push(
                  <ReferenceLine
                    key={`issue-${issue.id}-${idx}`}
                    x={x}
                    stroke={severityColor(issue.severity)}
                    strokeWidth={isThisOccurrence ? 3.5 : 1.5}
                    strokeDasharray={isThisOccurrence ? undefined : '4 3'}
                    label={{
                      value: issue.type,
                      position: 'top',
                      fontSize: isThisOccurrence ? 11 : 9,
                      fill: severityColor(issue.severity),
                      fontWeight: isThisOccurrence ? 'bold' : 'normal',
                    }}
                  />
                )
                return lines
              })
            })}

            {uiStore.showGyro && (
              <Line
                type="monotone"
                dataKey="gyro"
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

        {/* Issue hover popover */}
        {hoveredIssue && (
          <HoverPopover
            style={{
              left: hoveredIssue.x + 12,
              top: hoveredIssue.y - 10,
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <PopoverTitle>{hoveredIssue.issue.description}</PopoverTitle>
              <SeverityBadgeInline severity={hoveredIssue.issue.severity}>
                {hoveredIssue.issue.severity.toUpperCase()}
              </SeverityBadgeInline>
            </div>
            <PopoverMeta>
              Axis: {hoveredIssue.issue.axis}
            </PopoverMeta>
            <PopoverMetrics>
              {hoveredIssue.issue.metrics.overshoot !== undefined && (
                <p>Overshoot: {hoveredIssue.issue.metrics.overshoot.toFixed(1)}</p>
              )}
              {hoveredIssue.issue.metrics.frequency !== undefined && (
                <p>Frequency: {hoveredIssue.issue.metrics.frequency.toFixed(1)} Hz</p>
              )}
              {hoveredIssue.issue.metrics.amplitude !== undefined && (
                <p>Amplitude: {hoveredIssue.issue.metrics.amplitude.toFixed(1)} deg/s</p>
              )}
            </PopoverMetrics>
          </HoverPopover>
        )}
      </ChartContainer>

      {/* Zoom controls */}
      <ZoomControls>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <ZoomLabel>
                Zoom: {zoomLevel.toFixed(1)}x ({windowSec.toFixed(1)}s)
              </ZoomLabel>
            </div>
            <input
              data-testid="zoom-level-slider"
              type="range"
              min="1"
              max="20"
              step="0.1"
              value={zoomLevel}
              onChange={e => handleZoomChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <ZoomResetBtn
            data-testid="zoom-reset-button"
            onClick={() => uiStore.setZoom(0, 100)}
          >
            Reset
          </ZoomResetBtn>
        </div>
      </ZoomControls>
    </ChartWrapper>
  )
})
