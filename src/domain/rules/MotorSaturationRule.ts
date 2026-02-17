import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { detectMotorSaturation } from '../utils/SignalAnalysis'

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Detects motor saturation (motors hitting max output) and recommends PID/TPA adjustments
 */
export const MotorSaturationRule: TuningRule = {
  id: 'motor-saturation-detection',
  name: 'Motor Saturation Detection',
  description: 'Detects motors at max output and motor asymmetry',
  baseConfidence: 0.85,
  issueTypes: ['motorSaturation'],
  applicableAxes: ['roll'], // Global issue, use roll only to avoid 3x duplicates

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Only analyze windows with active flight (throttle above idle)
    return window.metadata.avgThrottle > 1300
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])

    const metrics = detectMotorSaturation(windowFrames)

    if (!metrics.detected) {
      return []
    }

    // Classify severity based on saturation percentage
    let severity: 'low' | 'medium' | 'high' | 'critical'
    if (metrics.saturationPercentage > 30) {
      severity = 'critical'
    } else if (metrics.saturationPercentage > 15) {
      severity = 'high'
    } else if (metrics.saturationPercentage > 8) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    // Confidence based on sample size and consistency
    const confidence = Math.min(0.95, 0.7 + metrics.saturationPercentage * 0.005)

    issues.push({
      id: uuidv4(),
      type: 'motorSaturation',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Motor saturation: ${metrics.saturationPercentage.toFixed(1)}% at max output, asymmetry: ${(metrics.asymmetry * 100).toFixed(1)}%`,
      metrics: {
        motorSaturation: metrics.saturationPercentage,
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'motorSaturation') continue

      const saturation = issue.metrics.motorSaturation || 0

      if (saturation > 15) {
        // Critical/High: Reduce master multiplier
        recommendations.push({
          id: uuidv4(),
          issueId: issue.id,
          type: 'adjustMasterMultiplier',
          priority: 9,
          confidence: issue.confidence,
          title: 'Reduce PID master multiplier',
          description: 'Significant motor saturation detected — PIDs are demanding more than motors can deliver',
          rationale:
            'When motors hit max output, the flight controller loses authority. Reducing the master multiplier scales all PIDs proportionally, giving motors headroom.',
          risks: [
            'Reduced responsiveness and tracking precision',
            'May need to compensate with more aggressive flying style',
          ],
          changes: [
            {
              parameter: 'pidMasterMultiplier',
              recommendedChange: '-10%',
              explanation: 'Reduce master multiplier by 10% to give motors headroom',
            },
          ],
          expectedImprovement: 'Motors stay within operating range, improved control authority',
        })
      }

      if (saturation > 15) {
        // High: Increase TPA rate
        recommendations.push({
          id: uuidv4(),
          issueId: issue.id,
          type: 'adjustTPA',
          priority: 7,
          confidence: issue.confidence * 0.9,
          title: 'Increase TPA rate',
          description: 'TPA reduces PID gains at high throttle where saturation occurs',
          rationale:
            'TPA (Throttle PID Attenuation) automatically reduces PID gains at high throttle. Increasing TPA rate helps prevent saturation during punches.',
          risks: [
            'Reduced tracking at high throttle',
            'May feel less locked-in during power maneuvers',
          ],
          changes: [
            {
              parameter: 'tpaRate',
              recommendedChange: '+10',
              explanation: 'Increase TPA rate to reduce PID authority at high throttle',
            },
          ],
          expectedImprovement: 'Less motor saturation during high-throttle maneuvers',
        })
      }

      if (saturation > 8 && saturation <= 15) {
        // Medium: Reduce P and D
        recommendations.push({
          id: uuidv4(),
          issueId: issue.id,
          type: 'decreasePID',
          priority: 6,
          confidence: issue.confidence * 0.85,
          title: 'Reduce P and D gains',
          description: 'Moderate motor saturation — slight PID reduction may help',
          rationale:
            'P and D gains are the main contributors to motor output demand. A small reduction can prevent occasional saturation.',
          risks: [
            'Slightly reduced tracking and damping',
            'May need to adjust incrementally',
          ],
          changes: [
            {
              parameter: 'pidPGain',
              recommendedChange: '-0.2',
              axis: 'roll',
              explanation: 'Reduce P to lower motor demand',
            },
            {
              parameter: 'pidDGain',
              recommendedChange: '-0.1',
              axis: 'roll',
              explanation: 'Reduce D to lower motor demand',
            },
          ],
          expectedImprovement: 'Reduced motor saturation with minimal performance impact',
        })
      }
    }

    return recommendations
  },
}
