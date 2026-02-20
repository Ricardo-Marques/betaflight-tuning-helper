import { analyzeFrequency, findSpectralPeaks, type SpectralPeak } from './FrequencyAnalysis'

export interface AveragedSpectrum {
  frequencies: number[]
  magnitudes: number[]
  peaks: SpectralPeak[]
}

const SEGMENT_SIZE = 2048
export const MAX_SAMPLES = 32768
const MIN_SAMPLES = 64

/**
 * Computes an averaged spectrum using Welch's method.
 * Splits the signal into overlapping segments, runs FFT on each,
 * and averages the magnitude arrays for a smoother result.
 */
export function computeAveragedSpectrum(
  signal: number[],
  sampleRate: number
): AveragedSpectrum {
  const empty: AveragedSpectrum = { frequencies: [], magnitudes: [], peaks: [] }

  if (signal.length < MIN_SAMPLES || sampleRate <= 0) return empty

  // Cap signal length for performance
  const trimmed = signal.length > MAX_SAMPLES
    ? signal.slice(0, MAX_SAMPLES)
    : signal

  // Build overlapping segments (50% overlap)
  const hop = SEGMENT_SIZE >> 1
  const segments: number[][] = []

  for (let offset = 0; offset + SEGMENT_SIZE <= trimmed.length; offset += hop) {
    segments.push(trimmed.slice(offset, offset + SEGMENT_SIZE))
  }

  // Fall back to single FFT if signal is shorter than one full segment
  if (segments.length === 0) {
    const result = analyzeFrequency(trimmed, sampleRate)
    if (result.frequencies.length === 0) return empty
    const peaks = findSpectralPeaks(result.frequencies, result.magnitudes, 5)
    return { frequencies: result.frequencies, magnitudes: result.magnitudes, peaks }
  }

  // Run FFT on each segment and accumulate magnitudes
  let avgMagnitudes: number[] | null = null
  let frequencies: number[] = []

  for (const seg of segments) {
    const result = analyzeFrequency(seg, sampleRate)
    if (avgMagnitudes === null) {
      avgMagnitudes = result.magnitudes.slice()
      frequencies = result.frequencies
    } else {
      for (let i = 0; i < result.magnitudes.length; i++) {
        avgMagnitudes[i] += result.magnitudes[i]
      }
    }
  }

  if (!avgMagnitudes || avgMagnitudes.length === 0) return empty

  // Average
  for (let i = 0; i < avgMagnitudes.length; i++) {
    avgMagnitudes[i] /= segments.length
  }

  const peaks = findSpectralPeaks(frequencies, avgMagnitudes, 5)

  return { frequencies, magnitudes: avgMagnitudes, peaks }
}
