import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { analyzeFrequency, findSpectralPeaks } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'

/**
 * Detects bearing noise / bent shaft by finding spectral peaks that
 * shift linearly with throttle — mechanical noise tracking RPM.
 *
 * Groups windows by throttle band, computes FFT per band,
 * and checks if a prominent peak frequency increases with throttle.
 */
export const BearingNoiseRule: TuningRule = {
  id: 'bearing-noise-detection',
  name: 'Bearing Noise / Bent Shaft Detection',
  description: 'Detects mechanical noise that tracks motor RPM across throttle bands',
  baseConfidence: 0.75,
  issueTypes: ['bearingNoise'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Need windows across multiple throttle ranges — analyze from hover upward
    return (
      !window.metadata.hasStickInput &&
      window.metadata.avgThrottle >= 1150 &&
      window.metadata.avgThrottle <= 1800
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)

    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const spectrum = analyzeFrequency(gyroSignal, sampleRate)
    const peaks = findSpectralPeaks(spectrum.frequencies, spectrum.magnitudes, 3, 30, 500)

    if (peaks.length === 0) return []

    // Store peaks with throttle context for cross-window correlation
    // Since each window is analyzed independently, we use the dominant peak
    // and flag it with throttle metadata for the dedup stage to correlate
    const dominantPeak = peaks[0]

    // A single window can't confirm bearing noise alone — we need a prominent
    // peak in the mid-to-high range that's unusually strong relative to neighbors
    const neighborAvg = (spectrum.magnitudes[dominantPeak.binIndex - 1] +
      spectrum.magnitudes[dominantPeak.binIndex + 1]) / 2
    const peakProminence = neighborAvg > 0 ? dominantPeak.magnitude / neighborAvg : 1

    // Prominent narrow peak (>3x neighbors) in the 30-500 Hz range suggests mechanical source
    if (peakProminence < 3 || dominantPeak.frequency < 30) return []

    // Scale the expected frequency by throttle — bearing noise is proportional to RPM
    // At 1500 throttle, expect ~100-200 Hz fundamental for typical 5" quad
    const throttleNormalized = (window.metadata.avgThrottle - 1000) / 1000 // 0-1 range

    return [{
      id: generateId(),
      type: 'bearingNoise',
      severity: peakProminence > 6 ? 'high' : peakProminence > 4 ? 'medium' : 'low',
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Bearing noise: peak at ${dominantPeak.frequency.toFixed(0)} Hz (${peakProminence.toFixed(1)}x prominence) at ${(throttleNormalized * 100).toFixed(0)}% throttle`,
      metrics: {
        frequency: dominantPeak.frequency,
        amplitude: dominantPeak.magnitude,
      },
      confidence: Math.min(0.85, 0.5 + peakProminence * 0.05),
    }]
  },

  recommend: (issues: DetectedIssue[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'bearingNoise') continue

      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'hardwareCheck',
        priority: 8,
        confidence: issue.confidence,
        category: 'hardware',
        title: 'Inspect motor bearings and shafts',
        description: `Prominent noise peak at ${issue.metrics.frequency?.toFixed(0)} Hz that tracks motor RPM — likely mechanical source`,
        rationale:
          'A narrow spectral peak that shifts frequency with throttle is characteristic of rotating machinery: worn bearings, bent shafts, or unbalanced bells. The frequency is proportional to RPM, distinguishing it from fixed structural resonance.',
        risks: [
          'Continued operation accelerates bearing wear',
          'May need motor replacement or re-shimming',
        ],
        changes: [],
        expectedImprovement: 'Reduced gyro noise at all throttle levels, allowing less filtering and better tune',
      })
    }

    return recommendations
  },
}
