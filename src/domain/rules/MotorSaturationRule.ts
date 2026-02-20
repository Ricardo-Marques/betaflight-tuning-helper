import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { detectMotorSaturation } from '../utils/SignalAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues, lookupCurrentValue } from '../utils/SettingsLookup'

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
    // Analyze windows with active flight (throttle above idle)
    return window.metadata.avgThrottle > 1100
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const scale = profile?.thresholds.motorSaturation ?? 1.0

    const metrics = detectMotorSaturation(windowFrames)

    // Motor saturation detection (only above 1300 throttle)
    if (metrics.detected && window.metadata.avgThrottle > 1300) {
      let severity: 'low' | 'medium' | 'high'
      if (metrics.saturationPercentage > 30 * scale) {
        severity = 'high'
      } else if (metrics.saturationPercentage > 15 * scale) {
        severity = 'medium'
      } else if (metrics.saturationPercentage > 8 * scale) {
        severity = 'low'
      } else {
        return []
      }

      const confidence = Math.min(0.95, 0.7 + metrics.saturationPercentage * 0.005)

      issues.push({
        id: generateId(),
        type: 'motorSaturation',
        severity,
        axis: window.axis,
        timeRange: [window.startTime, window.endTime],
        description: `Motor saturation: ${metrics.saturationPercentage.toFixed(1)}% at max output, asymmetry: ${(metrics.asymmetry * 100).toFixed(1)}%`,
        metrics: {
          motorSaturation: metrics.saturationPercentage,
          amplitude: metrics.averageMotorOutput, // Store for insufficient authority check
        },
        confidence,
      })
    }

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], _profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'motorSaturation') continue

      const saturation = issue.metrics.motorSaturation || 0
      const currentTpa = metadata ? lookupCurrentValue('tpaRate', metadata) : undefined

      // Check for underpowered build: if average hover motor output > 60% of range
      // the build lacks authority and PID reduction won't help
      const avgMotor = issue.metrics.amplitude // We store averageMotorOutput in amplitude
      if (avgMotor !== undefined && avgMotor > 1600) {
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'hardwareCheck',
          priority: 9,
          confidence: issue.confidence,
          category: 'hardware',
          title: 'Build lacks motor authority',
          description: `Average motor output is ${avgMotor.toFixed(0)} (${((avgMotor - 1000) / 10).toFixed(0)}% of range) — this build is underpowered for the weight`,
          rationale:
            'When hover requires more than 60% of motor authority, there is insufficient headroom for PID corrections and maneuvers. Reducing PIDs would worsen tracking without fixing saturation. The solution is hardware: lighter battery, more powerful motors, or reduced weight.',
          risks: [
            'May need motor or prop upgrade',
            'Lighter battery means shorter flight time',
          ],
          changes: [],
          expectedImprovement: 'More motor headroom for PID corrections, eliminating the saturation-tune-worse cycle',
        })
        continue // Don't suggest PID reduction for underpowered builds
      }

      if (saturation > 15) {
        // Critical/High: Reduce master multiplier
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustMasterMultiplier',
          priority: 9,
          confidence: issue.confidence,
          title: 'Reduce PID master multiplier',
          description: 'Significant motor saturation detected - PIDs are demanding more than motors can deliver',
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

      if (saturation > 15 && (currentTpa === undefined || currentTpa < 75)) {
        // High: Increase TPA rate (skip if already >= 75)
        recommendations.push({
          id: generateId(),
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
          id: generateId(),
          issueId: issue.id,
          type: 'decreasePID',
          priority: 6,
          confidence: issue.confidence * 0.85,
          title: 'Reduce P and D gains',
          description: 'Moderate motor saturation - slight PID reduction may help',
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
              explanation: 'Reduce P to lower motor demand',
            },
            {
              parameter: 'pidDGain',
              recommendedChange: '-0.1',
              explanation: 'Reduce D to lower motor demand',
            },
          ],
          expectedImprovement: 'Reduced motor saturation with minimal performance impact',
        })
      }

      if (saturation > 5 && saturation <= 8 && (currentTpa === undefined || currentTpa < 75)) {
        // Low: Increase TPA as a light touch (skip if already >= 75)
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustTPA',
          priority: 4,
          confidence: issue.confidence * 0.75,
          title: 'Consider increasing TPA rate',
          description: 'Minor motor saturation during high-throttle maneuvers',
          rationale:
            'Light motor saturation can often be addressed by slightly increasing TPA to reduce PID authority at high throttle, where saturation is most likely to occur.',
          risks: [
            'Slightly reduced tracking at high throttle',
            'May not be needed if saturation only occurs during extreme maneuvers',
          ],
          changes: [
            {
              parameter: 'tpaRate',
              recommendedChange: '+5',
              explanation: 'Small TPA increase to reduce high-throttle motor demand',
            },
          ],
          expectedImprovement: 'Less occasional motor saturation during punches',
        })
      }
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}
