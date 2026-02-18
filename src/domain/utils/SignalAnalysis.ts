import { LogFrame, AxisData } from '../types/LogFrame'
import { Axis } from '../types/Analysis'
import { calculateRMS, analyzeFrequency } from './FrequencyAnalysis'

/**
 * Detects bounceback after a rapid stick return
 * Returns overshoot ratio and settling time
 */
export interface BouncebackMetrics {
  detected: boolean
  overshoot: number // Ratio of overshoot to initial move
  settlingTime: number // Time to settle within 5% of setpoint (ms)
  peakTime: number // Time of maximum overshoot (ms)
  oscillationCount: number // Number of oscillations before settling
}

export function detectBounceback(
  frames: LogFrame[],
  axis: Axis,
  sampleRate: number
): BouncebackMetrics {
  const gyro = frames.map(f => getAxisValue(f.gyroADC, axis))
  const setpoint = frames.map(f => getAxisValue(f.setpoint, axis))

  // Find the stick release point (setpoint crosses zero with high derivative)
  let releaseIndex = -1
  const threshold = 50 // deg/s threshold for "significant move"

  for (let i = 10; i < frames.length - 10; i++) {
    const prevSetpoint = setpoint[i - 1]
    const currSetpoint = setpoint[i]

    // Detect zero crossing with significant prior setpoint
    if (
      Math.abs(prevSetpoint) > threshold &&
      Math.sign(prevSetpoint) !== Math.sign(currSetpoint) &&
      Math.abs(currSetpoint) < threshold
    ) {
      releaseIndex = i
      break
    }
  }

  if (releaseIndex === -1) {
    return {
      detected: false,
      overshoot: 0,
      settlingTime: 0,
      peakTime: 0,
      oscillationCount: 0,
    }
  }

  // Analyze the response after stick release
  const releaseTime = frames[releaseIndex].time
  // Scale window to 200ms based on actual sample rate (not hardcoded frame count)
  const windowFrameCount = Math.max(50, Math.floor(sampleRate * 0.2))
  const analysisWindow = frames.slice(releaseIndex, releaseIndex + windowFrameCount)

  const minFrames = Math.max(20, Math.floor(sampleRate * 0.015))
  if (analysisWindow.length < minFrames) {
    return {
      detected: false,
      overshoot: 0,
      settlingTime: 0,
      peakTime: 0,
      oscillationCount: 0,
    }
  }

  const windowGyro = analysisWindow.map(f => getAxisValue(f.gyroADC, axis))
  const windowSetpoint = analysisWindow.map(f => getAxisValue(f.setpoint, axis))

  // Find peak overshoot in opposite direction
  let peakOvershoot = 0
  let peakIndex = 0
  const initialDirection = Math.sign(gyro[releaseIndex - 5])

  for (let i = 5; i < windowGyro.length; i++) {
    const overshoot = Math.abs(windowGyro[i] - windowSetpoint[i])
    const direction = Math.sign(windowGyro[i] - windowSetpoint[i])

    // Look for overshoot in opposite direction
    if (direction === -initialDirection && overshoot > peakOvershoot) {
      peakOvershoot = overshoot
      peakIndex = i
    }
  }

  // Calculate settling time (time to stay within 5% band of peak setpoint)
  const peakSetpoint = Math.abs(gyro[releaseIndex - 5]) // approximate move magnitude
  const settlingBand = Math.max(5, peakSetpoint * 0.05) // 5% of move, minimum 5 deg/s
  let settlingIndex = -1

  for (let i = peakIndex; i < windowGyro.length - 10; i++) {
    let settled = true
    for (let j = i; j < Math.min(i + 10, windowGyro.length); j++) {
      if (Math.abs(windowGyro[j] - windowSetpoint[j]) > settlingBand) {
        settled = false
        break
      }
    }
    if (settled) {
      settlingIndex = i
      break
    }
  }

  const settlingTime =
    settlingIndex !== -1
      ? (analysisWindow[settlingIndex].time - releaseTime) / 1000
      : (analysisWindow[analysisWindow.length - 1].time - releaseTime) / 1000

  // Count oscillations (zero crossings of error signal)
  const error = windowGyro.map((g, i) => g - windowSetpoint[i])
  let oscillationCount = 0
  for (let i = 1; i < error.length; i++) {
    if (Math.sign(error[i - 1]) !== Math.sign(error[i])) {
      oscillationCount++
    }
  }
  oscillationCount = Math.floor(oscillationCount / 2) // Full cycles

  const peakTime = (analysisWindow[peakIndex].time - releaseTime) / 1000

  return {
    detected: peakOvershoot > 10, // Overshoot > 10 deg/s is significant (well-tuned < 10)
    overshoot: peakOvershoot,
    settlingTime,
    peakTime,
    oscillationCount,
  }
}

/**
 * Detects propwash oscillations during rapid throttle drops
 */
export interface PropwashMetrics {
  detected: boolean
  frequency: number // Hz
  amplitude: number // deg/s peak-to-peak
  duration: number // ms
  dtermActivity: number // RMS of D-term during event
}

export function detectPropwash(
  frames: LogFrame[],
  axis: Axis,
  sampleRate: number
): PropwashMetrics {
  const throttle = frames.map(f => f.throttle)

  // Detect rapid throttle drops - scale lookback window by sample rate
  let dropStartIndex = -1
  const dropThreshold = 100 // Throttle drop > 100 in lookback period (lowered from 200)
  const lookbackFrames = Math.max(10, Math.floor(sampleRate * 0.03)) // 30ms lookback (was hardcoded 10 frames)
  const trailingFrames = Math.max(50, Math.floor(sampleRate * 0.05))

  for (let i = lookbackFrames; i < frames.length - trailingFrames; i++) {
    const throttleDrop = throttle[i - lookbackFrames] - throttle[i]
    if (throttleDrop > dropThreshold) {
      dropStartIndex = i
      break
    }
  }

  if (dropStartIndex === -1) {
    return {
      detected: false,
      frequency: 0,
      amplitude: 0,
      duration: 0,
      dtermActivity: 0,
    }
  }

  // Analyze oscillations during and after drop - scale to 150ms
  const propwashWindowSize = Math.max(50, Math.floor(sampleRate * 0.15))
  const analysisWindow = frames.slice(dropStartIndex, dropStartIndex + propwashWindowSize)

  const minPropwashFrames = Math.max(20, Math.floor(sampleRate * 0.015))
  if (analysisWindow.length < minPropwashFrames) {
    return {
      detected: false,
      frequency: 0,
      amplitude: 0,
      duration: 0,
      dtermActivity: 0,
    }
  }

  const windowGyro = analysisWindow.map(f => getAxisValue(f.gyroADC, axis))
  const windowSetpoint = analysisWindow.map(f => getAxisValue(f.setpoint, axis))
  const windowDterm = analysisWindow.map(f => getAxisValue(f.pidD, axis))

  // Check for low setpoint (propwash occurs without stick input)
  const avgSetpoint = calculateRMS(windowSetpoint)
  if (avgSetpoint > 50) {
    // Significant stick input, not propwash
    return {
      detected: false,
      frequency: 0,
      amplitude: 0,
      duration: 0,
      dtermActivity: 0,
    }
  }

  // Calculate error oscillation
  const error = windowGyro.map((g, i) => g - windowSetpoint[i])
  const errorRMS = calculateRMS(error)

  // Use FFT for robust frequency estimation (immune to noise-induced zero crossings)
  const spectrum = analyzeFrequency(error, sampleRate)
  const frequency = spectrum.dominantFrequency
  const durationSec = (analysisWindow[analysisWindow.length - 1].time - analysisWindow[0].time) / 1000000 // µs → seconds
  const duration = durationSec * 1000 // Store as ms for metrics

  // Calculate true peak-to-peak amplitude (max - min, not 2 * max(abs))
  let errorMin = error[0]
  let errorMax = error[0]
  for (let i = 1; i < error.length; i++) {
    if (error[i] < errorMin) errorMin = error[i]
    if (error[i] > errorMax) errorMax = error[i]
  }
  const amplitude = errorMax - errorMin

  // D-term activity
  const dtermActivity = calculateRMS(windowDterm)

  return {
    detected: errorRMS > 5 && frequency > 3 && frequency < 80, // Sensitive detection for real flight data
    frequency,
    amplitude,
    duration,
    dtermActivity,
  }
}

/**
 * Detects mid-throttle wobble without stick input
 */
export interface WobbleMetrics {
  detected: boolean
  frequency: number // Hz
  amplitude: number // deg/s RMS
  frequencyBand: 'low' | 'mid' | 'high'
}

export function detectMidThrottleWobble(
  frames: LogFrame[],
  axis: Axis,
  sampleRate: number
): WobbleMetrics {
  const throttle = frames.map(f => f.throttle)
  const gyro = frames.map(f => getAxisValue(f.gyroADC, axis))
  const setpoint = frames.map(f => getAxisValue(f.setpoint, axis))

  // Check for mid-throttle condition
  const avgThrottle = throttle.reduce((sum, t) => sum + t, 0) / throttle.length
  if (avgThrottle < 1200 || avgThrottle > 1800) {
    return {
      detected: false,
      frequency: 0,
      amplitude: 0,
      frequencyBand: 'mid',
    }
  }

  // Check for low stick input
  const setpointRMS = calculateRMS(setpoint)
  if (setpointRMS > 30) {
    return {
      detected: false,
      frequency: 0,
      amplitude: 0,
      frequencyBand: 'mid',
    }
  }

  // Analyze gyro oscillation
  const gyroRMS = calculateRMS(gyro)

  // Use FFT for robust frequency estimation (immune to noise-induced zero crossings)
  const spectrum = analyzeFrequency(gyro, sampleRate)
  const frequency = spectrum.dominantFrequency

  // Classify frequency band
  let frequencyBand: 'low' | 'mid' | 'high'
  // Classify frequency band (aligned with FFT band boundaries)
  if (frequency < 30) {
    frequencyBand = 'low'
  } else if (frequency < 150) {
    frequencyBand = 'mid'
  } else {
    frequencyBand = 'high'
  }

  return {
    detected: gyroRMS > 8 && frequency > 5 && frequency < 100, // 8 deg/s RMS to avoid false positives on healthy quads
    frequency,
    amplitude: gyroRMS,
    frequencyBand,
  }
}

/**
 * Detects motor saturation
 */
export interface MotorSaturationMetrics {
  detected: boolean
  saturationPercentage: number // % of time any motor at 100%
  averageMotorOutput: number
  asymmetry: number // Coefficient of variation across motors
}

export function detectMotorSaturation(frames: LogFrame[]): MotorSaturationMetrics {
  const motorCount = frames[0]?.motor.length || 4
  let saturatedFrames = 0
  const motorSums = new Array(motorCount).fill(0)

  for (const frame of frames) {
    const motors = frame.motor
    let frameSaturated = false
    for (let i = 0; i < motorCount; i++) {
      motorSums[i] += motors[i]
      if (!frameSaturated && motors[i] >= 1990) {
        // Consider 1990+ as saturated (allows for small margin)
        saturatedFrames++
        frameSaturated = true // Count frame once but keep summing all motors
      }
    }
  }

  const saturationPercentage = (saturatedFrames / frames.length) * 100

  // Calculate average motor output
  const motorAverages = motorSums.map(sum => sum / frames.length)
  const averageMotorOutput =
    motorAverages.reduce((sum, avg) => sum + avg, 0) / motorCount

  // Calculate asymmetry (coefficient of variation)
  const mean = averageMotorOutput
  const variance =
    motorAverages.reduce((sum, avg) => sum + (avg - mean) ** 2, 0) / motorCount
  const stdDev = Math.sqrt(variance)
  const asymmetry = stdDev / mean

  return {
    detected: saturationPercentage > 5, // More than 5% saturation is concerning
    saturationPercentage,
    averageMotorOutput,
    asymmetry,
  }
}

/**
 * Calculates noise floor of a signal
 */
export function calculateNoiseFloor(signal: number[]): number {
  // Use RMS as noise floor estimate
  return calculateRMS(signal)
}

/**
 * Derive sample rate from frame timestamps (in microseconds)
 */
export function deriveSampleRate(frames: LogFrame[]): number {
  if (frames.length < 2) return 1000
  const totalTime = frames[frames.length - 1].time - frames[0].time
  if (totalTime <= 0) return 1000
  return ((frames.length - 1) / totalTime) * 1000000 // time is in µs
}

/**
 * Helper to extract axis value from AxisData
 */
export function getAxisValue(data: AxisData, axis: Axis): number {
  return data[axis]
}

/**
 * Extracts axis data from frames
 */
export function extractAxisData(
  frames: LogFrame[],
  field: 'gyroADC' | 'setpoint' | 'pidP' | 'pidI' | 'pidD' | 'pidSum',
  axis: Axis
): number[] {
  return frames.map(f => getAxisValue(f[field], axis))
}
