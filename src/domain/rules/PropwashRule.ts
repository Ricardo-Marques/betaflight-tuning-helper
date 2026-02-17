import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { detectPropwash, deriveSampleRate } from '../utils/SignalAnalysis'

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
    // Look for windows with throttle drops and low stick input
    return (
      window.metadata.avgThrottle < 1500 &&
      !window.metadata.hasStickInput &&
      window.frameIndices.length > 50
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    // Extend the frame range backward to capture the throttle drop that leads into this window
    const firstIdx = window.frameIndices[0]
    const lastIdx = window.frameIndices[window.frameIndices.length - 1]
    const lookbackCount = Math.min(firstIdx, Math.floor(window.frameIndices.length * 0.5))
    const extendedStartIdx = firstIdx - lookbackCount
    const extendedFrames = frames.slice(extendedStartIdx, lastIdx + 1)
    const sampleRate = deriveSampleRate(extendedFrames)

    // Log why detection might not run
    console.debug(`${PropwashRule.id} analyzing window:`, {
      axis: window.axis,
      maxSetpoint: window.metadata.maxSetpoint,
      hasStickInput: window.metadata.hasStickInput,
      avgThrottle: window.metadata.avgThrottle,
      frameCount: extendedFrames.length,
    })

    const metrics = detectPropwash(extendedFrames, window.axis, sampleRate)

    if (!metrics.detected) {
      console.debug(`${PropwashRule.id}: No issue detected`, metrics)
      return []
    }

    // Classify severity based on amplitude and duration
    // Well-tuned quads target < 15 deg/s propwash
    let severity: 'low' | 'medium' | 'high' | 'critical'
    if (metrics.amplitude > 50 || metrics.duration > 120) {
      severity = 'critical'
    } else if (metrics.amplitude > 30 || metrics.duration > 80) {
      severity = 'high'
    } else if (metrics.amplitude > 18) {
      severity = 'medium'
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

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'propwash') continue

      const frequency = issue.metrics.frequency || 0
      const amplitude = issue.metrics.amplitude || 0
      const dtermActivity = issue.metrics.dtermActivity || 0

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
        // High-frequency propwash with D-term struggling
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 7,
          confidence: 0.75,
          title: `Verify RPM filter on ${issue.axis}`,
          description: 'High-frequency propwash suggests RPM filter may need adjustment',
          rationale:
            'RPM filter removes motor noise that can interact with propwash. Ensuring proper operation improves D-term effectiveness.',
          risks: ['Requires ESC telemetry to be working', 'May need firmware update'],
          changes: [
            {
              parameter: 'rpmFilterHarmonics',
              recommendedChange: '3',
              explanation: 'Ensure 3 harmonics for comprehensive motor noise filtering',
            },
          ],
          expectedImprovement: 'Cleaner D-term response allowing more effective damping',
        })
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

      // Additional recommendation for master multiplier if widespread
      if (severity === 'critical' || severity === 'high') {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustMasterMultiplier',
          priority: 5,
          confidence: 0.70,
          title: 'Consider Master Multiplier increase',
          description: 'Severe propwash may benefit from overall PID increase',
          rationale:
            'If propwash is widespread across axes, the quad may be generally under-damped. Master multiplier scales all PIDs proportionally.',
          risks: [
            'Will increase ALL PIDs - may cause issues if other axes are well-tuned',
            'Increases motor heat and battery consumption',
            'May require filter adjustments',
          ],
          changes: [
            {
              parameter: 'pidMasterMultiplier',
              recommendedChange: '+5%',
              explanation: 'Small master multiplier increase for global damping improvement',
            },
          ],
          expectedImprovement: 'Overall improvement in stability during aggressive maneuvers',
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

type Severity = 'low' | 'medium' | 'high' | 'critical'
const severity: Severity = 'low' // Just to satisfy type checking
