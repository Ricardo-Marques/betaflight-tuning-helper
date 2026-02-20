import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { detectMidThrottleWobble, deriveSampleRate, extractAxisData } from '../utils/SignalAnalysis'
import { calculateStdDev, calculateRMS } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'

/**
 * Detects mid-throttle wobble without stick input
 */
export const WobbleRule: TuningRule = {
  id: 'wobble-detection',
  name: 'Mid-Throttle Wobble Detection',
  description: 'Detects oscillations during cruise/hover without pilot input',
  baseConfidence: 0.85,
  issueTypes: ['lowFrequencyOscillation', 'midThrottleWobble', 'highFrequencyNoise'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

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

    const metrics = detectMidThrottleWobble(windowFrames, window.axis, sampleRate)

    if (!metrics.detected) {
      return []
    }

    // Yaw has higher moment of inertia — raise thresholds to avoid false positives
    const yawMultiplier = window.axis === 'yaw' ? 1.5 : 1.0

    // Classify severity based on amplitude (scaled by profile and yaw multiplier)
    let severity: 'low' | 'medium' | 'high'
    if (metrics.amplitude > 35 * scale * yawMultiplier) {
      severity = 'high'
    } else if (metrics.amplitude > 25 * scale * yawMultiplier) {
      severity = 'medium'
    } else if (metrics.amplitude > 15 * scale * yawMultiplier) {
      severity = 'low'
    } else {
      return []
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

    // I-term windup detection: compare pidI RMS to pidP RMS for low-freq wobble
    // pidI is parsed in every frame but unused by other rules
    let itermWindup = false
    if (metrics.frequencyBand === 'low') {
      const pidI = extractAxisData(windowFrames, 'pidI', window.axis)
      const pidP = extractAxisData(windowFrames, 'pidP', window.axis)
      const pidIRms = calculateRMS(pidI)
      const pidPRms = calculateRMS(pidP)
      if (pidPRms > 0 && pidIRms / pidPRms > 0.5) {
        itermWindup = true
      }
    }

    // Adaptive confidence based on signal-to-noise ratio
    const gyro = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const gyroStdDev = calculateStdDev(gyro)
    const signalToNoise = gyroStdDev > 0 ? metrics.amplitude / gyroStdDev : 1
    const confidence = Math.min(0.95, 0.6 + signalToNoise * 0.1)

    issues.push({
      id: generateId(),
      type: issueType,
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `${metrics.frequencyBand[0].toUpperCase()}${metrics.frequencyBand.slice(1)}-frequency wobble: ${metrics.frequency.toFixed(1)} Hz, ${metrics.amplitude.toFixed(1)}° RMS`,
      metrics: {
        frequency: metrics.frequency,
        amplitude: metrics.amplitude,
        dominantBand: metrics.frequencyBand,
        itermWindup,
      },
      confidence: itermWindup ? Math.min(0.95, confidence + 0.05) : confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (
        issue.type !== 'lowFrequencyOscillation' &&
        issue.type !== 'midThrottleWobble' &&
        issue.type !== 'highFrequencyNoise'
      ) {
        continue
      }

      const amplitude = issue.metrics.amplitude || 0
      const band = issue.metrics.dominantBand

      if (band === 'low') {
        // Low-frequency wobble (< 30 Hz) - typically I-term hunting or structural
        const hasItermWindup = issue.metrics.itermWindup === true
        const iConfidence = hasItermWindup ? 0.90 : 0.80
        const pConfidence = hasItermWindup ? 0.65 : 0.75

        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: hasItermWindup ? 9 : 8,
          confidence: iConfidence,
          title: `Lower I-term relax cutoff on ${issue.axis}`,
          description: hasItermWindup
            ? 'I-term windup confirmed: pidI/pidP ratio is high — I-term is the primary driver'
            : 'Low-frequency oscillation during hover is typically caused by I-term windup',
          rationale:
            'Sub-30Hz oscillation without stick input usually indicates the I-term is slowly building, overshooting, and reversing. Lowering iterm_relax_cutoff prevents the I-term from winding up during small disturbances.',
          risks: [
            'May slightly reduce tracking precision on very slow stick inputs',
            'If the issue is structural (frame flex), this may not help',
          ],
          changes: [
            {
              parameter: 'itermRelaxCutoff',
              recommendedChange: '10',
              explanation: 'Lower iterm_relax_cutoff to reduce I-term hunting during hover',
            },
          ],
          expectedImprovement:
            'Reduced slow drift and correction cycles during hover/cruise',
        })

        // Also suggest reducing I gain directly if amplitude is high
        if (amplitude > 25) {
          recommendations.push({
            id: generateId(),
            issueId: issue.id,
            type: 'decreasePID',
            priority: hasItermWindup ? 8 : 7,
            confidence: hasItermWindup ? 0.85 : pConfidence,
            title: `Reduce I gain on ${issue.axis}`,
            description: hasItermWindup
              ? 'I-term windup confirmed — reducing I gain directly limits the oscillation'
              : 'Persistent low-frequency wobble may need lower I gain',
            rationale:
              'If I-term relax adjustment is not sufficient, reducing I gain directly limits the corrective force that causes the slow oscillation cycle.',
            risks: [
              'Reduced ability to hold attitude against wind',
              'May drift more during hands-off hover',
            ],
            changes: [
              {
                parameter: 'pidIGain',
                recommendedChange: '-0.3',
                axis: issue.axis,
                explanation: 'Reduce I gain to limit slow oscillation',
              },
            ],
            expectedImprovement: 'Less I-term overshoot, smoother hover',
          })
        }
      } else if (band === 'high') {
        // High-frequency noise (> 80 Hz) - filtering or D-term issue
        recommendations.push(
          {
            id: generateId(),
            issueId: issue.id,
            type: 'adjustFiltering',
            priority: 9,
            confidence: 0.90,
            title: 'Increase filtering',
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
                recommendedChange: '-10',
                explanation: 'Lower gyro filter multiplier to reduce high-frequency noise input',
              },
              {
                parameter: 'dtermFilterMultiplier',
                recommendedChange: '-10',
                explanation: 'Lower D-term filter multiplier to prevent noise amplification',
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
        // Mid-frequency wobble (20-80 Hz) - likely P oscillation
        // 20-50Hz oscillation without stick input is the classic P-too-high signature.
        // The correct response is to increase D to damp it, or reduce P.
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'increasePID',
          priority: 8,
          confidence: 0.85,
          title: `Increase D on ${issue.axis}`,
          description: 'Mid-frequency wobble (20-80Hz) indicates P oscillation - needs more damping',
          rationale:
            'Mid-frequency oscillation without stick input is typically P gain driving the quad past its target faster than D can damp it. Increasing D provides more damping to suppress the oscillation.',
          risks: [
            'High D amplifies gyro noise - monitor motor temperatures',
            'May need filter adjustment if D-term noise increases',
          ],
          changes: [
            {
              parameter: 'pidDGain',
              recommendedChange: '+0.15',
              axis: issue.axis,
              explanation: 'Increase D to damp mid-frequency P oscillation',
            },
          ],
          expectedImprovement: 'Stable cruise without visible oscillations',
        })

        // Also suggest reducing P if amplitude is high
        if (amplitude > 25) {
          recommendations.push({
            id: generateId(),
            issueId: issue.id,
            type: 'decreasePID',
            priority: 7,
            confidence: 0.80,
            title: `Reduce P on ${issue.axis}`,
            description: 'If increasing D is not enough, reducing P lowers oscillation tendency',
            rationale:
              'If D increase alone does not stop the oscillation, reducing P lowers the corrective force that drives the oscillation. This is especially useful when D is already causing motor heat.',
            risks: [
              'Reduced tracking responsiveness',
              'May feel less locked-in during fast maneuvers',
            ],
            changes: [
              {
                parameter: 'pidPGain',
                recommendedChange: '-0.2',
                axis: issue.axis,
                explanation: 'Reduce P to lower oscillation tendency',
              },
            ],
            expectedImprovement: 'Reduced oscillation amplitude at the source',
          })
        }
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

