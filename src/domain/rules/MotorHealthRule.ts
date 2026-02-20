import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { generateId } from '../utils/generateId'

/**
 * Detects a single motor consistently working harder than the others,
 * indicating a damaged prop, dying motor, or bent shaft.
 * Distinguished from CG offset (which is 2 adjacent motors on a diagonal).
 */
export const MotorHealthRule: TuningRule = {
  id: 'motor-health-detection',
  name: 'Motor Health Detection',
  description: 'Detects individual motors working significantly harder than the mean',
  baseConfidence: 0.80,
  issueTypes: ['motorImbalance'],
  applicableAxes: ['roll'], // Global issue, use roll only

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Only analyze steady-state flight: above hover throttle and no active pilot input
    // During maneuvers, uneven motor output is normal PID response — not damage
    return window.metadata.avgThrottle > 1200 && !window.metadata.hasStickInput
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const windowFrames = window.frameIndices.map(i => frames[i])
    const motorCount = windowFrames[0]?.motor.length || 4
    if (motorCount < 4) return []

    const motorSums = new Array(motorCount).fill(0)
    for (const frame of windowFrames) {
      for (let i = 0; i < motorCount; i++) {
        motorSums[i] += frame.motor[i]
      }
    }
    const n = windowFrames.length
    const motorAvgs = motorSums.map(s => s / n)
    const overallMean = motorAvgs.reduce((a, b) => a + b, 0) / motorCount

    if (overallMean <= 0) return []

    // Find the motor that deviates most from the mean
    let worstMotor = 0
    let worstDeviation = 0
    for (let i = 0; i < motorCount; i++) {
      const dev = (motorAvgs[i] - overallMean) / overallMean
      if (dev > worstDeviation) {
        worstDeviation = dev
        worstMotor = i
      }
    }

    // 20%+ above mean during steady flight is a clear problem for one motor
    if (worstDeviation < 0.20) return []

    // Distinguish from CG offset: CG offset affects 2 diagonal motors equally
    // Check if it's really one motor, not a pair
    const deviations = motorAvgs.map(avg => (avg - overallMean) / overallMean)
    const highMotors = deviations.filter(d => d > 0.12).length
    if (highMotors >= 2) return [] // Likely CG offset, not single motor issue

    return [{
      id: generateId(),
      type: 'motorImbalance',
      severity: worstDeviation > 0.35 ? 'high' : worstDeviation > 0.25 ? 'medium' : 'low',
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Motor imbalance: motor ${worstMotor + 1} working ${(worstDeviation * 100).toFixed(0)}% harder than average — possible damaged prop or failing motor`,
      metrics: {
        motorSaturation: worstDeviation * 100,
      },
      confidence: Math.min(0.90, 0.6 + worstDeviation * 1.5),
    }]
  },

  recommend: (issues: DetectedIssue[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'motorImbalance') continue

      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'hardwareCheck',
        priority: 8,
        confidence: issue.confidence,
        category: 'hardware',
        title: 'Inspect motor and prop',
        description: issue.description,
        rationale:
          'A single motor consistently running significantly higher than the others indicates an efficiency problem with that motor or its prop. Common causes: damaged or unbalanced prop, worn bearings, bent motor shaft, debris in the bell.',
        risks: [
          'Flying with a damaged motor/prop risks further damage or loss of control',
          'May need replacement parts',
        ],
        changes: [],
        expectedImprovement: 'Even motor loading, reduced vibrations, longer motor and battery life',
      })
    }

    return recommendations
  },
}
