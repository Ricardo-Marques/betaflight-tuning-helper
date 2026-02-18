import { useLogStore, useUIStore } from '../../stores/RootStore'
import { useComputed } from '../../lib/mobx-reactivity'
import type { LogFrame } from '../../domain/types/LogFrame'

export interface ChartDataPoint {
  time: number
  gyro: number
  setpoint: number
  pidSum: number
  pidP: number
  pidI: number
  pidD: number
  motor1: number
  motor2: number
  motor3: number
  motor4: number
  throttle: number
}

interface ChartDataResult {
  zoomDuration: number
  visibleFrames: LogFrame[]
  chartData: ChartDataPoint[]
  yDomain: [number, number]
}

export function useChartData(isDraggingObs: boolean): ChartDataResult {
  const logStore = useLogStore()
  const uiStore = useUIStore()

  const zoomDuration = uiStore.zoomEnd - uiStore.zoomStart

  const visibleFrames = useComputed((): LogFrame[] => {
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

  const chartData = useComputed((): ChartDataPoint[] => {
    return visibleFrames.map(frame => ({
      time: frame.time / 1000000,
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

  return { zoomDuration, visibleFrames, chartData, yDomain }
}
