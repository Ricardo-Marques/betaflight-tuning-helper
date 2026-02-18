import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
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
 * Detects D-term amplifying high-frequency noise and recommends filtering/D adjustments
 */
export const DTermNoiseRule: TuningRule = {
  id: 'dterm-noise-detection',
  name: 'D-Term Noise Detection',
  description: 'Detects D-term amplifying high-frequency noise',
  baseConfidence: 0.85,
  issueTypes: ['dtermNoise'],
  applicableAxes: ['roll', 'pitch'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Noise visible during calm flight with throttle above idle
    return window.metadata.avgThrottle > 1100 && !window.metadata.hasStickInput
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.dtermNoise ?? 1.0

    // Extract D-term and gyro signals for this axis
    const dtermSignal = extractAxisData(windowFrames, 'pidD', window.axis)
    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)

    // Compute RMS values
    const dtermRMS = calculateRMS(dtermSignal)
    const gyroRMS = calculateRMS(gyroSignal)

    // D-to-gyro ratio: high ratio means D is amplifying noise
    const dToGyroRatio = dtermRMS / (gyroRMS + 1)

    // FFT on D-term signal to check high-band energy
    const spectrum = analyzeFrequency(dtermSignal, sampleRate)
    const totalEnergy = spectrum.bandEnergy.low + spectrum.bandEnergy.mid + spectrum.bandEnergy.high
    const highBandRatio = totalEnergy > 0 ? spectrum.bandEnergy.high / totalEnergy : 0

    // Detected if D-term is disproportionately noisy and high-frequency dominant (scaled by profile)
    if (dToGyroRatio <= 0.5 * scale || highBandRatio <= 0.3) {
      return []
    }

    // Classify severity based on D-to-gyro ratio (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (dToGyroRatio > 2.0 * scale) {
      severity = 'high'
    } else if (dToGyroRatio > 1.0 * scale) {
      severity = 'medium'
    } else {
      severity = 'medium'
    }

    const confidence = Math.min(0.95, 0.65 + highBandRatio * 0.3 + dToGyroRatio * 0.05)

    issues.push({
      id: uuidv4(),
      type: 'dtermNoise',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `D-term noise: ratio ${dToGyroRatio.toFixed(2)}x gyro, ${(highBandRatio * 100).toFixed(0)}% high-freq energy`,
      metrics: {
        dtermActivity: dtermRMS,
        noiseFloor: gyroRMS,
        dominantBand: 'high',
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'dtermNoise') continue

      // Increase D-term filtering
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'adjustFiltering',
        priority: 8,
        confidence: issue.confidence,
        title: `Increase D-term filtering on ${issue.axis}`,
        description: 'D-term is amplifying high-frequency noise — increase D-term filter cutoff',
        rationale:
          'The D-term differentiates the gyro signal, amplifying high-frequency noise. Stronger D-term filtering removes this noise before it reaches the motors.',
        risks: [
          'Adds phase delay to the D-term response',
          'May reduce damping effectiveness at higher frequencies',
        ],
        changes: [
          {
            parameter: 'dtermFilterMultiplier',
            recommendedChange: '+10',
            explanation: 'Increase D-term filter multiplier for stronger noise suppression',
          },
        ],
        expectedImprovement: 'Quieter motors, reduced D-term noise without losing control',
      })

      // Reduce D gain
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'decreasePID',
        priority: 7,
        confidence: issue.confidence * 0.9,
        title: `Reduce D gain on ${issue.axis}`,
        description: 'Lower D gain to reduce noise amplification',
        rationale:
          'If filtering alone is insufficient, reducing D gain directly lowers the noise amplification. This trades some damping for quieter operation.',
        risks: [
          'Reduced damping may increase propwash or bounceback',
          'May need to adjust P to compensate',
        ],
        changes: [
          {
            parameter: 'pidDGain',
            recommendedChange: '-0.2',
            axis: issue.axis,
            explanation: 'Reduce D gain to lower noise amplification',
          },
        ],
        expectedImprovement: 'Reduced motor noise and heat from D-term',
      })

      // Verify RPM filter
      recommendations.push({
        id: uuidv4(),
        issueId: issue.id,
        type: 'adjustRPMFilter',
        priority: 6,
        confidence: issue.confidence * 0.8,
        title: 'Verify RPM filter configuration',
        description: 'RPM filter removes motor noise at source — ensure it is properly configured',
        rationale:
          'The RPM filter uses motor telemetry to precisely notch out motor noise harmonics. With 3 harmonics enabled, it covers the fundamental and first two overtones.',
        risks: [
          'Requires bidirectional DShot and ESC telemetry',
          'Too many harmonics can add latency',
        ],
        changes: [
          {
            parameter: 'rpmFilterHarmonics',
            recommendedChange: '3',
            explanation: 'Set RPM filter to 3 harmonics for comprehensive motor noise removal',
          },
        ],
        expectedImprovement: 'Precise motor noise removal, allowing lower general filtering',
      })
    }

    return recommendations
  },
}
