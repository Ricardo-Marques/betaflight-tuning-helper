import { useRef } from 'react'
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

  // Tight domain computed from visible frames
  const tightDomain = useComputed((): [number, number] => {
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

  // Smoothed Y domain: lerp toward tight domain each pan frame (no RAF needed).
  // MobX already re-evaluates this computed on every pan frame because tightDomain
  // changes, so we piggyback on that reactivity for free synchronous easing.
  const displayedRef = useRef<[number, number]>([0, 1])
  const seededRef = useRef(false)

  const yDomain = useComputed((): [number, number] => {
    const tight = tightDomain

    // Not dragging - snap to tight domain immediately
    if (!isDraggingObs) {
      displayedRef.current = tight
      seededRef.current = false
      return tight
    }

    // First frame of a drag - seed so we don't lerp from stale values
    if (!seededRef.current) {
      seededRef.current = true
      displayedRef.current = tight
      return tight
    }

    const prev = displayedRef.current
    // Asymmetric lerp: expand fast (keep up with new peaks), shrink slow (avoid jitter)
    const EXPAND = 0.6
    const SHRINK = 0.08
    const alphaMin = tight[0] < prev[0] ? EXPAND : SHRINK
    const alphaMax = tight[1] > prev[1] ? EXPAND : SHRINK
    const smoothed: [number, number] = [
      prev[0] + (tight[0] - prev[0]) * alphaMin,
      prev[1] + (tight[1] - prev[1]) * alphaMax,
    ]
    displayedRef.current = smoothed
    return smoothed
  })

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

  return { zoomDuration, visibleFrames, chartData, yDomain, motorDomain }
}
