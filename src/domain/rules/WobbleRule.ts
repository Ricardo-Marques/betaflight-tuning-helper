import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { detectMidThrottleWobble, deriveSampleRate } from '../utils/SignalAnalysis'

/**
 * Detects mid-throttle wobble without stick input
 */
export const WobbleRule: TuningRule = {
  id: 'wobble-detection',
  name: 'Mid-Throttle Wobble Detection',
  description: 'Detects oscillations during cruise/hover without pilot input',
  baseConfidence: 0.85,
  issueTypes: ['lowFrequencyOscillation', 'midThrottleWobble', 'highFrequencyNoise'],
  applicableAxes: ['roll', 'pitch'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Only analyze mid-throttle cruise without stick input
    return (
      window.metadata.avgThrottle >= 1200 &&
      window.metadata.avgThrottle <= 1800 &&
      !window.metadata.hasStickInput
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.wobbleAmplitude ?? 1.0

    // Log why detection might not run
    console.debug(`${WobbleRule.id} analyzing window:`, {
      axis: window.axis,
      maxSetpoint: window.metadata.maxSetpoint,
      hasStickInput: window.metadata.hasStickInput,
      avgThrottle: window.metadata.avgThrottle,
      frameCount: windowFrames.length,
    })

    const metrics = detectMidThrottleWobble(windowFrames, window.axis, sampleRate)

    if (!metrics.detected) {
      console.debug(`${WobbleRule.id}: No issue detected`, metrics)
      return []
    }

    // Classify severity based on amplitude (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (metrics.amplitude > 35 * scale) {
      severity = 'high'
    } else if (metrics.amplitude > 25 * scale) {
      severity = 'high'
    } else if (metrics.amplitude > 15 * scale) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    // Determine issue type based on frequency band
    let issueType: 'lowFrequencyOscillation' | 'midThrottleWobble' | 'highFrequencyNoise'
    if (metrics.frequencyBand === 'low') {
      issueType = 'lowFrequencyOscillation'
    } else if (metrics.frequencyBand === 'high') {
      issueType = 'highFrequencyNoise'
    } else {
      issueType = 'midThrottleWobble'
    }

    issues.push({
      id: generateId(),
      type: issueType,
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `${metrics.frequencyBand.toUpperCase()}-frequency wobble: ${metrics.frequency.toFixed(1)} Hz, ${metrics.amplitude.toFixed(1)}° RMS`,
      metrics: {
        frequency: metrics.frequency,
        amplitude: metrics.amplitude,
        dominantBand: metrics.frequencyBand,
      },
      confidence: 0.85,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      const amplitude = issue.metrics.amplitude || 0
      const band = issue.metrics.dominantBand

      if (band === 'low') {
        // Low-frequency wobble (< 20 Hz) - insufficient P or FF
        recommendations.push(
          {
            id: generateId(),
            issueId: issue.id,
            type: 'increasePID',
            priority: 8,
            confidence: 0.85,
            title: `Increase P on ${issue.axis}`,
            description: 'Low-frequency oscillation indicates insufficient P gain',
            rationale:
              'P gain provides the main restoring force. Low-frequency wobble means the quad is not holding position firmly enough.',
            risks: [
              'Too much P can cause rapid oscillations',
              'May need D adjustment to compensate',
            ],
            changes: [
              {
                parameter: 'pidPGain',
                recommendedChange: '+0.3',
                axis: issue.axis,
                explanation: 'Increase P to improve positional authority',
              },
            ],
            expectedImprovement:
              'Firmer hold during cruise, reduced slow oscillations',
          },
          {
            id: generateId(),
            issueId: issue.id,
            type: 'adjustFeedforward',
            priority: 7,
            confidence: 0.75,
            title: `Increase Feedforward on ${issue.axis}`,
            description: 'Feedforward can help reduce low-frequency drift',
            rationale:
              'Feedforward anticipates needed corrections, reducing lag that can cause slow oscillations.',
            risks: [
              'Too much FF can cause overshoot on stick inputs',
              'Less effective if stick feels are already good',
            ],
            changes: [
              {
                parameter: 'pidFeedforward',
                recommendedChange: '+5',
                axis: issue.axis,
                explanation: 'Increase FF for more proactive corrections',
              },
            ],
            expectedImprovement: 'More locked-in feel during cruise',
          }
        )
      } else if (band === 'high') {
        // High-frequency noise (> 80 Hz) - filtering or D-term issue
        recommendations.push(
          {
            id: generateId(),
            issueId: issue.id,
            type: 'adjustFiltering',
            priority: 9,
            confidence: 0.90,
            title: `Increase filtering on ${issue.axis}`,
            description: 'High-frequency noise indicates insufficient filtering',
            rationale:
              'Gyro or D-term noise above 80 Hz serves no control purpose and wastes motor/battery. More filtering removes it.',
            risks: [
              'Excessive filtering adds delay, reducing responsiveness',
              'May cause "mushy" stick feel if overdone',
            ],
            changes: [
              {
                parameter: 'gyroFilterMultiplier',
                recommendedChange: '+10',
                explanation: 'Increase gyro filtering to reduce high-frequency noise input',
              },
              {
                parameter: 'dtermFilterMultiplier',
                recommendedChange: '+10',
                explanation: 'Increase D-term filtering to prevent noise amplification',
              },
            ],
            expectedImprovement: 'Smoother motors, reduced electrical noise, cooler ESCs',
          },
          {
            id: generateId(),
            issueId: issue.id,
            type: 'decreasePID',
            priority: 7,
            confidence: 0.75,
            title: `Consider reducing D on ${issue.axis}`,
            description: 'D-term amplifies high-frequency noise',
            rationale:
              'If filtering is already high, D-term may be amplifying remaining noise. Slight reduction can help.',
            risks: [
              'May reduce damping effectiveness',
              'Could worsen propwash or bounceback',
            ],
            changes: [
              {
                parameter: 'pidDGain',
                recommendedChange: '-0.1',
                axis: issue.axis,
                explanation: 'Small D reduction to limit noise amplification',
              },
            ],
            expectedImprovement: 'Quieter motors without sacrificing much damping',
          }
        )
      } else {
        // Mid-frequency wobble (20-80 Hz) - P/D balance issue
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'increasePID',
          priority: 7,
          confidence: 0.80,
          title: `Adjust P/D balance on ${issue.axis}`,
          description: 'Mid-frequency wobble suggests P/D tuning needed',
          rationale:
            'Mid-frequency oscillations (20-80 Hz) typically indicate P and D are not in optimal balance.',
          risks: ['May require iterative tuning', 'Could affect other flight characteristics'],
          changes: [
            {
              parameter: 'pidPGain',
              recommendedChange: '+0.2',
              axis: issue.axis,
              explanation: 'Increase P for better authority',
            },
            {
              parameter: 'pidDGain',
              recommendedChange: '+0.1',
              axis: issue.axis,
              explanation: 'Slight D increase to maintain damping ratio',
            },
          ],
          expectedImprovement: 'Stable cruise without oscillations',
        })
      }

      // Additional filtering recommendation for persistent wobble
      if (amplitude > 20) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 6,
          confidence: 0.70,
          title: 'Verify dynamic notch filter',
          description: 'Persistent wobble may indicate motor resonance',
          rationale:
            'Dynamic notch filter tracks and removes motor-related frequencies. Ensuring it is working optimally helps with persistent wobbles.',
          risks: ['Requires ESC telemetry', 'May need Q-factor adjustment'],
          changes: [
            {
              parameter: 'dynamicNotchCount',
              recommendedChange: '2',
              explanation: 'Use 2 notches for better resonance tracking',
            },
          ],
          expectedImprovement: 'Elimination of resonant frequencies causing wobble',
        })
      }
    }

    return recommendations
  },
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
