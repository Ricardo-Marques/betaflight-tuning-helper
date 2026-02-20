import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { generateId } from '../utils/generateId'

/**
 * Detects ESC desync events: sudden single-motor spikes that return to normal
 * within one frame, uncorrelated with setpoint changes.
 */
export const EscDesyncRule: TuningRule = {
  id: 'esc-desync-detection',
  name: 'ESC Desync Detection',
  description: 'Detects sudden motor output spikes indicating ESC desync events',
  baseConfidence: 0.80,
  issueTypes: ['escDesync'],
  applicableAxes: ['roll'], // Global issue, use roll only

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    return window.metadata.avgThrottle > 1100
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const windowFrames = window.frameIndices.map(i => frames[i])
    if (windowFrames.length < 3) return []

    const motorCount = windowFrames[0]?.motor.length || 4
    const desyncThreshold = 500 // 25% of motor range (0-2000)
    let desyncCount = 0
    let worstMotor = -1
    let worstDelta = 0

    for (let f = 1; f < windowFrames.length - 1; f++) {
      const prev = windowFrames[f - 1]
      const curr = windowFrames[f]
      const next = windowFrames[f + 1]

      for (let m = 0; m < motorCount; m++) {
        const delta1 = Math.abs(curr.motor[m] - prev.motor[m])
        const delta2 = Math.abs(next.motor[m] - curr.motor[m])

        // Spike pattern: large jump followed by return
        if (delta1 > desyncThreshold && delta2 > desyncThreshold * 0.5) {
          // Verify it's not a commanded move — check other motors
          let otherMotorDelta = 0
          for (let o = 0; o < motorCount; o++) {
            if (o !== m) {
              otherMotorDelta += Math.abs(curr.motor[o] - prev.motor[o])
            }
          }
          const avgOtherDelta = otherMotorDelta / (motorCount - 1)

          // Single-motor spike: this motor jumped much more than the others
          if (delta1 > avgOtherDelta * 3) {
            desyncCount++
            if (delta1 > worstDelta) {
              worstDelta = delta1
              worstMotor = m
            }
          }
        }
      }
    }

    if (desyncCount === 0) return []

    return [{
      id: generateId(),
      type: 'escDesync',
      severity: desyncCount > 3 ? 'high' : desyncCount > 1 ? 'medium' : 'low',
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `ESC desync: ${desyncCount} spike(s) detected, worst on motor ${worstMotor + 1} (${worstDelta.toFixed(0)} unit jump)`,
      metrics: {
        amplitude: worstDelta,
      },
      confidence: Math.min(0.90, 0.6 + desyncCount * 0.1),
    }]
  },

  recommend: (issues: DetectedIssue[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'escDesync') continue

      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'hardwareCheck',
        priority: 9,
        confidence: issue.confidence,
        category: 'hardware',
        title: 'Investigate ESC desync',
        description: issue.description,
        rationale:
          'ESC desync occurs when the ESC loses synchronization with the motor. The motor briefly stops commutating, the ESC panics and applies a corrective pulse, causing the characteristic single-motor spike. Causes include: timing too aggressive, motor KV/ESC mismatch, damaged motor magnets, or high demag events.',
        risks: [
          'Repeated desyncs can damage motors and ESCs',
          'Risk of mid-air loss of control',
          'May need ESC firmware update or parameter tuning',
        ],
        changes: [],
        expectedImprovement: 'Elimination of dangerous desync events, smoother motor operation',
      })
    }

    return recommendations
  },
}
