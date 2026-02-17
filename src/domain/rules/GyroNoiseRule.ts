import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { calculateRMS, analyzeFrequency } from '../utils/FrequencyAnalysis'

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Detects excessive gyro noise floor during stable hover/cruise
 */
export const GyroNoiseRule: TuningRule = {
  id: 'gyro-noise-detection',
  name: 'Gyro Noise Floor Detection',
  description: 'Detects excessive gyro noise during stable hover',
  baseConfidence: 0.85,
  issueTypes: ['gyroNoise'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Hover/low cruise without stick input
    return (
      !window.metadata.hasStickInput &&
      window.metadata.avgThrottle >= 1200 &&
      window.metadata.avgThrottle <= 1600
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)

    // Extract gyro signal for this axis
    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)

    // Compute RMS
    const gyroRMS = calculateRMS(gyroSignal)

    // FFT → check high-band energy ratio
    const spectrum = analyzeFrequency(gyroSignal, sampleRate)
    const totalEnergy = spectrum.bandEnergy.low + spectrum.bandEnergy.mid + spectrum.bandEnergy.high
    const highBandRatio = totalEnergy > 0 ? spectrum.bandEnergy.high / totalEnergy : 0

    // Detected if: gyroRMS > 3 AND (high-band ratio > 0.3 OR gyroRMS > 8)
    if (gyroRMS <= 3 || (highBandRatio <= 0.3 && gyroRMS <= 8)) {
      return []
    }

    // Classify severity based on gyroRMS
    let severity: 'low' | 'medium' | 'high' | 'critical'
    if (gyroRMS > 15) {
      severity = 'critical'
    } else if (gyroRMS > 10) {
      severity = 'high'
    } else if (gyroRMS > 5) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    const confidence = Math.min(0.95, 0.6 + gyroRMS * 0.02 + highBandRatio * 0.2)

    issues.push({
      id: uuidv4(),
      type: 'gyroNoise',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Gyro noise: ${gyroRMS.toFixed(1)}°/s RMS, ${(highBandRatio * 100).toFixed(0)}% high-freq energy on ${window.axis}`,
      metrics: {
        noiseFloor: gyroRMS,
        dominantBand: highBandRatio > 0.5 ? 'high' : gyroRMS > 8 ? 'mid' : 'low',
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'gyroNoise') continue

      const gyroRMS = issue.metrics.noiseFloor || 0

      // Increase gyro filtering
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'adjustFiltering',
        priority: 8,
        confidence: issue.confidence,
        title: `Increase gyro filtering on ${issue.axis}`,
        description: 'Excessive gyro noise floor — increase gyro filter strength',
        rationale:
          'Gyro noise passes through to PID calculations, causing motor noise and heat. Stronger filtering removes noise before it affects PIDs.',
        risks: [
          'Adds phase delay, reducing responsiveness',
          'May cause "mushy" feel if overdone',
        ],
        changes: [
          {
            parameter: 'gyroFilterMultiplier',
            recommendedChange: '+1',
            explanation: 'Increase gyro filter multiplier for stronger noise suppression',
          },
        ],
        expectedImprovement: 'Cleaner gyro signal, quieter motors, reduced heat',
      })

      // Adjust dynamic notch
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'adjustFiltering',
        priority: 7,
        confidence: issue.confidence * 0.9,
        title: 'Adjust dynamic notch filter',
        description: 'Dynamic notch can track and remove resonant noise peaks',
        rationale:
          'The dynamic notch filter automatically tracks and removes motor resonance frequencies. Using 2 notches provides good coverage without excessive latency.',
        risks: [
          'Additional notches add computation time',
          'May need Q-factor tuning for optimal performance',
        ],
        changes: [
          {
            parameter: 'dynamicNotchCount',
            recommendedChange: '2',
            explanation: 'Use 2 dynamic notches for better resonance tracking',
          },
        ],
        expectedImprovement: 'Targeted removal of resonant noise peaks',
      })

      // Extreme cases: informational about hardware vibration
      if (gyroRMS > 12) {
        recommendations.push({
          id: uuidv4(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 5,
          confidence: issue.confidence * 0.7,
          title: 'Check for hardware vibration issues',
          description: 'Very high gyro noise may indicate mechanical vibration problems',
          rationale:
            'Extremely high gyro noise during hover often indicates hardware issues: loose FC mounting, unbalanced props, bent motor shafts, or worn bearings. Software filtering can only do so much.',
          risks: [
            'Requires physical inspection of the quad',
            'May need replacement parts',
          ],
          changes: [],
          expectedImprovement: 'Dramatically reduced noise at the source, allowing lower filter settings',
        })
      }
    }

    return recommendations
  },
}
