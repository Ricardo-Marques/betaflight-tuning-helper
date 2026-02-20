import { LogFrame } from '../types/LogFrame'

/**
 * Motor saturation detection metrics
 */
export interface MotorSaturationMetrics {
  detected: boolean
  saturationPercentage: number // % of time any motor at 100%
  averageMotorOutput: number
  asymmetry: number // Coefficient of variation across motors
}

/**
 * Detects motor saturation (motors hitting max output)
 */
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
        saturatedFrames++
        frameSaturated = true
      }
    }
  }

  const saturationPercentage = (saturatedFrames / frames.length) * 100

  const motorAverages = motorSums.map(sum => sum / frames.length)
  const averageMotorOutput =
    motorAverages.reduce((sum, avg) => sum + avg, 0) / motorCount

  const mean = averageMotorOutput
  const variance =
    motorAverages.reduce((sum, avg) => sum + (avg - mean) ** 2, 0) / motorCount
  const stdDev = Math.sqrt(variance)
  const asymmetry = mean > 0 ? stdDev / mean : 0

  return {
    detected: saturationPercentage > 5,
    saturationPercentage,
    averageMotorOutput,
    asymmetry,
  }
}
