import { FrequencySpectrum } from '../types/Analysis'

/**
 * Performs FFT analysis on a signal using a simplified algorithm
 * @param signal Time-domain signal
 * @param sampleRate Sample rate in Hz
 * @returns Frequency spectrum
 */
export function analyzeFrequency(
  signal: number[],
  sampleRate: number
): FrequencySpectrum {
  // Guard: empty or trivially small signals
  if (signal.length < 4 || sampleRate <= 0) {
    return { frequencies: [], magnitudes: [], dominantFrequency: 0, dominantMagnitude: 0, bandEnergy: { low: 0, mid: 0, high: 0 } }
  }

  // Filter out NaN values (corrupted frames) to prevent silent analysis failure
  const cleanSignal = signal.map(v => Number.isFinite(v) ? v : 0)

  // Ensure signal length is power of 2 for FFT
  const fftSize = nextPowerOf2(Math.min(cleanSignal.length, 2048)) // Cap at 2048 for performance
  const paddedSignal = padSignal(cleanSignal, fftSize)

  // Remove DC component
  const mean = paddedSignal.reduce((sum, val) => sum + val, 0) / paddedSignal.length
  const centeredSignal = paddedSignal.map(val => val - mean)

  // Apply Hanning window to reduce spectral leakage
  const windowedSignal = applyHanningWindow(centeredSignal)

  // Perform FFT using Cooley-Tukey algorithm
  const fftResult = fft(windowedSignal)

  // Calculate magnitudes (only first half due to symmetry)
  const halfSize = fftSize / 2
  const magnitudes: number[] = []
  const frequencies: number[] = []

  // Hann window coherent gain is 0.5 - compensate by multiplying by 2
  const hannCompensation = 2
  for (let i = 0; i < halfSize; i++) {
    const re = fftResult[i].real
    const im = fftResult[i].imag
    const magnitude = (Math.sqrt(re * re + im * im) / fftSize) * hannCompensation
    magnitudes.push(magnitude)
    frequencies.push((i * sampleRate) / fftSize)
  }

  // Find dominant frequency
  let maxMagnitude = 0
  let dominantIndex = 0
  for (let i = 1; i < magnitudes.length; i++) {
    // Skip DC (i=0)
    if (magnitudes[i] > maxMagnitude) {
      maxMagnitude = magnitudes[i]
      dominantIndex = i
    }
  }

  // Calculate band energy
  const bandEnergy = calculateBandEnergy(frequencies, magnitudes)

  return {
    frequencies,
    magnitudes,
    dominantFrequency: frequencies[dominantIndex],
    dominantMagnitude: maxMagnitude,
    bandEnergy,
  }
}

/**
 * Simple FFT implementation using Cooley-Tukey algorithm
 */
interface Complex {
  real: number
  imag: number
}

function fft(signal: number[]): Complex[] {
  const n = signal.length

  // Single pre-allocated output array — no intermediate arrays, no recursion
  const out: Complex[] = new Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = { real: signal[i] || 0, imag: 0 }
  }

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      const tmp = out[i]
      out[i] = out[j]
      out[j] = tmp
    }
  }

  // Butterfly stages
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const angleStep = (-2 * Math.PI) / size
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const angle = angleStep * k
        const twRe = Math.cos(angle)
        const twIm = Math.sin(angle)
        const evenIdx = i + k
        const oddIdx = i + k + half
        const tRe = twRe * out[oddIdx].real - twIm * out[oddIdx].imag
        const tIm = twRe * out[oddIdx].imag + twIm * out[oddIdx].real
        out[oddIdx] = {
          real: out[evenIdx].real - tRe,
          imag: out[evenIdx].imag - tIm,
        }
        out[evenIdx] = {
          real: out[evenIdx].real + tRe,
          imag: out[evenIdx].imag + tIm,
        }
      }
    }
  }

  return out
}

/**
 * Calculates energy in different frequency bands
 * Bands aligned with Betaflight noise domains:
 *   low:  0-30 Hz  (aerodynamic, I-term hunting, frame sway)
 *   mid:  30-150 Hz (PID oscillation, propwash, structural resonance)
 *   high: 150+ Hz  (motor noise, electrical noise, prop harmonics)
 */
function calculateBandEnergy(
  frequencies: number[],
  magnitudes: number[]
): { low: number; mid: number; high: number } {
  let low = 0
  let mid = 0
  let high = 0

  for (let i = 0; i < frequencies.length; i++) {
    const freq = frequencies[i]
    const energy = magnitudes[i] * magnitudes[i]

    if (freq < 30) {
      low += energy
    } else if (freq < 150) {
      mid += energy
    } else {
      high += energy
    }
  }

  return { low, mid, high }
}

/**
 * Applies Hanning window to reduce spectral leakage
 */
function applyHanningWindow(signal: number[]): number[] {
  const n = signal.length
  return signal.map((val, i) => {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
    return val * window
  })
}

/**
 * Pads signal with zeros to reach target length
 */
function padSignal(signal: number[], targetLength: number): number[] {
  if (signal.length >= targetLength) {
    return signal.slice(0, targetLength)
  }
  return [...signal, ...new Array(targetLength - signal.length).fill(0)]
}

/**
 * Finds next power of 2 greater than or equal to n
 */
function nextPowerOf2(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)))
}

/**
 * Spectral peak found by findSpectralPeaks
 */
export interface SpectralPeak {
  frequency: number
  magnitude: number
  /** Index in the FFT result arrays */
  binIndex: number
}

/**
 * Returns top N peaks from an FFT result (local maxima sorted by magnitude).
 * A local maximum is a bin whose magnitude exceeds both neighbors.
 * @param frequencies FFT frequency array
 * @param magnitudes FFT magnitude array
 * @param topN Number of peaks to return (default 5)
 * @param minFrequency Minimum frequency to consider (default 5 Hz, skip DC)
 * @param maxFrequency Maximum frequency to consider (default Infinity)
 */
export function findSpectralPeaks(
  frequencies: number[],
  magnitudes: number[],
  topN: number = 5,
  minFrequency: number = 5,
  maxFrequency: number = Infinity
): SpectralPeak[] {
  const peaks: SpectralPeak[] = []

  for (let i = 1; i < magnitudes.length - 1; i++) {
    const freq = frequencies[i]
    if (freq < minFrequency || freq > maxFrequency) continue

    if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1]) {
      peaks.push({ frequency: freq, magnitude: magnitudes[i], binIndex: i })
    }
  }

  peaks.sort((a, b) => b.magnitude - a.magnitude)
  return peaks.slice(0, topN)
}

/**
 * Calculates RMS (Root Mean Square) of a signal
 */
export function calculateRMS(signal: number[]): number {
  if (signal.length === 0) return 0
  const sumSquares = signal.reduce((sum, val) => sum + val * val, 0)
  return Math.sqrt(sumSquares / signal.length)
}

/**
 * Calculates standard deviation
 */
export function calculateStdDev(signal: number[]): number {
  if (signal.length === 0) return 0
  const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length
  const variance =
    signal.reduce((sum, val) => sum + (val - mean) ** 2, 0) / signal.length
  return Math.sqrt(variance)
}

/**
 * Detects zero crossings in a signal (for frequency estimation)
 */
export function countZeroCrossings(signal: number[]): number {
  let crossings = 0
  for (let i = 1; i < signal.length; i++) {
    if ((signal[i - 1] >= 0 && signal[i] < 0) || (signal[i - 1] < 0 && signal[i] >= 0)) {
      crossings++
    }
  }
  return crossings
}

/**
 * Estimates frequency from zero crossings
 * @param signal Time-domain signal
 * @param sampleRate Sample rate in Hz
 * @returns Estimated frequency in Hz
 */
export function estimateFrequencyFromZeroCrossings(
  signal: number[],
  sampleRate: number
): number {
  const crossings = countZeroCrossings(signal)
  const duration = signal.length / sampleRate
  return crossings / (2 * duration) // Each cycle has 2 zero crossings
}

/**
 * Applies a low-pass filter to smooth a signal
 */
export function lowPassFilter(signal: number[], alpha: number): number[] {
  const filtered: number[] = [signal[0]]
  for (let i = 1; i < signal.length; i++) {
    filtered[i] = alpha * signal[i] + (1 - alpha) * filtered[i - 1]
  }
  return filtered
}

/**
 * Estimates phase lag between setpoint and gyro using time-domain cross-correlation.
 * Searches positive lags only (gyro physically cannot lead setpoint in a PID system).
 * @param setpoint Setpoint signal
 * @param gyro Gyro signal
 * @param sampleRate Sample rate in Hz
 * @returns lagMs (delay in milliseconds) and correlation (normalized, 0-1)
 */
export function estimatePhaseLag(
  setpoint: number[],
  gyro: number[],
  sampleRate: number
): { lagMs: number; correlation: number } {
  const n = Math.min(setpoint.length, gyro.length)
  const maxLagSamples = Math.min(Math.ceil(sampleRate * 0.02), n - 1) // up to 20ms

  let bestLag = 0
  let bestMeanCorr = -Infinity

  // Normalize each lag by overlap length to remove bias toward lag=0.
  // Without this, shorter overlaps (larger d) produce smaller sums purely
  // from having fewer terms, masking the true peak.
  for (let d = 0; d <= maxLagSamples; d++) {
    let sum = 0
    const overlapLength = n - d
    for (let i = 0; i < overlapLength; i++) {
      sum += setpoint[i] * gyro[i + d]
    }
    const meanCorr = sum / overlapLength
    if (meanCorr > bestMeanCorr) {
      bestMeanCorr = meanCorr
      bestLag = d
    }
  }

  // Compute Pearson correlation coefficient for the best lag
  let sumXY = 0
  let sumX2 = 0
  let sumY2 = 0
  for (let i = 0; i < n - bestLag; i++) {
    sumXY += setpoint[i] * gyro[i + bestLag]
    sumX2 += setpoint[i] * setpoint[i]
    sumY2 += gyro[i + bestLag] * gyro[i + bestLag]
  }
  const denom = Math.sqrt(sumX2 * sumY2)
  const correlation = denom > 0 ? sumXY / denom : 0

  return {
    lagMs: (bestLag / sampleRate) * 1000,
    correlation,
  }
}

/**
 * Calculates error signal (setpoint - gyro)
 */
export function calculateError(setpoint: number[], gyro: number[]): number[] {
  return setpoint.map((sp, i) => sp - gyro[i])
}
