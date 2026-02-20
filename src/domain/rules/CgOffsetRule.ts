import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { generateId } from '../utils/generateId'

/**
 * Dedicated CG offset detection during hover.
 * Groups motors into diagonal pairs per Betaflight motor numbering convention
 * (motors 1+4 vs 2+3) and flags if one pair consistently works harder.
 */
export const CgOffsetRule: TuningRule = {
  id: 'cg-offset-detection',
  name: 'CG Offset Detection',
  description: 'Detects center of gravity offset from diagonal motor pair imbalance during hover',
  baseConfidence: 0.80,
  issueTypes: ['cgOffset'],
  applicableAxes: ['roll'], // Global issue, use roll only to avoid 3x duplicates

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Hover windows with minimal stick input
    return (
      window.metadata.avgThrottle >= 1100 &&
      window.metadata.avgThrottle <= 1400 &&
      !window.metadata.hasStickInput
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const windowFrames = window.frameIndices.map(i => frames[i])
    const motorCount = windowFrames[0]?.motor.length || 4
    if (motorCount < 4) return []

    // Accumulate per-motor averages
    const motorSums = new Array(motorCount).fill(0)
    for (const frame of windowFrames) {
      for (let i = 0; i < motorCount; i++) {
        motorSums[i] += frame.motor[i]
      }
    }
    const n = windowFrames.length
    const motorAvgs = motorSums.map(s => s / n)

    // Diagonal pairs per BF motor numbering: pair A = motors 0+3, pair B = motors 1+2
    const pairAAvg = (motorAvgs[0] + motorAvgs[3]) / 2
    const pairBAvg = (motorAvgs[1] + motorAvgs[2]) / 2
    const overallAvg = (pairAAvg + pairBAvg) / 2

    if (overallAvg <= 0) return []

    const pairDiff = Math.abs(pairAAvg - pairBAvg) / overallAvg
    if (pairDiff < 0.10) return [] // Less than 10% — normal

    // Also check front/back pairs for pitch CG offset
    const frontAvg = (motorAvgs[0] + motorAvgs[1]) / 2
    const backAvg = (motorAvgs[2] + motorAvgs[3]) / 2
    const fbDiff = Math.abs(frontAvg - backAvg) / overallAvg

    // Determine offset direction
    let direction: string
    if (pairDiff > fbDiff) {
      direction = pairAAvg > pairBAvg ? 'toward motors 1 & 4' : 'toward motors 2 & 3'
    } else {
      direction = frontAvg > backAvg ? 'toward front' : 'toward rear'
    }
    const maxDiff = Math.max(pairDiff, fbDiff)

    return [{
      id: generateId(),
      type: 'cgOffset',
      severity: maxDiff > 0.20 ? 'high' : maxDiff > 0.15 ? 'medium' : 'low',
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `CG offset: ${(maxDiff * 100).toFixed(0)}% motor imbalance ${direction} during hover`,
      metrics: {
        motorSaturation: maxDiff * 100,
      },
      confidence: Math.min(0.90, 0.6 + maxDiff * 2),
    }]
  },

  recommend: (issues: DetectedIssue[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'cgOffset') continue

      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'hardwareCheck',
        priority: 7,
        confidence: issue.confidence,
        category: 'hardware',
        title: 'Adjust center of gravity',
        description: issue.description,
        rationale:
          'One set of motors consistently works harder than the opposite set during hover. This means the center of gravity is shifted, forcing the flight controller to compensate. Moving the battery or redistributing weight evens out the load.',
        risks: [
          'Requires repositioning the battery on the frame',
          'May need to adjust battery strap or mounting point',
        ],
        changes: [],
        expectedImprovement: 'Even motor loading, longer flight times, better handling in all maneuvers',
      })
    }

    return recommendations
  },
}
