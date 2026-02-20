import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { calculateRMS, analyzeFrequency } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'

/**
 * Detects electrical noise at idle — motors barely spinning, so noise must be electrical.
 * Current GyroNoiseRule only checks 1200-1600 range, missing idle noise entirely.
 */
export const ElectricalNoiseRule: TuningRule = {
  id: 'electrical-noise-detection',
  name: 'Electrical Noise Detection',
  description: 'Detects electrical interference visible in gyro at idle',
  baseConfidence: 0.85,
  issueTypes: ['electricalNoise'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    return window.metadata.avgThrottle < 1050
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.gyroNoise ?? 1.0

    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const gyroRMS = calculateRMS(gyroSignal)

    // At idle, motors are barely spinning — any significant gyro activity is electrical
    // 3 deg/s is typical baseline for soft-mounted FCs at rest
    if (gyroRMS <= 3 * scale) {
      return []
    }

    const spectrum = analyzeFrequency(gyroSignal, sampleRate)
    const totalEnergy = spectrum.bandEnergy.low + spectrum.bandEnergy.mid + spectrum.bandEnergy.high
    const highBandRatio = totalEnergy > 0 ? spectrum.bandEnergy.high / totalEnergy : 0

    let severity: DetectedIssue['severity']
    if (gyroRMS > 10 * scale) {
      severity = 'high'
    } else if (gyroRMS > 6 * scale) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    return [{
      id: generateId(),
      type: 'electricalNoise',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Electrical noise at idle: ${gyroRMS.toFixed(1)}°/s RMS, ${(highBandRatio * 100).toFixed(0)}% high-freq`,
      metrics: {
        noiseFloor: gyroRMS,
        dominantBand: highBandRatio > 0.5 ? 'high' : 'mid',
      },
      confidence: Math.min(0.95, 0.7 + gyroRMS * 0.02),
    }]
  },

  recommend: (issues: DetectedIssue[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'electricalNoise') continue

      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'hardwareCheck',
        priority: 7,
        confidence: issue.confidence,
        category: 'hardware',
        title: `Check wiring and shielding on ${issue.axis}`,
        description: 'Gyro noise detected at idle when motors are barely spinning — this is electrical, not mechanical',
        rationale:
          'At idle throttle, motors contribute almost no vibration. Noise present here comes from electrical interference: ESC switching noise, poor grounding, long unshielded gyro wires, or USB ground loops.',
        risks: [
          'May require rewiring or adding capacitors',
          'Could indicate a failing gyro or ESC',
        ],
        changes: [],
        expectedImprovement: 'Cleaner gyro signal at all throttle levels, allowing less aggressive filtering',
      })
    }

    return recommendations
  },
}
