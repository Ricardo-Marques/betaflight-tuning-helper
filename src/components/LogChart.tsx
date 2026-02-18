import { observer, useLocalObservable } from 'mobx-react-lite'
import { useTheme } from '@emotion/react'
import { useRef, useCallback } from 'react'
import { useLogStore, useUIStore, useAnalysisStore } from '../stores/RootStore'
import { useObservableState, useAutorun } from '../lib/mobx-reactivity'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  ChartWrapper, EmptyState, AxisBar, AxisLabel, AxisButton,
  ToggleBar, ToggleLabel, StyledCheckbox,
  IssueSummaryStrip, IssueSummaryLabel, IssuePillList, IssuePill, IssueDot,
  ChartContainer, LabelOverlay, ChartLabel, HoverPopover,
  ZoomControls, ZoomHeader, ZoomInfoLabel, ZoomResetBtn,
  AxisSwitchToast,
} from './LogChart.styles'
import { RangeSlider } from './RangeSlider'
import { useChartData } from './logChart/useChartData'
import { useIssueLabels, shortLabel } from './logChart/useIssueLabels'
import { useIssuePopover } from './logChart/useIssuePopover'
import type { HoveredIssues } from './logChart/useIssuePopover'
import { useChartInteractions } from './logChart/useChartInteractions'

export const LogChart = observer(() => {
  const logStore = useLogStore()
  const uiStore = useUIStore()
  const analysisStore = useAnalysisStore()
  const theme = useTheme()

  // Shared refs
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const hoveredIssuesRef = useRef<HoveredIssues | null>(null)
  const popoverSourceRef = useRef<'hover' | 'forced' | null>(null)
  const forcedPopoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Shared observable state
  const [isDraggingObs, setIsDraggingObs] = useObservableState(false)
  const [containerWidth, setContainerWidth] = useObservableState(0)
  // Observable box so autoruns re-fire when the chart DOM element mounts/unmounts.
  // Must be a box (not useObservableState) so the autoruns can track it directly.
  const chartMountedBox = useLocalObservable(() => ({ value: false }))
  const chartContainerCallbackRef = useCallback((el: HTMLDivElement | null) => {
    const mutableRef = chartContainerRef as React.MutableRefObject<HTMLDivElement | null>
    mutableRef.current = el
    chartMountedBox.value = el !== null
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Data hooks
  // Severity color helper (theme-dependent, shared by labels and popover)
  const severityColor = (severity: string): string =>
    severity === 'high'
      ? theme.colors.severity.high
      : severity === 'medium'
      ? theme.colors.severity.medium
      : theme.colors.severity.low

  const { zoomDuration, visibleFrames, chartData, yDomain, motorDomain } = useChartData(isDraggingObs)
  const { visibleIssues, visibleLabels } = useIssueLabels(visibleFrames, chartData, containerWidth, severityColor)

  const popoverRefs = { popoverRef, hoveredIssuesRef, popoverSourceRef, forcedPopoverTimer, hoverClearTimer, glowTimer, chartContainerRef }
  const popoverActions = useIssuePopover(popoverRefs, visibleIssues, chartData, containerWidth, severityColor, chartMountedBox)
  const { showGlow, updateHoverPopover } = popoverActions

  const interactionRefs = { chartContainerRef, hoveredIssuesRef, popoverSourceRef, popoverRef, hoverClearTimer, forcedPopoverTimer }
  const { handleChartMouseMove, handleChartMouseLeave, handleChartMouseDown, handleChartMouseUp, handleRangeChange } =
    useChartInteractions(interactionRefs, { setIsDraggingObs, setContainerWidth }, visibleIssues, chartData, isDraggingObs, popoverActions, chartMountedBox)

  // Auto-switch axis when an issue on a different axis is selected
  useAutorun(() => {
    const issue = analysisStore.selectedIssue
    if (issue && issue.axis !== uiStore.selectedAxis) {
      uiStore.setAxis(issue.axis)
      uiStore.flashAxisHighlight(issue.axis)
    }
  })

  // Zoom info
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
      <AxisBar data-testid="axis-selector">
        <AxisLabel>Axis:</AxisLabel>
        {(['roll', 'pitch', 'yaw'] as const).map(axis => (
          <AxisButton
            key={axis}
            data-testid={`axis-button-${axis}`}
            data-active={uiStore.selectedAxis === axis || undefined}
            isActive={uiStore.selectedAxis === axis}
            onClick={() => { analysisStore.selectIssue(null); uiStore.setAxis(axis) }}
          >
            {axis.charAt(0).toUpperCase() + axis.slice(1)}
          </AxisButton>
        ))}
        <ToggleBar>
          <ToggleLabel>
            <StyledCheckbox data-testid="toggle-gyro" type="checkbox" checked={uiStore.showGyro} onChange={uiStore.toggleGyro} />
            Gyro
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox data-testid="toggle-setpoint" type="checkbox" checked={uiStore.showSetpoint} onChange={uiStore.toggleSetpoint} />
            Setpoint
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox data-testid="toggle-dterm" type="checkbox" checked={uiStore.showPidD} onChange={uiStore.togglePidD} />
            D-term
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox data-testid="toggle-motors" type="checkbox" checked={uiStore.showMotors} onChange={uiStore.toggleMotors} />
            Motors
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox data-testid="toggle-throttle" type="checkbox" checked={uiStore.showThrottle} onChange={uiStore.toggleThrottle} />
            Throttle
          </ToggleLabel>
          <ToggleLabel>
            <StyledCheckbox data-testid="toggle-issues" type="checkbox" checked={uiStore.showIssues} onChange={uiStore.toggleIssues} />
            Issues
          </ToggleLabel>
        </ToggleBar>
      </AxisBar>

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
                data-axis={issue.axis}
                onClick={() => {
                  const times = issue.occurrences ?? [issue.timeRange]
                  const viewStart = visibleFrames.length > 0 ? visibleFrames[0].time : 0
                  const viewEnd = visibleFrames.length > 0 ? visibleFrames[visibleFrames.length - 1].time : Infinity
                  const inViewIdx = times.findIndex((tr, idx) => {
                    const peak = issue.peakTimes?.[idx] ?? issue.metrics.peakTime ?? (tr[0] + tr[1]) / 2
                    return peak >= viewStart && peak <= viewEnd
                  })
                  const occIdx = inViewIdx >= 0 ? inViewIdx : 0
                  analysisStore.selectIssue(issue.id, occIdx)
                  uiStore.setActiveRightTab('issues')
                  if (!uiStore.rightPanelOpen) uiStore.toggleRightPanel()
                  if (inViewIdx < 0) {
                    const frames = logStore.frames
                    if (times.length > 0 && frames.length > 0) {
                      const tr = times[occIdx]
                      const occTime = issue.peakTimes?.[occIdx] ?? issue.metrics.peakTime ?? (tr[0] + tr[1]) / 2
                      let lo = 0, hi = frames.length - 1
                      while (lo < hi) { const mid = (lo + hi) >> 1; if (frames[mid].time < occTime) lo = mid + 1; else hi = mid }
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
                style={{
                  color: severityColor(issue.severity),
                  opacity: issue.axis !== uiStore.selectedAxis ? 0.35 : undefined,
                }}
              >
                <IssueDot style={{ backgroundColor: severityColor(issue.severity) }} />
                {shortLabel(issue)}
              </IssuePill>
            ))}
          </IssuePillList>
        </IssueSummaryStrip>
      )}

      <ChartContainer data-testid="chart-container" ref={chartContainerCallbackRef}>
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
              dataKey="time" type="number"
              domain={chartData.length > 0 ? [chartData[0].time, chartData[chartData.length - 1].time] : [0, 1]}
              allowDataOverflow height={50}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -2 }}
              stroke={theme.colors.chart.axis} tick={{ dy: 4 }}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            <YAxis yAxisId="primary" width={65} domain={yDomain} allowDataOverflow
              label={{ value: 'deg/s', angle: -90, position: 'insideLeft' }} stroke={theme.colors.chart.axis}
              tickFormatter={(value: number) => Math.round(value).toString()} />
            <YAxis yAxisId="motor" hide domain={motorDomain} allowDataOverflow />
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

            {/* Issue reference lines */}
            {(() => {
              const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
              const allLines: { x: number; issue: typeof visibleIssues[0]; idx: number; isSelected: boolean; sev: number }[] = []
              for (const issue of visibleIssues) {
                if (!uiStore.showIssues && issue.id !== analysisStore.selectedIssueId) continue
                const times = issue.occurrences ?? [issue.timeRange]
                const isIssueSelected = issue.id === analysisStore.selectedIssueId
                for (let idx = 0; idx < times.length; idx++) {
                  const isThisOcc = isIssueSelected && analysisStore.selectedOccurrenceIdx === idx
                  const peakT = (issue.peakTimes?.[idx] ?? issue.metrics.peakTime ?? (times[idx][0] + times[idx][1]) / 2) / 1000000
                  allLines.push({ x: peakT, issue, idx, isSelected: isThisOcc, sev: sevRank[issue.severity] ?? 2 })
                }
              }
              const posHighest = new Map<string, number>()
              const posHasSelected = new Map<string, boolean>()
              for (const l of allLines) {
                const xKey = l.x.toFixed(6)
                const best = posHighest.get(xKey)
                if (best === undefined || l.sev < best) posHighest.set(xKey, l.sev)
                if (l.isSelected) posHasSelected.set(xKey, true)
              }
              allLines.sort((a, b) => b.sev - a.sev || (a.isSelected ? 1 : -1))
              return allLines.flatMap(l => {
                const xKey = l.x.toFixed(6)
                const isHighestAtPos = l.sev === posHighest.get(xKey)
                const anySelectedAtPos = posHasSelected.get(xKey) ?? false
                const showAsSelected = isHighestAtPos && anySelectedAtPos
                const elements = []
                if (showAsSelected && showGlow) {
                  elements.push(
                    <ReferenceLine key={`issue-glow-${l.issue.id}-${l.idx}`} x={l.x} yAxisId="primary"
                      stroke={severityColor(l.issue.severity)} strokeWidth={10} strokeOpacity={0.25} ifOverflow="hidden" />
                  )
                }
                const isOnAxis = l.issue.axis === uiStore.selectedAxis
                const lineOpacity = showAsSelected || isOnAxis ? undefined : 0.25
                elements.push(
                  <ReferenceLine key={`issue-${l.issue.id}-${l.idx}`} x={l.x} yAxisId="primary"
                    stroke={severityColor(l.issue.severity)} strokeWidth={showAsSelected ? 3.5 : 1.5}
                    strokeDasharray={showAsSelected ? undefined : '4 3'} strokeOpacity={lineOpacity} ifOverflow="hidden" />
                )
                return elements
              })
            })()}

            {uiStore.showGyro && (
              <Line type="monotone" dataKey="gyro" yAxisId="primary" stroke={theme.colors.chart.gyro}
                strokeWidth={2} dot={false} name="Gyro" isAnimationActive={false} />
            )}
            {uiStore.showSetpoint && (
              <Line type="monotone" dataKey="setpoint" yAxisId="primary" stroke={theme.colors.chart.setpoint}
                strokeWidth={2} dot={false} name="Setpoint" isAnimationActive={false} strokeDasharray="5 5" />
            )}
            {uiStore.showPidD && (
              <Line type="monotone" dataKey="pidD" yAxisId="primary" stroke={theme.colors.chart.pidD}
                strokeWidth={1.5} dot={false} name="D-term" isAnimationActive={false} />
            )}
            {uiStore.showMotors && (
              <>
                <Line type="monotone" dataKey="motor1" yAxisId="motor" stroke={theme.colors.chart.motor1}
                  strokeWidth={1} dot={false} name="M1" isAnimationActive={false} strokeOpacity={0.6} />
                <Line type="monotone" dataKey="motor2" yAxisId="motor" stroke={theme.colors.chart.motor2}
                  strokeWidth={1} dot={false} name="M2" isAnimationActive={false} strokeOpacity={0.6} />
                <Line type="monotone" dataKey="motor3" yAxisId="motor" stroke={theme.colors.chart.motor3}
                  strokeWidth={1} dot={false} name="M3" isAnimationActive={false} strokeOpacity={0.6} />
                <Line type="monotone" dataKey="motor4" yAxisId="motor" stroke={theme.colors.chart.motor4}
                  strokeWidth={1} dot={false} name="M4" isAnimationActive={false} strokeOpacity={0.6} />
              </>
            )}
            {uiStore.showThrottle && (
              <Line type="monotone" dataKey="throttle" yAxisId="motor" stroke={theme.colors.chart.throttle}
                strokeWidth={1.5} dot={false} name="Throttle" isAnimationActive={false} strokeOpacity={0.7} />
            )}
          </LineChart>
        </ResponsiveContainer>

        {visibleLabels.length > 0 && (
          <LabelOverlay data-testid="label-overlay">
            {visibleLabels.map(label => (
              <ChartLabel
                key={label.key}
                data-testid="chart-label"
                style={{ left: `${label.pxLeft}px`, color: label.color, fontSize: `${label.fontSize}px`, fontWeight: label.fontWeight, opacity: label.onAxis ? undefined : 0.3 }}
                onMouseEnter={(e) => {
                  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
                  const sorted = [...label.issues].sort((a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2))
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

        <HoverPopover ref={popoverRef} data-testid="issue-popover" style={{ display: 'none' }} />

        {uiStore.axisHighlight && (
          <AxisSwitchToast key={uiStore.axisHighlightKey} data-testid="axis-switch-toast">
            Switched to {uiStore.axisHighlight} axis
          </AxisSwitchToast>
        )}
      </ChartContainer>

      <ZoomControls>
        <ZoomHeader>
          <ZoomInfoLabel>{zoomLevel.toFixed(1)}x ({windowSec.toFixed(1)}s window)</ZoomInfoLabel>
          <ZoomResetBtn data-testid="zoom-reset-button" onClick={() => uiStore.setZoom(0, 100)}>Reset</ZoomResetBtn>
        </ZoomHeader>
        <RangeSlider
          start={uiStore.zoomStart} end={uiStore.zoomEnd} onChange={handleRangeChange}
          onDragStart={() => setIsDraggingObs(true)} onDragEnd={() => setIsDraggingObs(false)}
        />
      </ZoomControls>
    </ChartWrapper>
  )
})
