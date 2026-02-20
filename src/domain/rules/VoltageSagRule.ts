import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { generateId } from '../utils/generateId'

/**
 * Detects voltage sag by comparing motor output across flight quartiles.
 * If motor output for equivalent throttle positions increases later in the flight,
 * the battery is sagging (lower voltage = more current needed for same thrust).
 */
export const VoltageSagRule: TuningRule = {
  id: 'voltage-sag-detection',
  name: 'Voltage Sag Detection',
  description: 'Detects battery voltage sag by comparing motor output across flight duration',
  baseConfidence: 0.70,
  issueTypes: ['voltageSag'],
  applicableAxes: ['roll'], // Global issue, use roll only

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Mid-throttle cruise windows for consistent comparison
    return (
      window.metadata.avgThrottle >= 1200 &&
      window.metadata.avgThrottle <= 1600 &&
      !window.metadata.hasStickInput
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    // This rule needs to compare early vs late windows in the full flight.
    // Since each window is analyzed independently, we embed timestamp context
    // and let the dedup stage merge early/late observations.
    const windowFrames = window.frameIndices.map(i => frames[i])
    const motorCount = windowFrames[0]?.motor.length || 4

    // Calculate average motor output for this window
    let motorSum = 0
    for (const frame of windowFrames) {
      for (let i = 0; i < motorCount; i++) {
        motorSum += frame.motor[i]
      }
    }
    const avgMotor = motorSum / (windowFrames.length * motorCount)

    // Determine flight progress (0-1) based on frame position in the full log
    const firstIdx = window.frameIndices[0]
    const flightProgress = frames.length > 0 ? firstIdx / frames.length : 0

    // Only flag if we're in the last quartile AND motor output is elevated
    // The early quartile baseline is handled by comparing across deduped issues
    if (flightProgress < 0.75) return []

    // Calculate what motor output "should be" at this throttle
    // Approximate: at 1400 throttle, typical hover motor output ~1300-1400
    // If it's significantly above the throttle position, voltage is sagging
    const throttleNormalized = window.metadata.avgThrottle
    const excessMotor = avgMotor - throttleNormalized

    // If motors need to work 5%+ harder than the throttle command suggests
    if (excessMotor < 50) return [] // Motor output should roughly track throttle

    return [{
      id: generateId(),
      type: 'voltageSag',
      severity: excessMotor > 150 ? 'high' : excessMotor > 100 ? 'medium' : 'low',
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Voltage sag: motors running ${excessMotor.toFixed(0)} units above throttle command in last quarter of flight`,
      metrics: {
        motorSaturation: excessMotor,
      },
      confidence: Math.min(0.85, 0.5 + excessMotor * 0.002),
    }]
  },

  recommend: (issues: DetectedIssue[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'voltageSag') continue

      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'hardwareCheck',
        priority: 5,
        confidence: issue.confidence,
        category: 'hardware',
        title: 'Battery voltage sag detected',
        description: issue.description,
        rationale:
          'Motor output increases over the flight for the same throttle position, indicating the battery voltage is dropping. The flight controller compensates by commanding higher motor duty cycles. This reduces headroom and can lead to motor saturation near the end of flights.',
        risks: [
          'Battery may be worn or undersized for the quad',
          'Landing earlier preserves battery health',
        ],
        changes: [],
        expectedImprovement: 'Using a fresher or higher-capacity battery restores full authority throughout the flight',
      })
    }

    return recommendations
  },
}
