import { observer, useLocalObservable } from 'mobx-react-lite'
import { useTheme } from '@emotion/react'
import { useRef, useCallback } from 'react'
import { useLogStore, useUIStore, useAnalysisStore } from '../stores/RootStore'
import { useObservableState, useAutorun } from '../lib/mobx-reactivity'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  ChartWrapper, EmptyState, AxisBar, AxisLabel, AxisButton,
  ToggleBar, ToggleChip, ToggleChipDot, ToggleChipWrapper, ToggleChipTooltip,
  IssueSummaryStrip, IssueSummaryLabel, IssueSummaryLink, IssuePillList, IssuePill, IssueDot, IssuePillOverflow,
  ChartContainer, LabelOverlay, ChartLabel, HoverPopover, DataTooltip,
  ZoomControls, ZoomHeader, ZoomInfoLabel, ZoomResetBtn,
  AxisSwitchToast,
  ChartLegend, LegendItem, LegendSwatch,
} from './LogChart.styles'
import { RangeSlider } from './RangeSlider'
import type { LogFrame } from '../domain/types/LogFrame'
import { useChartData } from './logChart/useChartData'
import { useSpectrumData } from './logChart/useSpectrumData'
import { useIssueLabels, shortLabel } from './logChart/useIssueLabels'
import { useIssuePopover } from './logChart/useIssuePopover'
import type { HoveredIssues } from './logChart/useIssuePopover'
import { useChartInteractions, resolveTooltipCollision } from './logChart/useChartInteractions'
import { SpectrumChart } from './SpectrumChart'

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
  const issueStripRef = useRef<HTMLDivElement>(null)
  const stripHeightRef = useRef<number>(0)
  const chipTooltipRef = useRef<HTMLDivElement>(null)
  const dataTooltipRef = useRef<HTMLDivElement>(null)

  // Shared observable state
  const [isDraggingObs, setIsDraggingObs] = useObservableState(false)
  const [tooltipSuppressed, setTooltipSuppressed] = useObservableState(false)
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

  const { zoomDuration, visibleFrames, timeDomain, yDomain, motorDomain, pidDomain } = useChartData()
  const spectrumResult = useSpectrumData()
  const { visibleIssues, visibleLabels, visibleReferenceLines } = useIssueLabels(visibleFrames, containerWidth, severityColor)

  const popoverRefs = { popoverRef, hoveredIssuesRef, popoverSourceRef, forcedPopoverTimer, hoverClearTimer, glowTimer, chartContainerRef }
  const popoverActions = useIssuePopover(popoverRefs, severityColor)
  const { showGlow, updateHoverPopover } = popoverActions

  const interactionRefs = { chartContainerRef, hoveredIssuesRef, popoverSourceRef, popoverRef, hoverClearTimer, forcedPopoverTimer, dataTooltipRef }
  const { handleChartMouseMove, handleChartMouseLeave, handleChartMouseDown, handleChartMouseUp, handleRangeChange, popoverCooldownUntil } =
    useChartInteractions(interactionRefs, {
      setIsDraggingObs, setTooltipSuppressed, setContainerWidth,
      triggerFullZoomHint: () => triggerZoomHint('Fully zoomed out — use mouse wheel or slider to zoom in'),
      triggerMaxZoomHint: () => triggerZoomHint('Maximum zoom reached'),
      triggerEdgeHint: () => triggerZoomHint("You've reached the edge of the log"),
    }, visibleLabels, visibleFrames, isDraggingObs, popoverActions, chartMountedBox)

  // Auto-switch axis when an issue on a different axis is selected
  useAutorun(() => {
    const issue = analysisStore.selectedIssue
    if (issue && issue.axis !== uiStore.selectedAxis) {
      uiStore.setAxis(issue.axis)
      uiStore.flashAxisHighlight(issue.axis)
    }
  })

  // Pill overflow measurement state (measurement runs after showUpdating is computed below)
  const pillListRef = useRef<HTMLDivElement>(null)
  const [overflowCount, setOverflowCount] = useObservableState(0)
  const rafRef = useRef<number>(0)

  // Zoom/pan hint toast — triggered directly by interaction handlers
  const [zoomHintMessage, setZoomHintMessage] = useObservableState('')
  const zoomHintKeyRef = useRef(0)
  const zoomHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentHintRef = useRef('')

  const lastHintTime = useRef(0)

  const triggerZoomHint = (message: string): void => {
    const now = Date.now()
    // Restart animation if message changed or toast has started fading (1.2s into 1.5s animation)
    if (currentHintRef.current !== message || now - lastHintTime.current > 1200) {
      zoomHintKeyRef.current++
      lastHintTime.current = now
    }
    currentHintRef.current = message
    setZoomHintMessage(message)
    if (zoomHintTimerRef.current) clearTimeout(zoomHintTimerRef.current)
    zoomHintTimerRef.current = setTimeout(() => {
      currentHintRef.current = ''
      setZoomHintMessage('')
      zoomHintTimerRef.current = null
    }, 1600)
  }

  // Zoom info
  const totalDuration = logStore.duration
  const windowSec = (zoomDuration / 100) * totalDuration
  const zoomLevel = 100 / zoomDuration
  const showUpdating = isDraggingObs && zoomDuration < 99.99 && uiStore.showIssues
  const minZoomWindow = totalDuration > 0 ? (0.2 / totalDuration) * 100 : 1

  // Capture strip height when not updating so we can preserve it during drag
  if (!showUpdating && issueStripRef.current) {
    stripHeightRef.current = issueStripRef.current.offsetHeight
  }

  // Measure pill overflow after each paint where pills are visible
  if (!showUpdating && visibleIssues.length > 0 && uiStore.showIssues) {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const el = pillListRef.current
      if (!el || el.children.length === 0) return
      const containerRight = el.getBoundingClientRect().right
      let hidden = 0
      for (let i = el.children.length - 1; i >= 0; i--) {
        if ((el.children[i] as HTMLElement).getBoundingClientRect().right > containerRight + 1) {
          hidden++
        } else {
          break
        }
      }
      if (hidden !== overflowCount) setOverflowCount(hidden)
    })
  } else if (overflowCount !== 0) {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setOverflowCount(0))
  }

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
        <ToggleChip
          data-testid="toggle-spectrum"
          role="checkbox"
          aria-checked={uiStore.chartMode === 'spectrum'}
          isActive={uiStore.chartMode === 'spectrum'}
          chipColor={theme.colors.chart.gyro}
          onClick={uiStore.toggleChartMode}
        >
          Noise spectrum view
        </ToggleChip>
        {uiStore.chartMode === 'time' && <ToggleBar compact={uiStore.isMobileLayout}>
          <ToggleChip data-testid="toggle-gyro" role="checkbox" aria-checked={uiStore.showGyro} isActive={uiStore.showGyro} chipColor={theme.colors.chart.gyro} onClick={uiStore.toggleGyro}>
            <ToggleChipDot dotColor={theme.colors.chart.gyro} />Gyro
          </ToggleChip>
          <ToggleChip data-testid="toggle-setpoint" role="checkbox" aria-checked={uiStore.showSetpoint} isActive={uiStore.showSetpoint} chipColor={theme.colors.chart.setpoint} onClick={uiStore.toggleSetpoint}>
            <ToggleChipDot dotColor={theme.colors.chart.setpoint} />Setpoint
          </ToggleChip>
          <ToggleChip data-testid="toggle-pidp" role="checkbox" aria-checked={uiStore.showPidP} isActive={uiStore.showPidP} chipColor={theme.colors.chart.pidP} onClick={uiStore.togglePidP}>
            <ToggleChipDot dotColor={theme.colors.chart.pidP} />P-term
          </ToggleChip>
          <ToggleChip data-testid="toggle-pidi" role="checkbox" aria-checked={uiStore.showPidI} isActive={uiStore.showPidI} chipColor={theme.colors.chart.pidI} onClick={uiStore.togglePidI}>
            <ToggleChipDot dotColor={theme.colors.chart.pidI} />I-term
          </ToggleChip>
          <ToggleChip data-testid="toggle-dterm" role="checkbox" aria-checked={uiStore.showPidD} isActive={uiStore.showPidD} chipColor={theme.colors.chart.pidD} onClick={uiStore.togglePidD}>
            <ToggleChipDot dotColor={theme.colors.chart.pidD} />D-term
          </ToggleChip>
          <ToggleChip data-testid="toggle-pidsum" role="checkbox" aria-checked={uiStore.showPidSum} isActive={uiStore.showPidSum} chipColor={theme.colors.chart.pidSum} onClick={uiStore.togglePidSum}>
            <ToggleChipDot dotColor={theme.colors.chart.pidSum} />PID Sum
          </ToggleChip>
          {logStore.hasFeedforward && (
            <ToggleChip data-testid="toggle-feedforward" role="checkbox" aria-checked={uiStore.showFeedforward} isActive={uiStore.showFeedforward} chipColor={theme.colors.chart.feedforward} onClick={uiStore.toggleFeedforward}>
              <ToggleChipDot dotColor={theme.colors.chart.feedforward} />FF
            </ToggleChip>
          )}
          <ToggleChip data-testid="toggle-motors" role="checkbox" aria-checked={uiStore.showMotors} isActive={uiStore.showMotors} chipColor={theme.colors.chart.motor1} onClick={uiStore.toggleMotors}>
            <ToggleChipDot dotColor={theme.colors.chart.motor1} />Motors
          </ToggleChip>
          <ToggleChip data-testid="toggle-throttle" role="checkbox" aria-checked={uiStore.showThrottle} isActive={uiStore.showThrottle} chipColor={theme.colors.chart.throttle} onClick={uiStore.toggleThrottle}>
            <ToggleChipDot dotColor={theme.colors.chart.throttle} />Throttle
          </ToggleChip>
          {analysisStore.analysisStatus === 'analyzing' ? (
            <ToggleChipWrapper
              onMouseEnter={e => {
                const tt = chipTooltipRef.current
                if (!tt) return
                const rect = e.currentTarget.getBoundingClientRect()
                tt.style.display = 'block'
                tt.style.top = `${rect.bottom + 6}px`
                tt.style.left = `${rect.left + rect.width / 2}px`
                tt.style.transform = 'translateX(-50%)'
              }}
              onMouseLeave={() => {
                const tt = chipTooltipRef.current
                if (tt) tt.style.display = 'none'
              }}
            >
              <ToggleChip data-testid="toggle-issues" role="checkbox" aria-checked={uiStore.showIssues} isActive={uiStore.showIssues} disabled>
                Issues
              </ToggleChip>
            </ToggleChipWrapper>
          ) : (
            <ToggleChip data-testid="toggle-issues" role="checkbox" aria-checked={uiStore.showIssues} isActive={uiStore.showIssues} onClick={uiStore.toggleIssues}>
              Issues
            </ToggleChip>
          )}
        </ToggleBar>}
      </AxisBar>

      {(analysisStore.analysisStatus === 'analyzing' || analysisStore.isComplete) && uiStore.chartMode === 'time' && (
        <IssueSummaryStrip data-testid="issues-in-view" data-issue-zone ref={issueStripRef}
          style={showUpdating && stripHeightRef.current ? { height: stripHeightRef.current } : undefined}
        >
          {analysisStore.analysisStatus === 'analyzing' ? (
            <IssueSummaryLabel>Analyzing flight data...</IssueSummaryLabel>
          ) : showUpdating ? (
            <IssueSummaryLabel>Updating...</IssueSummaryLabel>
          ) : !uiStore.showIssues ? (
            <>
              <IssueSummaryLabel>Issues hidden</IssueSummaryLabel>
              <IssueSummaryLink onClick={uiStore.toggleIssues}>Show issues</IssueSummaryLink>
            </>
          ) : visibleIssues.length === 0 ? (
            <IssueSummaryLabel>No issues in view</IssueSummaryLabel>
          ) : (
            <>
              <IssueSummaryLabel>{visibleIssues.length} issue{visibleIssues.length !== 1 ? 's' : ''} in view</IssueSummaryLabel>
              <IssuePillList ref={pillListRef}>
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
                      if (uiStore.isMobileLayout) {
                        uiStore.setMobileActiveTab('tune')
                      }
                      uiStore.setActiveRightTab('issues')
                      if (!uiStore.isMobileLayout && !uiStore.rightPanelOpen) uiStore.toggleRightPanel()
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
              {overflowCount > 0 && (
                <IssuePillOverflow>...and {overflowCount} more</IssuePillOverflow>
              )}
            </>
          )}
        </IssueSummaryStrip>
      )}

      {uiStore.chartMode === 'spectrum' ? (
        <SpectrumChart spectrumResult={spectrumResult} />
      ) : (
      <ChartContainer data-testid="chart-container" data-issue-zone ref={chartContainerCallbackRef}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={visibleFrames}
            margin={{ top: 20, right: 5, bottom: 5, left: 5 }}
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.chart.grid} />
            <XAxis
              dataKey={(f: LogFrame) => f.time / 1e6} type="number"
              domain={timeDomain}
              allowDataOverflow height={50}
              label={{ value: 'Time', position: 'insideBottom', offset: -2 }}
              stroke={theme.colors.chart.axis} tick={{ dy: 4 }}
              tickFormatter={(value: number) => value >= 60 ? `${Math.floor(value / 60)}m:${String(Math.floor(value % 60)).padStart(2, '0')}s` : `${value.toFixed(1)}s`}
            />
            <YAxis yAxisId="primary" width={65} domain={yDomain} allowDataOverflow
              label={{ value: 'deg/s', angle: -90, position: 'insideLeft' }} stroke={theme.colors.chart.axis}
              tickFormatter={(value: number) => Math.round(value).toString()} />
            <YAxis yAxisId="pid" hide domain={pidDomain} allowDataOverflow />
            <YAxis yAxisId="motor" hide domain={motorDomain} allowDataOverflow />
            <Tooltip
              active={(isDraggingObs || tooltipSuppressed) ? false : undefined}
              content={() => null}
            />

            {/* Issue reference lines (downsampled by severity priority) */}
            {visibleReferenceLines.flatMap(entry => {
              const isOnAxis = entry.issue.axis === uiStore.selectedAxis
              const hasSelection = analysisStore.selectedIssueId !== null
              const lineOpacity = entry.isSelected
                ? undefined
                : hasSelection
                  ? 0.3
                  : isOnAxis ? undefined : 0.25
              const elements = []
              if (entry.isSelected && showGlow) {
                elements.push(
                  <ReferenceLine key={`issue-glow-${entry.key}`} x={entry.x} yAxisId="primary"
                    stroke={severityColor(entry.issue.severity)} strokeWidth={10} strokeOpacity={0.25} ifOverflow="hidden" />
                )
              }
              if (entry.isSelected) {
                elements.push(
                  <ReferenceLine key={`issue-outline-${entry.key}`} x={entry.x} yAxisId="primary"
                    stroke={theme.colors.background.app} strokeWidth={7} ifOverflow="hidden" />
                )
              }
              elements.push(
                <ReferenceLine key={`issue-${entry.key}`} x={entry.x} yAxisId="primary"
                  stroke={severityColor(entry.issue.severity)} strokeWidth={entry.isSelected ? 3.5 : 1.5}
                  strokeDasharray={entry.isSelected ? undefined : '4 3'} strokeOpacity={lineOpacity} ifOverflow="hidden" />
              )
              return elements
            })}

            {uiStore.showGyro && (
              <Line type="monotone" dataKey={(f: LogFrame) => f.gyroADC[uiStore.selectedAxis]} yAxisId="primary" stroke={theme.colors.chart.gyro}
                strokeWidth={2} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="Gyro" isAnimationActive={false} />
            )}
            {uiStore.showSetpoint && (
              <Line type="monotone" dataKey={(f: LogFrame) => f.setpoint[uiStore.selectedAxis]} yAxisId="primary" stroke={theme.colors.chart.setpoint}
                strokeWidth={2} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="Setpoint" isAnimationActive={false} strokeDasharray="5 5" />
            )}
            {uiStore.showPidP && (
              <Line type="monotone" dataKey={(f: LogFrame) => f.pidP[uiStore.selectedAxis]} yAxisId="pid" stroke={theme.colors.chart.pidP}
                strokeWidth={1.5} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="P-term" isAnimationActive={false} />
            )}
            {uiStore.showPidI && (
              <Line type="monotone" dataKey={(f: LogFrame) => f.pidI[uiStore.selectedAxis]} yAxisId="pid" stroke={theme.colors.chart.pidI}
                strokeWidth={1.5} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="I-term" isAnimationActive={false} />
            )}
            {uiStore.showPidD && (
              <Line type="monotone" dataKey={(f: LogFrame) => f.pidD[uiStore.selectedAxis]} yAxisId="pid" stroke={theme.colors.chart.pidD}
                strokeWidth={1.5} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="D-term" isAnimationActive={false} />
            )}
            {uiStore.showPidSum && (
              <Line type="monotone" dataKey={(f: LogFrame) => f.pidSum[uiStore.selectedAxis]} yAxisId="pid" stroke={theme.colors.chart.pidSum}
                strokeWidth={1.5} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="PID Sum" isAnimationActive={false} />
            )}
            {uiStore.showFeedforward && (
              <Line type="monotone" dataKey={(f: LogFrame) => f.feedforward?.[uiStore.selectedAxis]} yAxisId="pid" stroke={theme.colors.chart.feedforward}
                strokeWidth={1.5} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="FF" isAnimationActive={false} />
            )}
            {uiStore.showMotors && (
              <>
                <Line type="monotone" dataKey={(f: LogFrame) => f.motor[0]} yAxisId="motor" stroke={theme.colors.chart.motor1}
                  strokeWidth={1} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="M1" isAnimationActive={false} strokeOpacity={0.6} />
                <Line type="monotone" dataKey={(f: LogFrame) => f.motor[1]} yAxisId="motor" stroke={theme.colors.chart.motor2}
                  strokeWidth={1} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="M2" isAnimationActive={false} strokeOpacity={0.6} />
                <Line type="monotone" dataKey={(f: LogFrame) => f.motor[2]} yAxisId="motor" stroke={theme.colors.chart.motor3}
                  strokeWidth={1} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="M3" isAnimationActive={false} strokeOpacity={0.6} />
                <Line type="monotone" dataKey={(f: LogFrame) => f.motor[3]} yAxisId="motor" stroke={theme.colors.chart.motor4}
                  strokeWidth={1} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="M4" isAnimationActive={false} strokeOpacity={0.6} />
              </>
            )}
            {uiStore.showThrottle && (
              <Line type="monotone" dataKey="throttle" yAxisId="motor" stroke={theme.colors.chart.throttle}
                strokeWidth={1.5} dot={false} activeDot={isDraggingObs || tooltipSuppressed ? false : undefined} name="Throttle" isAnimationActive={false} strokeOpacity={0.7} />
            )}
          </LineChart>
        </ResponsiveContainer>

        {visibleLabels.length > 0 && (
          <LabelOverlay data-testid="label-overlay">
            {visibleLabels.map(label => (
              <ChartLabel
                key={label.key}
                data-testid="chart-label"
                style={{ left: `${label.pxLeft}px`, color: label.color, fontSize: `${label.fontSize}px`, fontWeight: label.fontWeight, opacity: label.onAxis ? undefined : 0.3, zIndex: label.fontWeight === 'bold' ? 2 : 1 }}
                onClick={() => {
                  const pick = label.issueOccurrences[0]
                  analysisStore.selectIssue(pick.issue.id, pick.occIdx)
                  uiStore.setActiveRightTab('issues')
                  if (!uiStore.rightPanelOpen) uiStore.toggleRightPanel()
                }}
                onMouseEnter={(e) => {
                  if (isDraggingObs || performance.now() < popoverCooldownUntil.current) return
                  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
                  const sorted = [...label.issues].sort((a, b) => (sevRank[a.severity] ?? 2) - (sevRank[b.severity] ?? 2))
                  if (forcedPopoverTimer.current) { clearTimeout(forcedPopoverTimer.current); forcedPopoverTimer.current = null }
                  updateHoverPopover({ issues: sorted, x: e.clientX, y: e.clientY })
                  resolveTooltipCollision(dataTooltipRef.current, popoverRef.current, e.clientX, e.clientY)
                }}
                onMouseLeave={() => updateHoverPopover(null)}
              >
                {label.text}
              </ChartLabel>
            ))}
          </LabelOverlay>
        )}

        <HoverPopover ref={popoverRef} data-testid="issue-popover" style={{ display: 'none' }} />
        <DataTooltip ref={dataTooltipRef} style={{ display: 'none' }} />

        {uiStore.axisHighlight && (
          <AxisSwitchToast key={uiStore.axisHighlightKey} data-testid="axis-switch-toast">
            Switched to {uiStore.axisHighlight} axis
          </AxisSwitchToast>
        )}
        {zoomHintMessage && (
          <AxisSwitchToast key={`zoom-hint-${zoomHintKeyRef.current}`}>
            {zoomHintMessage}
          </AxisSwitchToast>
        )}
      </ChartContainer>
      )}

      {uiStore.chartMode === 'time' && <ChartLegend>
        {uiStore.showGyro && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.gyro }} />Gyro</LegendItem>
        )}
        {uiStore.showSetpoint && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.setpoint }} />Setpoint</LegendItem>
        )}
        {uiStore.showPidP && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.pidP }} />P-term</LegendItem>
        )}
        {uiStore.showPidI && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.pidI }} />I-term</LegendItem>
        )}
        {uiStore.showPidD && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.pidD }} />D-term</LegendItem>
        )}
        {uiStore.showPidSum && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.pidSum }} />PID Sum</LegendItem>
        )}
        {uiStore.showFeedforward && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.feedforward }} />FF</LegendItem>
        )}
        {uiStore.showMotors && (
          <>
            <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.motor1 }} />M1</LegendItem>
            <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.motor2 }} />M2</LegendItem>
            <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.motor3 }} />M3</LegendItem>
            <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.motor4 }} />M4</LegendItem>
          </>
        )}
        {uiStore.showThrottle && (
          <LegendItem><LegendSwatch style={{ backgroundColor: theme.colors.chart.throttle }} />Throttle</LegendItem>
        )}
      </ChartLegend>}

      <ZoomControls>
        <ZoomHeader>
          {uiStore.chartMode === 'spectrum' ? (() => {
            const dm = spectrumResult.displayMax
            const freqStart = Math.round((uiStore.spectrumZoomStart / 100) * dm)
            const freqEnd = Math.round((uiStore.spectrumZoomEnd / 100) * dm)
            return <ZoomInfoLabel>{freqStart} – {freqEnd} Hz</ZoomInfoLabel>
          })() : (
            <ZoomInfoLabel>{zoomLevel.toFixed(1)}x ({windowSec >= 60 ? `${Math.floor(windowSec / 60)}m:${String(Math.floor(windowSec % 60)).padStart(2, '0')}s` : `${windowSec.toFixed(1)}s`} window)</ZoomInfoLabel>
          )}
          <ZoomResetBtn data-testid="zoom-reset-button" onClick={() => {
            if (uiStore.chartMode === 'spectrum') uiStore.setSpectrumZoom(0, 100)
            else uiStore.setZoom(0, 100)
          }}>Reset</ZoomResetBtn>
        </ZoomHeader>
        {uiStore.chartMode === 'spectrum' ? (
          <RangeSlider
            start={uiStore.spectrumZoomStart} end={uiStore.spectrumZoomEnd}
            onChange={(start, end) => uiStore.setSpectrumZoom(start, end)}
            minWindow={1}
          />
        ) : (
          <RangeSlider
            start={uiStore.zoomStart} end={uiStore.zoomEnd} onChange={handleRangeChange}
            onDragStart={() => setIsDraggingObs(true)} onDragEnd={() => setIsDraggingObs(false)}
            onEdgeHit={() => triggerZoomHint("You've reached the edge of the log")}
            onFullZoomAttempt={() => triggerZoomHint('Fully zoomed out — use mouse wheel or slider to zoom in')}
            onMaxZoomAttempt={() => triggerZoomHint('Maximum zoom reached')}
            minWindow={minZoomWindow}
          />
        )}
      </ZoomControls>
      <ToggleChipTooltip ref={chipTooltipRef} style={{ display: 'none' }}>Analyzing flight data...</ToggleChipTooltip>
    </ChartWrapper>
  )
})
