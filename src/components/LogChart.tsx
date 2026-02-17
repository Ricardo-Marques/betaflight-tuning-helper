import { observer } from 'mobx-react-lite'
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
  ReferenceArea,
} from 'recharts'
import { DetectedIssue } from '../domain/types/Analysis'

interface HoveredIssue {
  issue: DetectedIssue
  x: number
  y: number
}

export const LogChart = observer(() => {
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()
  const [hoveredIssue, setHoveredIssue] = useState<HoveredIssue | null>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const isDragging = useRef(false)

  // Derive start and duration from zoomStart/zoomEnd
  const zoomStart = uiStore.zoomStart
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

  // Handle chart mouse move for issue hover detection + drag tracking
  const handleChartMouseMove = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state: any, event: React.MouseEvent) => {
      // Update drag selection
      if (isDragging.current && state?.activeLabel != null) {
        setDragEnd(state.activeLabel as number)
      }

      // Suppress hover popover while dragging
      if (isDragging.current) {
        setHoveredIssue(null)
        return
      }

      if (!state?.activeLabel || visibleIssues.length === 0) {
        setHoveredIssue(null)
        return
      }

      const cursorTime = state.activeLabel as number
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
    [visibleIssues, chartData]
  )

  const handleChartMouseLeave = useCallback(() => {
    setHoveredIssue(null)
    // Cancel drag if cursor leaves chart
    if (isDragging.current) {
      isDragging.current = false
      setDragStart(null)
      setDragEnd(null)
    }
  }, [])

  // Drag-to-zoom handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseDown = useCallback((state: any) => {
    if (state?.activeLabel != null) {
      isDragging.current = true
      setDragStart(state.activeLabel as number)
      setDragEnd(state.activeLabel as number)
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartMouseUp = useCallback((state: any) => {
    if (!isDragging.current || dragStart == null) {
      isDragging.current = false
      return
    }
    isDragging.current = false

    const endTime = state?.activeLabel != null ? (state.activeLabel as number) : dragEnd
    if (endTime == null) {
      setDragStart(null)
      setDragEnd(null)
      return
    }

    const selStart = Math.min(dragStart, endTime)
    const selEnd = Math.max(dragStart, endTime)

    // Only zoom if selection spans a meaningful range (> 1% of visible window)
    const visibleTimeRange = chartData.length > 1
      ? chartData[chartData.length - 1].time - chartData[0].time
      : 1
    if (selEnd - selStart > visibleTimeRange * 0.01 && logStore.frames.length > 0) {
      const firstTime = logStore.frames[0].time
      const totalDuration = logStore.frames[logStore.frames.length - 1].time - firstTime
      if (totalDuration > 0) {
        // Convert seconds back to microseconds then to percentage
        const startPct = Math.max(0, ((selStart * 1_000_000 - firstTime) / totalDuration) * 100)
        const endPct = Math.min(100, ((selEnd * 1_000_000 - firstTime) / totalDuration) * 100)
        uiStore.setZoom(startPct, endPct)
      }
    } else {
      // Click (not drag) — select nearest issue
      const clickTime = (selStart + selEnd) / 2
      const threshold = visibleTimeRange * 0.015
      let closest: DetectedIssue | null = null
      let closestDist = Infinity

      for (const issue of visibleIssues) {
        const times = issue.occurrences ?? [issue.timeRange]
        for (const tr of times) {
          const occTime = tr[0] / 1000000
          const dist = Math.abs(occTime - clickTime)
          if (dist < threshold && dist < closestDist) {
            closest = issue
            closestDist = dist
          }
        }
      }

      if (closest) {
        analysisStore.selectIssue(closest.id)
      }
    }

    setDragStart(null)
    setDragEnd(null)
  }, [dragStart, dragEnd, chartData, logStore.frames, uiStore, visibleIssues, analysisStore])

  // Zoom slider handlers
  const handleStartChange = useCallback(
    (newStart: number) => {
      const clampedStart = Math.min(newStart, 100 - zoomDuration)
      uiStore.setZoom(clampedStart, clampedStart + zoomDuration)
    },
    [uiStore, zoomDuration]
  )

  const handleDurationChange = useCallback(
    (newDuration: number) => {
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

  // Compute time labels
  const totalDuration = logStore.duration
  const startTimeSec = (zoomStart / 100) * totalDuration
  const windowSec = (zoomDuration / 100) * totalDuration

  if (!logStore.isLoaded) {
    return (
      <div data-testid="chart-empty-state" className="flex items-center justify-center h-full text-gray-500">
        <p>Upload a log file to view data</p>
      </div>
    )
  }

  const severityColor = (severity: string) =>
    severity === 'high'
      ? '#dc2626'
      : severity === 'medium'
      ? '#f59e0b'
      : '#3b82f6'

  return (
    <div className="h-full flex flex-col">
      {/* Axis selector */}
      <div data-testid="axis-selector" className="flex items-center gap-4 p-4 border-b">
        <span className="text-sm font-medium text-gray-700">Axis:</span>
        {(['roll', 'pitch', 'yaw'] as const).map(axis => (
          <button
            key={axis}
            data-testid={`axis-button-${axis}`}
            onClick={() => uiStore.setAxis(axis)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              uiStore.selectedAxis === axis
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {axis.charAt(0).toUpperCase() + axis.slice(1)}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              data-testid="toggle-gyro"
              type="checkbox"
              checked={uiStore.showGyro}
              onChange={uiStore.toggleGyro}
              className="rounded"
            />
            Gyro
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              data-testid="toggle-setpoint"
              type="checkbox"
              checked={uiStore.showSetpoint}
              onChange={uiStore.toggleSetpoint}
              className="rounded"
            />
            Setpoint
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              data-testid="toggle-dterm"
              type="checkbox"
              checked={uiStore.showPidD}
              onChange={uiStore.togglePidD}
              className="rounded"
            />
            D-term
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              data-testid="toggle-motors"
              type="checkbox"
              checked={uiStore.showMotors}
              onChange={uiStore.toggleMotors}
              className="rounded"
            />
            Motors
          </label>
        </div>
      </div>

      {/* Chart */}
      <div data-testid="chart-container" ref={chartContainerRef} className={`flex-1 p-4 relative${dragStart != null ? ' select-none' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              height={50}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -2 }}
              stroke="#6b7280"
              tick={{ dy: 4 }}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <YAxis
              label={{ value: 'deg/s', angle: -90, position: 'insideLeft' }}
              stroke="#6b7280"
            />
            <Tooltip
              active={hoveredIssue ? false : undefined}
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
              }}
            />
            <Legend wrapperStyle={{ paddingTop: 8 }} />

            {/* Issue markers — one line per occurrence */}
            {visibleIssues.flatMap(issue => {
              const times = issue.occurrences ?? [issue.timeRange]
              const isSelected = issue.id === analysisStore.selectedIssueId
              return times.map((tr, idx) => {
                const occTime = tr[0] / 1000000
                return (
                  <ReferenceLine
                    key={`${issue.id}-${idx}`}
                    x={occTime}
                    stroke={severityColor(issue.severity)}
                    strokeDasharray={isSelected ? undefined : '3 3'}
                    strokeWidth={isSelected ? 3 : 1}
                    label={{
                      value: issue.type,
                      position: 'top',
                      fontSize: 10,
                    }}
                  />
                )
              })
            })}

            {uiStore.showGyro && (
              <Line
                type="monotone"
                dataKey="gyro"
                stroke="#3b82f6"
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
                stroke="#10b981"
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
                stroke="#8b5cf6"
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
                  stroke="#ef4444"
                  strokeWidth={1}
                  dot={false}
                  name="M1"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor2"
                  stroke="#f59e0b"
                  strokeWidth={1}
                  dot={false}
                  name="M2"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor3"
                  stroke="#10b981"
                  strokeWidth={1}
                  dot={false}
                  name="M3"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="motor4"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dot={false}
                  name="M4"
                  isAnimationActive={false}
                  strokeOpacity={0.6}
                />
              </>
            )}

            {/* Drag-to-zoom selection overlay */}
            {dragStart != null && dragEnd != null && dragStart !== dragEnd && (
              <ReferenceArea
                x1={Math.min(dragStart, dragEnd)}
                x2={Math.max(dragStart, dragEnd)}
                fill="#3b82f6"
                fillOpacity={0.15}
                stroke="#3b82f6"
                strokeOpacity={0.4}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        {/* Issue hover popover */}
        {hoveredIssue && (
          <div
            className="fixed z-50 pointer-events-none bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-xs"
            style={{
              left: hoveredIssue.x + 12,
              top: hoveredIssue.y - 10,
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-medium">{hoveredIssue.issue.description}</p>
              <span
                className="px-1.5 py-0.5 rounded text-xs font-medium shrink-0"
                style={{
                  backgroundColor:
                    hoveredIssue.issue.severity === 'high'
                      ? '#fecaca'
                      : hoveredIssue.issue.severity === 'medium'
                      ? '#fef3c7'
                      : '#bfdbfe',
                  color:
                    hoveredIssue.issue.severity === 'high'
                      ? '#991b1b'
                      : hoveredIssue.issue.severity === 'medium'
                      ? '#92400e'
                      : '#1e40af',
                }}
              >
                {hoveredIssue.issue.severity.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-1">
              Axis: {hoveredIssue.issue.axis}
            </p>
            <div className="text-xs text-gray-600 space-y-0.5">
              {hoveredIssue.issue.metrics.overshoot !== undefined && (
                <p>Overshoot: {hoveredIssue.issue.metrics.overshoot.toFixed(1)}</p>
              )}
              {hoveredIssue.issue.metrics.frequency !== undefined && (
                <p>Frequency: {hoveredIssue.issue.metrics.frequency.toFixed(1)} Hz</p>
              )}
              {hoveredIssue.issue.metrics.amplitude !== undefined && (
                <p>Amplitude: {hoveredIssue.issue.metrics.amplitude.toFixed(1)} deg/s</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Zoom controls: Start + Duration */}
      <div className="px-4 py-3 border-t">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">
                Start: {startTimeSec.toFixed(1)}s
              </span>
            </div>
            <input
              data-testid="zoom-start-slider"
              type="range"
              min="0"
              max={100 - zoomDuration}
              step="0.1"
              value={zoomStart}
              onChange={e => handleStartChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">
                Window: {windowSec.toFixed(1)}s
              </span>
            </div>
            <input
              data-testid="zoom-duration-slider"
              type="range"
              min="1"
              max="100"
              step="0.1"
              value={zoomDuration}
              onChange={e => handleDurationChange(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <button
            data-testid="zoom-reset-button"
            onClick={() => uiStore.setZoom(0, 100)}
            className="text-sm text-blue-600 hover:text-blue-800 shrink-0"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
})
