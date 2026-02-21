/**
 * Log chart component for the Android app.
 *
 * Uses Victory Native XL (victory-native + @shopify/react-native-skia) to render
 * gyro, setpoint, and PID data. The downsampling logic is ported directly from
 * the web app's useChartData.ts — no DOM dependencies.
 *
 * NOTE: This component requires victory-native, @shopify/react-native-skia,
 * react-native-gesture-handler, and react-native-reanimated to be installed
 * and linked in the native Android project before use.
 */
import React, { useMemo } from 'react'
import { View, StyleSheet, Text } from 'react-native'
import { observer } from 'mobx-react-lite'
import { CartesianChart, Line } from 'victory-native'
import { useLogStore } from '../stores/RootStore'
import type { LogFrame } from '@bf-tuner/domain/types/LogFrame'
import type { Axis } from '@bf-tuner/domain/types/Analysis'

type ChartAxis = 'roll' | 'pitch' | 'yaw'

interface ChartPoint {
  time: number
  gyro: number
  setpoint: number
  pidSum: number
  [key: string]: number
}

/**
 * Downsample frames to at most `maxPoints` points using min-max bucket sampling.
 * Preserves the signal envelope (peaks and troughs) which is critical for
 * identifying oscillation issues.
 */
function downsample(frames: LogFrame[], axis: ChartAxis, maxPoints: number): ChartPoint[] {
  if (frames.length <= maxPoints) {
    return frames.map(f => ({
      time: f.time / 1e6,
      gyro: f.gyroADC[axis],
      setpoint: f.setpoint[axis],
      pidSum: f.pidSum[axis],
    }))
  }

  const bucketCount = maxPoints >> 1
  const bucketSize = frames.length / bucketCount
  const result: ChartPoint[] = []

  for (let b = 0; b < bucketCount; b++) {
    const bStart = Math.floor(b * bucketSize)
    const bEnd = Math.floor((b + 1) * bucketSize)
    if (bStart >= frames.length) break

    let minFrame = frames[bStart]
    let maxFrame = frames[bStart]
    let minGyro = frames[bStart].gyroADC[axis]
    let maxGyro = frames[bStart].gyroADC[axis]

    for (let i = bStart + 1; i < bEnd && i < frames.length; i++) {
      const g = frames[i].gyroADC[axis]
      if (g < minGyro) { minGyro = g; minFrame = frames[i] }
      if (g > maxGyro) { maxGyro = g; maxFrame = frames[i] }
    }

    if (minFrame.time <= maxFrame.time) {
      result.push({ time: minFrame.time / 1e6, gyro: minFrame.gyroADC[axis], setpoint: minFrame.setpoint[axis], pidSum: minFrame.pidSum[axis] })
      result.push({ time: maxFrame.time / 1e6, gyro: maxFrame.gyroADC[axis], setpoint: maxFrame.setpoint[axis], pidSum: maxFrame.pidSum[axis] })
    } else {
      result.push({ time: maxFrame.time / 1e6, gyro: maxFrame.gyroADC[axis], setpoint: maxFrame.setpoint[axis], pidSum: maxFrame.pidSum[axis] })
      result.push({ time: minFrame.time / 1e6, gyro: minFrame.gyroADC[axis], setpoint: minFrame.setpoint[axis], pidSum: minFrame.pidSum[axis] })
    }
  }

  return result.sort((a, b) => a.time - b.time)
}

interface Props {
  axis?: ChartAxis
  showSetpoint?: boolean
  showPidSum?: boolean
  zoomStart?: number
  zoomEnd?: number
}

export const LogChart = observer(function LogChart({
  axis = 'roll',
  showSetpoint = true,
  showPidSum = false,
  zoomStart = 0,
  zoomEnd = 100,
}: Props) {
  const logStore = useLogStore()
  const { frames } = logStore

  const chartData = useMemo(() => {
    if (frames.length === 0) return []

    const totalFrames = frames.length
    const startIdx = Math.floor((zoomStart / 100) * totalFrames)
    const endIdx = Math.min(Math.ceil((zoomEnd / 100) * totalFrames), totalFrames)
    const visible = frames.slice(startIdx, endIdx)

    return downsample(visible, axis, 800)
  }, [frames, axis, zoomStart, zoomEnd])

  const yDomain = useMemo(() => {
    const sig = logStore.signalDomains[axis as Axis]
    return [sig[0], sig[1]] as [number, number]
  }, [logStore.signalDomains, axis])

  if (frames.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No log loaded</Text>
      </View>
    )
  }

  if (chartData.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No data in range</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CartesianChart
        data={chartData}
        xKey="time"
        yKeys={['gyro', showSetpoint ? 'setpoint' : undefined, showPidSum ? 'pidSum' : undefined].filter(Boolean) as ('gyro' | 'setpoint' | 'pidSum')[]}
        domain={{ y: yDomain }}
        axisOptions={{
          font: null,
          tickCount: { x: 5, y: 5 },
          labelOffset: { x: 2, y: 4 },
          labelColor: '#888',
          lineColor: '#333',
          formatXLabel: (v) => `${v.toFixed(1)}s`,
          formatYLabel: (v) => String(Math.round(v)),
        }}
      >
        {({ points }) => (
          <>
            <Line
              points={points.gyro}
              color="#4CAF50"
              strokeWidth={1.5}
              animate={{ type: 'timing', duration: 100 }}
            />
            {showSetpoint && points.setpoint && (
              <Line
                points={points.setpoint}
                color="#FF9800"
                strokeWidth={1.5}
                animate={{ type: 'timing', duration: 100 }}
              />
            )}
            {showPidSum && points.pidSum && (
              <Line
                points={points.pidSum}
                color="#2196F3"
                strokeWidth={1.5}
                animate={{ type: 'timing', duration: 100 }}
              />
            )}
          </>
        )}
      </CartesianChart>

      <View style={styles.legend}>
        <LegendItem color="#4CAF50" label="Gyro" />
        {showSetpoint && <LegendItem color="#FF9800" label="Setpoint" />}
        {showPidSum && <LegendItem color="#2196F3" label="PID Sum" />}
      </View>
    </View>
  )
})

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
  legend: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: '#ccc',
    fontSize: 12,
  },
})
