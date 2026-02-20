import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { detectPropwash, deriveSampleRate } from '../utils/SignalAnalysis'
import { generateId } from '../utils/generateId'

/**
 * Detects propwash oscillations during throttle drops
 */
export const PropwashRule: TuningRule = {
  id: 'propwash-detection',
  name: 'Propwash Detection',
  description: 'Detects oscillations caused by disturbed air during throttle drops',
  baseConfidence: 0.80,
  issueTypes: ['propwash'],
  applicableAxes: ['roll', 'pitch'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Propwash commonly occurs during turns/dives with stick input — don't exclude those
    return (
      window.metadata.avgThrottle < 1500 &&
      window.frameIndices.length > 50
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const scale = profile?.thresholds.propwashAmplitude ?? 1.0
    // Extend the frame range backward to capture the throttle drop that leads into this window
    const firstIdx = window.frameIndices[0]
    const lastIdx = window.frameIndices[window.frameIndices.length - 1]
    const lookbackCount = Math.min(firstIdx, Math.floor(window.frameIndices.length * 0.5))
    const extendedStartIdx = firstIdx - lookbackCount
    const extendedFrames = frames.slice(extendedStartIdx, lastIdx + 1)
    const sampleRate = deriveSampleRate(extendedFrames)

    const metrics = detectPropwash(extendedFrames, window.axis, sampleRate)

    if (!metrics.detected) {
      return []
    }

    // Classify severity based on amplitude and duration (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (metrics.amplitude > 50 * scale || metrics.duration > 120 * scale) {
      severity = 'high'
    } else if (metrics.amplitude > 30 * scale || metrics.duration > 80 * scale) {
      severity = 'medium'
    } else if (metrics.amplitude > 18 * scale) {
      severity = 'low'
    } else {
      severity = 'low'
    }

    // Higher confidence for typical propwash frequency range (10-30 Hz)
    const frequencyConfidence =
      metrics.frequency > 10 && metrics.frequency < 30 ? 0.9 : 0.7

    issues.push({
      id: generateId(),
      type: 'propwash',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Propwash oscillation: ${metrics.frequency.toFixed(1)} Hz, ${metrics.amplitude.toFixed(1)}° amplitude`,
      metrics: {
        frequency: metrics.frequency,
        amplitude: metrics.amplitude,
        dtermActivity: metrics.dtermActivity,
      },
      confidence: frequencyConfidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'propwash') continue

      const frequency = issue.metrics.frequency || 0
      const amplitude = issue.metrics.amplitude || 0
      const dtermActivity = issue.metrics.dtermActivity || 0

      // Add iterm_relax_cutoff recommendation for profiles that prefer it
      if (profile?.overrides.propwashPreferItermRelax && profile.overrides.itermRelaxCutoff > 0) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 8,
          confidence: issue.confidence,
          title: `Lower I-term relax cutoff on ${issue.axis}`,
          description: `For ${profile.label} quads, lowering iterm_relax_cutoff is often more effective than raising D-min for propwash`,
          rationale:
            'I-term relax controls how aggressively the I-term builds during rapid maneuvers. A lower cutoff prevents I-term windup that exacerbates propwash oscillations, which is especially effective on larger or lower-authority quads.',
          risks: [
            'May reduce tracking precision on very aggressive moves',
            'Could feel slightly less locked-in during rapid direction changes',
          ],
          changes: [
            {
              parameter: 'itermRelaxCutoff',
              recommendedChange: String(profile.overrides.itermRelaxCutoff),
              explanation: `Set iterm_relax_cutoff to ${profile.overrides.itermRelaxCutoff} (recommended for ${profile.label} quads)`,
            },
          ],
          expectedImprovement: 'Reduced propwash oscillations by limiting I-term windup during throttle transitions',
        })
      }

      if (amplitude > 60) {
        // Severe propwash - multiple interventions needed
        recommendations.push(
          {
            id: generateId(),
            issueId: issue.id,
            type: 'increasePID',
            priority: 9,
            confidence: issue.confidence,
            title: `Increase D_min on ${issue.axis}`,
            description: 'Severe propwash requires stronger low-throttle damping',
            rationale:
              'D_min provides damping specifically at low throttle where propwash occurs. Higher D_min resists oscillations from disturbed air.',
            risks: [
              'May increase motor temperature',
              'Could amplify noise if gyro filtering insufficient',
            ],
            changes: [
              {
                parameter: 'pidDMinGain',
                recommendedChange: '+0.4',
                axis: issue.axis,
                explanation: 'Significant D_min increase for propwash resistance',
              },
            ],
            expectedImprovement: 'Reduced oscillation amplitude during throttle drops by 40-60%',
          },
          {
            id: generateId(),
            issueId: issue.id,
            type: 'adjustDynamicIdle',
            priority: 8,
            confidence: 0.85,
            title: 'Increase Dynamic Idle',
            description: 'Higher idle speed reduces propwash susceptibility',
            rationale:
              'Dynamic idle keeps motors spinning faster at low throttle, maintaining authority and reducing propwash effects.',
            risks: [
              'Slightly increased amp draw at low throttle',
              'May feel less "floaty" in descents',
            ],
            changes: [
              {
                parameter: 'dynamicIdle',
                recommendedChange: '+3',
                explanation: 'Increase from typical 30 to 33 for better low-throttle authority',
              },
            ],
            expectedImprovement:
              'More stable descents with better motor authority in disturbed air',
          }
        )
      } else if (frequency > 30 && dtermActivity > 100) {
        // High-frequency propwash with D-term struggling — RPM filter-aware
        const rpmHarmonics = metadata?.filterSettings?.rpmFilterHarmonics
        if (rpmHarmonics === undefined || rpmHarmonics === 0) {
          recommendations.push({
            id: generateId(),
            issueId: issue.id,
            type: 'adjustFiltering',
            priority: 7,
            confidence: 0.75,
            title: `Enable RPM filter on ${issue.axis}`,
            description: 'RPM filter is not enabled — it removes motor noise that interacts with propwash',
            rationale:
              'RPM filter removes motor noise that can interact with propwash. Enabling it with 3 harmonics improves D-term effectiveness.',
            risks: ['Requires ESC telemetry to be working', 'May need firmware update'],
            changes: [
              {
                parameter: 'rpmFilterHarmonics',
                recommendedChange: '3',
                explanation: 'Enable RPM filter with 3 harmonics for motor noise filtering',
              },
            ],
            expectedImprovement: 'Cleaner D-term response allowing more effective damping',
          })
        } else if (rpmHarmonics < 3) {
          recommendations.push({
            id: generateId(),
            issueId: issue.id,
            type: 'adjustFiltering',
            priority: 7,
            confidence: 0.75,
            title: `Increase RPM filter harmonics on ${issue.axis}`,
            description: `RPM filter has ${rpmHarmonics} harmonic(s) — increase to 3 for better propwash handling`,
            rationale:
              'RPM filter removes motor noise that can interact with propwash. More harmonics provide better coverage of motor noise overtones.',
            risks: ['Marginal latency increase', 'May need firmware update'],
            changes: [
              {
                parameter: 'rpmFilterHarmonics',
                recommendedChange: '3',
                explanation: 'Set RPM filter to 3 harmonics for comprehensive filtering',
              },
            ],
            expectedImprovement: 'Cleaner D-term response allowing more effective damping',
          })
        }
        // If RPM already at 3 harmonics, skip — propwash issue is elsewhere
      } else {
        // Moderate propwash - standard D_min increase
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'increasePID',
          priority: 6,
          confidence: issue.confidence,
          title: `Increase D_min on ${issue.axis}`,
          description: 'Moderate propwash responds well to D_min increase',
          rationale:
            'D_min specifically targets low-throttle damping without affecting high-speed flight.',
          risks: ['Slight increase in motor heat'],
          changes: [
            {
              parameter: 'pidDMinGain',
              recommendedChange: '+0.2',
              axis: issue.axis,
              explanation: 'Moderate D_min boost for improved propwash handling',
            },
          ],
          expectedImprovement: 'Smoother throttle drops with less visible oscillation',
        })
      }

      // For severe propwash, also recommend iterm_relax_cutoff if not already
      // covered by the profile-specific path above
      if (issue.severity === 'high' && !profile?.overrides.propwashPreferItermRelax) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 5,
          confidence: 0.70,
          title: `Lower I-term relax cutoff on ${issue.axis}`,
          description: 'Severe propwash may be worsened by I-term windup during throttle transitions',
          rationale:
            'I-term relax controls how aggressively the I-term builds during rapid maneuvers. A lower cutoff prevents the I-term from winding up and amplifying propwash oscillations.',
          risks: [
            'May slightly reduce tracking precision on aggressive moves',
            'Could feel slightly less locked-in during rapid direction changes',
          ],
          changes: [
            {
              parameter: 'itermRelaxCutoff',
              recommendedChange: '10',
              explanation: 'Lower iterm_relax_cutoff to reduce I-term contribution to propwash',
            },
          ],
          expectedImprovement: 'Reduced propwash by limiting I-term windup during throttle drops',
        })
      }
    }

    return recommendations
  },
}


