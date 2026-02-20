import { useLogStore, useUIStore } from '../../stores/RootStore'
import { useComputed } from '../../lib/mobx-reactivity'
import { extractAxisData, deriveSampleRate } from '../../domain/utils/SignalAnalysis'
import { computeAveragedSpectrum, MAX_SAMPLES } from '../../domain/utils/SpectrumAnalysis'
import type { SpectralPeak } from '../../domain/utils/FrequencyAnalysis'
import type { LogFrame } from '../../domain/types/LogFrame'

export interface SpectrumPoint {
  frequency: number
  magnitude: number
}

export interface SpectrumDataResult {
  spectrumData: SpectrumPoint[]
  peaks: SpectralPeak[]
  maxMagnitude: number
  displayMax: number
  nyquist: number
  frameCount: number
  sampleRate: number
}

const EMPTY: SpectrumDataResult = {
  spectrumData: [], peaks: [], maxMagnitude: 0, displayMax: 0,
  nyquist: 0, frameCount: 0, sampleRate: 0,
}

// Module-level cache: avoids recomputing FFT when toggling chart modes.
// Invalidates naturally when frames reference changes (new log) or axis changes.
let cachedFrames: LogFrame[] | null = null
let cachedAxis: string | null = null
let cachedResult: SpectrumDataResult = EMPTY

export function useSpectrumData(): SpectrumDataResult {
  const logStore = useLogStore()
  const uiStore = useUIStore()

  return useComputed((): SpectrumDataResult => {
    // Skip FFT when spectrum chart is not visible
    if (uiStore.chartMode !== 'spectrum') return EMPTY

    const frames = logStore.frames
    if (frames.length < 64) return EMPTY

    const axis = uiStore.selectedAxis

    // Cache hit — same frames array reference and same axis
    if (frames === cachedFrames && axis === cachedAxis) return cachedResult

    const sampleRate = deriveSampleRate(frames)

    // Cap to MAX_SAMPLES before extraction — computeAveragedSpectrum only
    // uses the first MAX_SAMPLES anyway, so avoid creating a huge intermediate array
    const cappedFrames = frames.length > MAX_SAMPLES ? frames.slice(0, MAX_SAMPLES) : frames
    const signal = extractAxisData(cappedFrames, 'gyroADC', axis)
    const { frequencies, magnitudes, peaks } = computeAveragedSpectrum(signal, sampleRate)

    if (frequencies.length === 0) return EMPTY

    const nyquist = sampleRate / 2

    // First pass: find max magnitude across all bins up to Nyquist
    let maxMag = 0
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] > nyquist) break
      if (magnitudes[i] > maxMag) maxMag = magnitudes[i]
    }

    // Find meaningful display range: last frequency with >2% of max magnitude
    const threshold = maxMag * 0.02
    let lastSignificantFreq = 0
    for (let i = frequencies.length - 1; i >= 0; i--) {
      if (frequencies[i] <= nyquist && magnitudes[i] > threshold) {
        lastSignificantFreq = frequencies[i]
        break
      }
    }

    // 30% margin beyond last significant content, floor at 300 Hz
    const displayMax = Math.max(300, Math.min(lastSignificantFreq * 1.3, nyquist))

    const spectrumData: SpectrumPoint[] = []
    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] > displayMax) break
      spectrumData.push({ frequency: frequencies[i], magnitude: magnitudes[i] })
    }

    const result: SpectrumDataResult = {
      spectrumData,
      peaks: peaks.filter(p => p.frequency <= displayMax),
      maxMagnitude: maxMag,
      displayMax,
      nyquist,
      frameCount: frames.length,
      sampleRate,
    }

    // Update cache
    cachedFrames = frames
    cachedAxis = axis
    cachedResult = result

    return result
  })
}
