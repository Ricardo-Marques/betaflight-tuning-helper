import { AnalysisWindow, FlightPhase } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'

/**
 * Segment log into analysis windows with flight phase classification
 */
export function segmentLog(frames: LogFrame[], metadata: LogMetadata): AnalysisWindow[] {
  const windows: AnalysisWindow[] = []

  // Calculate frames per 100ms based on actual sample rate
  const sampleRate = metadata.looptime // Already in Hz
  const windowDurationMs = 100 // 100ms windows (more reasonable)
  const windowSize = Math.max(50, Math.floor((sampleRate * windowDurationMs) / 1000))
  const windowStep = Math.floor(windowSize / 2) // 50% overlap

  const axes: ('roll' | 'pitch' | 'yaw')[] = ['roll', 'pitch', 'yaw']

  for (const axis of axes) {
    for (let i = 0; i < frames.length - windowSize; i += windowStep) {
      const windowFrames = frames.slice(i, i + windowSize)
      const frameIndices = Array.from({ length: windowSize }, (_, idx) => i + idx)

      // Calculate window metadata
      const avgThrottle =
        windowFrames.reduce((sum, f) => sum + f.throttle, 0) / windowFrames.length

      // Use setpoint if available, fallback to rcCommand if setpoint is 0
      const rawSetpointValues = windowFrames.map(f => Math.abs(f.setpoint[axis]))
      const rawRcCommandValues = windowFrames.map(f => Math.abs(f.rcCommand[axis]))
      const usingSetpoint = Math.max(...rawSetpointValues) > 5 // Use setpoint if it has real values

      const setpoints = usingSetpoint ? rawSetpointValues : rawRcCommandValues
      const maxSetpoint = Math.max(...setpoints)
      const rmsSetpoint = Math.sqrt(
        setpoints.reduce((sum, s) => sum + s * s, 0) / setpoints.length
      )

      // Adjust threshold based on what we're using (setpoint in deg/s vs rcCommand in stick units)
      const hasStickInputThreshold = usingSetpoint ? 30 : 10 // Lower threshold for rcCommand
      const hasStickInput = rmsSetpoint > hasStickInputThreshold

      // Flight phase detection
      // Check for throttle drop within this window (propwash requires a transition)
      const throttleValues = windowFrames.map(f => f.throttle)
      let maxThrottleDrop = 0
      const dropCheckStep = Math.max(1, Math.floor(windowFrames.length / 10))
      for (let j = dropCheckStep; j < throttleValues.length; j += dropCheckStep) {
        const drop = throttleValues[j - dropCheckStep] - throttleValues[j]
        if (drop > maxThrottleDrop) maxThrottleDrop = drop
      }

      const flightPhase = classifyFlightPhase(avgThrottle, maxSetpoint, hasStickInput, maxThrottleDrop, axis)

      windows.push({
        startTime: windowFrames[0].time,
        endTime: windowFrames[windowFrames.length - 1].time,
        frameIndices,
        axis,
        metadata: {
          avgThrottle,
          maxSetpoint,
          rmsSetpoint,
          hasStickInput,
          flightPhase,
        },
      })
    }
  }

  return windows
}

function classifyFlightPhase(
  avgThrottle: number,
  maxSetpoint: number,
  hasStickInput: boolean,
  maxThrottleDrop: number,
  axis: string
): FlightPhase {
  if (avgThrottle < 1050) {
    return 'idle'
  } else if (maxSetpoint > 400) {
    return axis === 'roll' ? 'roll' : 'flip'
  } else if (avgThrottle > 1700 && hasStickInput) {
    return 'punch'
  } else if (maxThrottleDrop > 80 && !hasStickInput) {
    // Propwash requires an actual throttle drop, not just low throttle
    return 'propwash'
  } else if (avgThrottle < 1300) {
    return 'hover'
  } else {
    return 'cruise'
  }
}
