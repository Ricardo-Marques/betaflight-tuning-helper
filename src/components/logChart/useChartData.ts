import { useLogStore, useUIStore } from '../../stores/RootStore'
import { useComputed } from '../../lib/mobx-reactivity'
import type { LogFrame } from '../../domain/types/LogFrame'

interface ChartDataResult {
  zoomDuration: number
  visibleFrames: LogFrame[]
  timeDomain: [number, number]
  yDomain: [number, number]
  motorDomain: [number, number]
  pidDomain: [number, number]
}

export function useChartData(): ChartDataResult {
  const logStore = useLogStore()
  const uiStore = useUIStore()

  const zoomDuration = uiStore.zoomEnd - uiStore.zoomStart

  // Stable time domain: derived from source boundary frames (before downsampling)
  // so the XAxis domain never wobbles due to min-max bucket selection.
  const timeDomain = useComputed((): [number, number] => {
    const source = logStore.frames
    if (source.length === 0) return [0, 1]
    const totalFrames = source.length
    const startIdx = Math.floor((uiStore.zoomStart / 100) * totalFrames)
    const endIdx = Math.min(Math.ceil((uiStore.zoomEnd / 100) * totalFrames), totalFrames) - 1
    return [source[startIdx].time / 1e6, source[Math.max(startIdx, endIdx)].time / 1e6]
  })

  const visibleFrames = useComputed((): LogFrame[] => {
    const source = logStore.frames
    if (source.length === 0) return []

    const totalFrames = source.length
    const startIdx = Math.floor((uiStore.zoomStart / 100) * totalFrames)
    const endIdx = Math.min(Math.ceil((uiStore.zoomEnd / 100) * totalFrames), totalFrames)
    const rangeLen = endIdx - startIdx

    // Progressive downsampling based on rangeLen (visible frame count).
    // rangeLen = visibleDuration x sampleRate, so higher sample rates naturally get
    // more aggressive downsampling. Baseline: ~800 pts for 20k frames (~10s @ 2kHz).
    // 2kHz 5s→1000, 10s→800, 1min→450, 5min→250 | 8kHz 5s→600, 1min→250
    const scaled = 800 / Math.pow(rangeLen / 20000, 0.35)
    const maxPoints = Math.max(200, Math.min(1500, Math.round(scaled)))

    // No downsampling needed
    if (rangeLen <= maxPoints) {
      return source.slice(startIdx, endIdx)
    }

    // Min-max bucket downsampling: preserve the gyro envelope
    const axis = uiStore.selectedAxis
    const bucketCount = maxPoints >> 1
    const bucketSize = rangeLen / bucketCount
    const result: LogFrame[] = []

    for (let b = 0; b < bucketCount; b++) {
      const bStart = startIdx + Math.floor(b * bucketSize)
      const bEnd = startIdx + Math.floor((b + 1) * bucketSize)

      let minVal = Infinity
      let maxVal = -Infinity
      let minIdx = bStart
      let maxIdx = bStart

      for (let i = bStart; i < bEnd; i++) {
        const v = source[i].gyroADC[axis]
        if (v < minVal) { minVal = v; minIdx = i }
        if (v > maxVal) { maxVal = v; maxIdx = i }
      }

      if (minIdx === maxIdx) {
        result.push(source[minIdx])
      } else if (minIdx < maxIdx) {
        result.push(source[minIdx], source[maxIdx])
      } else {
        result.push(source[maxIdx], source[minIdx])
      }
    }

    return result
  })

  // Global gyro/setpoint domain for the selected axis (cached in LogStore)
  const yDomain = logStore.signalDomains[uiStore.selectedAxis]

  // Stable motor/throttle domain computed from the entire log (never changes during pan)
  const motorDomain = useComputed((): [number, number] => {
    // Use precomputed domain from worker when available (avoids iterating all frames)
    const precomputed = logStore.motorDomain
    if (precomputed) return precomputed

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

  return { zoomDuration, visibleFrames, timeDomain, yDomain, motorDomain, pidDomain }
}
