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
  applicableAxes: ['roll', 'pitch', 'yaw'],

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

    // FFT on D-term signal to check high-band energy ratio
    // This is the primary metric — what fraction of D-term energy is high-frequency noise
    const dtermSpectrum = analyzeFrequency(dtermSignal, sampleRate)
    const dtermTotalEnergy = dtermSpectrum.bandEnergy.low + dtermSpectrum.bandEnergy.mid + dtermSpectrum.bandEnergy.high
    const dtermHighRatio = dtermTotalEnergy > 0 ? dtermSpectrum.bandEnergy.high / dtermTotalEnergy : 0

    // Also check gyro high-band ratio for comparison
    const gyroSpectrum = analyzeFrequency(gyroSignal, sampleRate)
    const gyroTotalEnergy = gyroSpectrum.bandEnergy.low + gyroSpectrum.bandEnergy.mid + gyroSpectrum.bandEnergy.high
    const gyroHighRatio = gyroTotalEnergy > 0 ? gyroSpectrum.bandEnergy.high / gyroTotalEnergy : 0

    // D-term is a noise problem if its high-frequency content is dominant (>40%)
    // AND it has more high-freq content than the gyro (D is amplifying noise)
    if (dtermHighRatio <= 0.4 * scale || dtermRMS < 1) {
      return []
    }

    // Classify severity based on D-term high-frequency energy ratio
    // This is independent of D gain setting, unlike the old dToGyroRatio
    let severity: 'low' | 'medium' | 'high'
    if (dtermHighRatio > 0.7 / scale && dtermRMS > 5) {
      severity = 'high'
    } else if (dtermHighRatio > 0.55 / scale || (dtermHighRatio > 0.4 / scale && dtermHighRatio > gyroHighRatio * 1.5)) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    const confidence = Math.min(0.95, 0.65 + dtermHighRatio * 0.3 + (dtermHighRatio > gyroHighRatio ? 0.1 : 0))

    issues.push({
      id: uuidv4(),
      type: 'dtermNoise',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `D-term noise: ${(dtermHighRatio * 100).toFixed(0)}% high-freq energy (gyro: ${(gyroHighRatio * 100).toFixed(0)}%), D-term RMS: ${dtermRMS.toFixed(1)}`,
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
        description: 'D-term is amplifying high-frequency noise — lower the D-term filter cutoff',
        rationale:
          'The D-term differentiates the gyro signal, amplifying high-frequency noise. Lowering the D-term filter multiplier lowers the cutoff frequency, blocking more noise before it reaches the motors.',
        risks: [
          'Adds phase delay to the D-term response',
          'May reduce damping effectiveness at higher frequencies',
        ],
        changes: [
          {
            parameter: 'dtermFilterMultiplier',
            recommendedChange: '-10',
            explanation: 'Lower D-term filter multiplier to block more high-frequency noise',
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
