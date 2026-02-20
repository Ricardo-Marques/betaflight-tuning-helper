import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { calculateRMS, analyzeFrequency } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues } from '../utils/SettingsLookup'

/**
 * Detects noisy feedforward during steady sticks (no active input).
 * Well-tuned FF should be near zero during calm flight; elevated RMS indicates
 * RC link noise leaking through the feedforward path.
 */
export const FeedforwardNoiseRule: TuningRule = {
  id: 'feedforward-noise-detection',
  name: 'Feedforward Noise Detection',
  description: 'Detects noisy feedforward signal during steady sticks',
  baseConfidence: 0.85,
  issueTypes: ['feedforwardNoise'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, frames: LogFrame[]): boolean => {
    // Calm flight with no stick input and FF data present
    if (window.metadata.hasStickInput) return false
    if (window.metadata.avgThrottle < 1100) return false

    // Check that at least some frames have feedforward data
    return window.frameIndices.some(i => frames[i]?.feedforward !== undefined)
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.dtermNoise ?? 1.0 // Reuse noise threshold scaling

    const ffSignal = extractAxisData(windowFrames, 'feedforward', window.axis)
    const ffRMS = calculateRMS(ffSignal)

    // During steady sticks, well-tuned FF should be <2 deg/s RMS
    // Detection threshold: 5 deg/s
    if (ffRMS < 5 * scale) {
      return []
    }

    // FFT for frequency analysis to confirm it's noise (not a delayed stick response)
    const spectrum = analyzeFrequency(ffSignal, sampleRate)
    const totalEnergy = spectrum.bandEnergy.low + spectrum.bandEnergy.mid + spectrum.bandEnergy.high
    const highBandRatio = totalEnergy > 0 ? spectrum.bandEnergy.high / totalEnergy : 0

    // Classify severity
    let severity: 'low' | 'medium' | 'high'
    if (ffRMS > 20 * scale) {
      severity = 'high'
    } else if (ffRMS > 12 * scale) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    const confidence = Math.min(0.95, 0.6 + ffRMS * 0.015 + highBandRatio * 0.15)

    issues.push({
      id: generateId(),
      type: 'feedforwardNoise',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `FF noise: ${ffRMS.toFixed(1)}°/s RMS during steady sticks`,
      metrics: {
        feedforwardRMS: ffRMS,
        noiseFloor: ffRMS,
        dominantBand: highBandRatio > 0.5 ? 'high' : ffRMS > 10 ? 'mid' : 'low',
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], _profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'feedforwardNoise') continue

      const ffRMS = issue.metrics.feedforwardRMS || 0
      const isSevere = issue.severity === 'high'

      // Primary: increase jitter factor — suppresses RC noise from FF
      const jitterTarget = isSevere ? '12' : '10'
      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'adjustFeedforward',
        priority: 8,
        confidence: issue.confidence,
        title: `Increase FF jitter factor on ${issue.axis}`,
        description: 'RC link noise is leaking through feedforward — increase jitter suppression',
        rationale:
          `Feedforward shows ${ffRMS.toFixed(1)}°/s RMS during steady sticks (should be <2). The jitter factor filters out small RC input changes that are noise rather than intentional stick movement.`,
        risks: [
          'Very high jitter factor may slightly delay FF response to fast stick inputs',
          'May mask genuine small stick corrections',
        ],
        changes: [
          {
            parameter: 'feedforwardJitterFactor',
            recommendedChange: jitterTarget,
            explanation: `Set jitter factor to ${jitterTarget} to suppress RC noise in feedforward`,
          },
        ],
        expectedImprovement: 'Cleaner feedforward signal, quieter motors during calm flight',
      })

      // Secondary: increase smooth factor (medium+ severity only)
      if (issue.severity !== 'low') {
        const smoothTarget = isSevere ? '45' : '35'
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFeedforward',
          priority: 6,
          confidence: issue.confidence * 0.85,
          title: `Increase FF smooth factor on ${issue.axis}`,
          description: 'Additional feedforward smoothing to reduce noise',
          rationale:
            'The smooth factor applies a lowpass-style filter to the feedforward signal, reducing high-frequency noise that jitter factor alone may not catch.',
          risks: [
            'Adds slight delay to feedforward response',
            'May reduce the "snappy" feel on quick stick inputs',
          ],
          changes: [
            {
              parameter: 'feedforwardSmoothFactor',
              recommendedChange: smoothTarget,
              explanation: `Set smooth factor to ${smoothTarget} for additional FF noise reduction`,
            },
          ],
          expectedImprovement: 'Further reduced FF noise with minimal tracking impact',
        })
      }
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}
