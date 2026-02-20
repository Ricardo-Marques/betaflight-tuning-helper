import { observer, useLocalObservable } from 'mobx-react-lite'
import { useTheme } from '@emotion/react'
import { useRef, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useUIStore } from '../stores/RootStore'
import { useAutorun, useObservableState } from '../lib/mobx-reactivity'
import type { SpectrumDataResult } from './logChart/useSpectrumData'
import {
  SpectrumContainer, SpectrumInfo, SpectrumInfoLabel,
  PeakBadge, PeakDot, InsufficientData,
} from './SpectrumChart.styles'
import { LabelOverlay, ChartLabel } from './LogChart.styles'

const PLOT_MARGIN_LEFT = 5 + 65 // chart margin.left + YAxis width
const PLOT_MARGIN_RIGHT = 5     // chart margin.right
const MIN_LABEL_GAP = 70

interface SpectrumChartProps {
  spectrumResult: SpectrumDataResult
}

export const SpectrumChart = observer(({ spectrumResult }: SpectrumChartProps) => {
  const theme = useTheme()
  const uiStore = useUIStore()
  const { spectrumData, peaks, displayMax, sampleRate, frameCount } = spectrumResult

  // Container ref for scroll-to-zoom and width tracking
  const containerRef = useRef<HTMLDivElement>(null)
  const mountedBox = useLocalObservable(() => ({ value: false }))
  const containerCallbackRef = useCallback((el: HTMLDivElement | null) => {
    const mutableRef = containerRef as React.MutableRefObject<HTMLDivElement | null>
    mutableRef.current = el
    mountedBox.value = el !== null
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [containerWidth, setContainerWidth] = useObservableState(0)

  // ResizeObserver for container width
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  useAutorun(() => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
      resizeObserverRef.current = null
    }
    if (!mountedBox.value) return
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    resizeObserverRef.current = ro
  })

  // Scroll-to-zoom on spectrum chart — zooms frequency axis
  const wheelCleanupRef = useRef<(() => void) | null>(null)
  useAutorun(() => {
    wheelCleanupRef.current?.()
    wheelCleanupRef.current = null
    if (!mountedBox.value) return
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const zs = uiStore.spectrumZoomStart
      const ze = uiStore.spectrumZoomEnd
      const dur = ze - zs
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85
      const newDur = Math.min(100, Math.max(1, dur * factor))
      const rect = el.getBoundingClientRect()
      const plotLeft = rect.left + PLOT_MARGIN_LEFT
      const plotRight = rect.right - PLOT_MARGIN_RIGHT
      const plotW = plotRight - plotLeft
      const cursorRatio = plotW > 0
        ? Math.max(0, Math.min(1, (e.clientX - plotLeft) / plotW))
        : 0.5
      const center = zs + dur * cursorRatio
      let newStart = center - newDur * cursorRatio
      let newEnd = center + newDur * (1 - cursorRatio)
      if (newStart < 0) { newEnd -= newStart; newStart = 0 }
      if (newEnd > 100) { newStart -= newEnd - 100; newEnd = 100 }
      uiStore.setSpectrumZoom(Math.max(0, newStart), Math.min(100, newEnd))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    wheelCleanupRef.current = () => el.removeEventListener('wheel', handleWheel)
  })

  if (spectrumData.length === 0) {
    return (
      <SpectrumContainer>
        <InsufficientData>
          {frameCount > 0
            ? 'Not enough data for spectrum analysis'
            : 'No data available'}
        </InsufficientData>
      </SpectrumContainer>
    )
  }

  // Compute visible frequency range from spectrum zoom
  const xMin = (uiStore.spectrumZoomStart / 100) * displayMax
  const xMax = (uiStore.spectrumZoomEnd / 100) * displayMax

  // Filter spectrum data to visible range
  const visibleData = spectrumData.filter(p => p.frequency >= xMin && p.frequency <= xMax)

  // Recompute Y-axis max from visible data only
  let visibleMaxMag = 0
  for (const p of visibleData) {
    if (p.magnitude > visibleMaxMag) visibleMaxMag = p.magnitude
  }
  const yMax = visibleMaxMag * 1.1

  // Filter peaks to visible range
  const visiblePeaks = peaks.filter(p => p.frequency >= xMin && p.frequency <= xMax)

  // Compute deconflicted peak labels within visible range
  const plotWidth = containerWidth - PLOT_MARGIN_LEFT - PLOT_MARGIN_RIGHT
  const freqRange = xMax - xMin
  const peakLabels: { frequency: number; px: number }[] = []
  if (plotWidth > 0 && freqRange > 0) {
    const sorted = [...visiblePeaks].sort((a, b) => b.magnitude - a.magnitude)
    for (const peak of sorted) {
      const px = PLOT_MARGIN_LEFT + ((peak.frequency - xMin) / freqRange) * plotWidth
      if (peakLabels.every(p => Math.abs(p.px - px) >= MIN_LABEL_GAP)) {
        peakLabels.push({ frequency: peak.frequency, px })
      }
    }
  }

  return (
    <SpectrumContainer data-testid="spectrum-chart" ref={containerCallbackRef}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={visibleData}
          margin={{ top: 20, right: 5, bottom: 5, left: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.chart.grid} />
          <XAxis
            dataKey="frequency"
            type="number"
            domain={[xMin, xMax]}
            allowDataOverflow
            height={50}
            label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -2 }}
            stroke={theme.colors.chart.axis}
            tick={{ dy: 4 }}
            tickFormatter={(v: number) => `${Math.round(v)}`}
          />
          <YAxis
            width={65}
            domain={[0, yMax]}
            allowDataOverflow
            label={{ value: 'Magnitude (deg/s)', angle: -90, position: 'insideLeft' }}
            stroke={theme.colors.chart.axis}
            tickFormatter={(v: number) => v >= 1 ? Math.round(v).toString() : v.toFixed(1)}
          />
          <Tooltip
            labelFormatter={(v: number) => `${v.toFixed(1)} Hz`}
            formatter={(v: number) => [v.toFixed(2), 'Magnitude']}
            contentStyle={{
              backgroundColor: theme.colors.chart.tooltipBg,
              border: `1px solid ${theme.colors.chart.tooltipBorder}`,
              borderRadius: '6px',
              color: theme.colors.text.primary,
            }}
          />

          {visiblePeaks.map(peak => (
            <ReferenceLine
              key={`peak-${peak.frequency}`}
              x={peak.frequency}
              stroke={theme.colors.chart.gyro}
              strokeDasharray="4 3"
              strokeOpacity={0.7}
            />
          ))}

          <defs>
            <linearGradient id="spectrumFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.colors.chart.gyro} stopOpacity={0.4} />
              <stop offset="100%" stopColor={theme.colors.chart.gyro} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="magnitude"
            stroke={theme.colors.chart.gyro}
            strokeWidth={1.5}
            fill="url(#spectrumFill)"
            isAnimationActive={false}
            name="Magnitude"
          />
        </AreaChart>
      </ResponsiveContainer>

      {peakLabels.length > 0 && (
        <LabelOverlay>
          {peakLabels.map(label => (
            <ChartLabel
              key={label.frequency}
              style={{
                left: `${label.px}px`,
                color: theme.colors.chart.gyro,
                fontSize: '10px',
              }}
            >
              {Math.round(label.frequency)} Hz
            </ChartLabel>
          ))}
        </LabelOverlay>
      )}

      <SpectrumInfo>
        <SpectrumInfoLabel>
          {frameCount.toLocaleString()} frames at {(sampleRate / 1000).toFixed(1)}k Hz
        </SpectrumInfoLabel>
        {visiblePeaks.length > 0 && visiblePeaks.map(peak => (
          <PeakBadge key={peak.frequency}>
            <PeakDot style={{ backgroundColor: theme.colors.chart.gyro }} />
            {Math.round(peak.frequency)} Hz
          </PeakBadge>
        ))}
      </SpectrumInfo>
    </SpectrumContainer>
  )
})
