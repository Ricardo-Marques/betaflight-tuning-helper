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
  motorDomain: [number, number]
  pidDomain: [number, number]
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

    const maxPoints = isDraggingObs ? 500 : 2000
    const rangeLen = endIdx - startIdx

    // No downsampling needed
    if (rangeLen <= maxPoints) {
      return logStore.frames.slice(startIdx, endIdx)
    }

    // Min-max bucket downsampling: preserve the gyro envelope
    const axis = uiStore.selectedAxis
    const bucketCount = maxPoints >> 1
    const bucketSize = rangeLen / bucketCount
    const result: LogFrame[] = []
    const frames = logStore.frames

    for (let b = 0; b < bucketCount; b++) {
      const bStart = startIdx + Math.floor(b * bucketSize)
      const bEnd = startIdx + Math.floor((b + 1) * bucketSize)

      let minVal = Infinity
      let maxVal = -Infinity
      let minIdx = bStart
      let maxIdx = bStart

      for (let i = bStart; i < bEnd; i++) {
        const v = frames[i].gyroADC[axis]
        if (v < minVal) { minVal = v; minIdx = i }
        if (v > maxVal) { maxVal = v; maxIdx = i }
      }

      if (minIdx === maxIdx) {
        result.push(frames[minIdx])
      } else if (minIdx < maxIdx) {
        result.push(frames[minIdx], frames[maxIdx])
      } else {
        result.push(frames[maxIdx], frames[minIdx])
      }
    }

    return result
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

  // Global gyro/setpoint domain for the selected axis (cached in LogStore)
  const yDomain = logStore.signalDomains[uiStore.selectedAxis]

  // Stable motor/throttle domain computed from the entire log (never changes during pan)
  const motorDomain = useComputed((): [number, number] => {
    const frames = logStore.frames
    if (frames.length === 0) return [0, 2000]

    let min = Infinity
    let max = -Infinity
    const step = Math.max(1, Math.floor(frames.length / 5000))

    for (let i = 0; i < frames.length; i += step) {
      const frame = frames[i]
      for (const m of frame.motor) {
        if (m < min) min = m
        if (m > max) max = m
      }
      const t = frame.throttle
      if (t < min) min = t
      if (t > max) max = t
    }

    const range = max - min
    const margin = range * 0.05
    return [min - margin, max + margin]
  })

  // Global PID domain for the selected axis (cached in LogStore)
  const pidDomain = logStore.pidDomains[uiStore.selectedAxis]

  return { zoomDuration, visibleFrames, chartData, yDomain, motorDomain, pidDomain }
}
