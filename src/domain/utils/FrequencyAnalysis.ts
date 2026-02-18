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
  // Ensure signal length is power of 2 for FFT
  const fftSize = nextPowerOf2(Math.min(signal.length, 2048)) // Cap at 2048 for performance
  const paddedSignal = padSignal(signal, fftSize)

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

  // Hann window coherent gain is 0.5 — compensate by multiplying by 2
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
  if (n <= 1) {
    return [{ real: signal[0] || 0, imag: 0 }]
  }

  // Divide
  const even = signal.filter((_, i) => i % 2 === 0)
  const odd = signal.filter((_, i) => i % 2 === 1)

  // Conquer
  const evenFFT = fft(even)
  const oddFFT = fft(odd)

  // Combine
  const result: Complex[] = new Array(n)
  for (let k = 0; k < n / 2; k++) {
    const angle = (-2 * Math.PI * k) / n
    const twiddle: Complex = {
      real: Math.cos(angle),
      imag: Math.sin(angle),
    }

    const t: Complex = {
      real: twiddle.real * oddFFT[k].real - twiddle.imag * oddFFT[k].imag,
      imag: twiddle.real * oddFFT[k].imag + twiddle.imag * oddFFT[k].real,
    }

    result[k] = {
      real: evenFFT[k].real + t.real,
      imag: evenFFT[k].imag + t.imag,
    }

    result[k + n / 2] = {
      real: evenFFT[k].real - t.real,
      imag: evenFFT[k].imag - t.imag,
    }
  }

  return result
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
 * Calculates RMS (Root Mean Square) of a signal
 */
export function calculateRMS(signal: number[]): number {
  const sumSquares = signal.reduce((sum, val) => sum + val * val, 0)
  return Math.sqrt(sumSquares / signal.length)
}

/**
 * Calculates standard deviation
 */
export function calculateStdDev(signal: number[]): number {
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
 * Calculates error signal (setpoint - gyro)
 */
export function calculateError(setpoint: number[], gyro: number[]): number[] {
  return setpoint.map((sp, i) => sp - gyro[i])
}
