import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { calculateRMS, analyzeFrequency, calculateError } from '../utils/FrequencyAnalysis'

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Detects oscillations at high throttle indicating insufficient TPA
 */
export const HighThrottleOscillationRule: TuningRule = {
  id: 'high-throttle-oscillation-detection',
  name: 'High Throttle Oscillation Detection',
  description: 'Detects oscillations only at high throttle - TPA insufficient',
  baseConfidence: 0.85,
  issueTypes: ['highThrottleOscillation'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Only analyze high-throttle windows
    return window.metadata.avgThrottle > 1600
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.highThrottleOscillation ?? 1.0

    // Extract gyro and setpoint signals
    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const setpointSignal = extractAxisData(windowFrames, 'setpoint', window.axis)

    // Compute error and error RMS
    const error = calculateError(setpointSignal, gyroSignal)
    const errorRMS = calculateRMS(error)

    // Use FFT for robust frequency estimation (immune to noise-induced zero crossings)
    const spectrum = analyzeFrequency(error, sampleRate)
    const frequency = spectrum.dominantFrequency

    // Detected if significant error oscillation in the 5-100 Hz range (scaled by profile)
    if (errorRMS <= 8 * scale || frequency < 5 || frequency > 100) {
      return []
    }

    // Calculate true peak-to-peak amplitude (max - min)
    let errorMin = error[0]
    let errorMax = error[0]
    for (let i = 1; i < error.length; i++) {
      if (error[i] < errorMin) errorMin = error[i]
      if (error[i] > errorMax) errorMax = error[i]
    }
    const amplitude = errorMax - errorMin

    // Classify severity based on amplitude (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (amplitude > 50 * scale) {
      severity = 'high'
    } else if (amplitude > 30 * scale) {
      severity = 'medium'
    } else if (amplitude > 18 * scale) {
      severity = 'low'
    } else {
      severity = 'low'
    }

    const confidence = Math.min(0.95, 0.6 + errorRMS * 0.01 + (frequency > 10 ? 0.1 : 0))

    issues.push({
      id: uuidv4(),
      type: 'highThrottleOscillation',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `High-throttle oscillation: ${frequency.toFixed(1)} Hz, amplitude ${amplitude.toFixed(1)}°/s`,
      metrics: {
        frequency,
        amplitude,
        rmsError: errorRMS,
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'highThrottleOscillation') continue

      // Increase TPA rate
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'adjustTPA',
        priority: 8,
        confidence: issue.confidence,
        title: 'Increase TPA rate',
        description: 'Oscillations at high throttle indicate TPA is not attenuating PIDs enough',
        rationale:
          'TPA (Throttle PID Attenuation) reduces PID gains at high throttle. Oscillations appearing only at high throttle means the gains are too high at that throttle level.',
        risks: [
          'Reduced tracking precision at high throttle',
          'May feel less responsive during power maneuvers',
        ],
        changes: [
          {
            parameter: 'tpaRate',
            recommendedChange: '+10',
            explanation: 'Increase TPA rate to attenuate PIDs more at high throttle',
          },
        ],
        expectedImprovement: 'Eliminated oscillations during punches and high-throttle flight',
      })

      // Lower TPA breakpoint
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'adjustTPA',
        priority: 7,
        confidence: issue.confidence * 0.9,
        title: 'Lower TPA breakpoint',
        description: 'Start TPA attenuation earlier to catch oscillations at moderate-high throttle',
        rationale:
          'The TPA breakpoint is the throttle value where attenuation begins. Lowering it means PID reduction starts earlier, catching oscillations at lower throttle.',
        risks: [
          'PIDs will be attenuated over a wider throttle range',
          'May reduce mid-throttle tracking if set too low',
        ],
        changes: [
          {
            parameter: 'tpaBreakpoint',
            recommendedChange: '-50',
            explanation: 'Lower TPA breakpoint to start attenuation earlier',
          },
        ],
        expectedImprovement: 'Smoother transition from mid to high throttle',
      })

      // Reduce P gain
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'decreasePID',
        priority: 6,
        confidence: issue.confidence * 0.8,
        title: `Reduce P gain on ${issue.axis}`,
        description: 'If TPA adjustment is insufficient, reduce P gain directly',
        rationale:
          'P gain is the primary driver of oscillations. If TPA cannot sufficiently attenuate, a direct P reduction helps.',
        risks: [
          'Reduced tracking at all throttle levels',
          'May feel less locked-in overall',
        ],
        changes: [
          {
            parameter: 'pidPGain',
            recommendedChange: '-0.2',
            axis: issue.axis,
            explanation: 'Reduce P gain to lower oscillation tendency',
          },
        ],
        expectedImprovement: 'Reduced oscillations across throttle range',
      })
    }

    return recommendations
  },
}
