import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { analyzeFrequency, findSpectralPeaks } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues } from '../utils/SettingsLookup'

/**
 * Detects frame resonance by finding spectral peaks that stay at the SAME
 * frequency regardless of throttle — structural resonance, not motor RPM.
 *
 * Complements BearingNoiseRule: bearing noise shifts with RPM,
 * frame resonance stays fixed.
 */
export const FrameResonanceRule: TuningRule = {
  id: 'frame-resonance-detection',
  name: 'Frame Resonance Detection',
  description: 'Detects fixed-frequency structural resonance in the frame',
  baseConfidence: 0.75,
  issueTypes: ['frameResonance'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    return (
      !window.metadata.hasStickInput &&
      window.metadata.avgThrottle >= 1200 &&
      window.metadata.avgThrottle <= 1800
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)

    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const spectrum = analyzeFrequency(gyroSignal, sampleRate)
    const peaks = findSpectralPeaks(spectrum.frequencies, spectrum.magnitudes, 3, 20, 300)

    if (peaks.length === 0) return []

    const dominantPeak = peaks[0]

    // Check prominence — structural resonance shows as a sharp peak
    const neighborAvg = (spectrum.magnitudes[dominantPeak.binIndex - 1] +
      spectrum.magnitudes[dominantPeak.binIndex + 1]) / 2
    const peakProminence = neighborAvg > 0 ? dominantPeak.magnitude / neighborAvg : 1

    // Frame resonance is typically 80-250 Hz range and very prominent
    if (peakProminence < 3 || dominantPeak.frequency < 20 || dominantPeak.frequency > 300) {
      return []
    }

    // Compare energy at the peak frequency to total mid+high energy
    // Resonance concentrates energy at a single frequency
    const peakEnergy = dominantPeak.magnitude * dominantPeak.magnitude
    const totalMidHigh = spectrum.bandEnergy.mid + spectrum.bandEnergy.high
    const energyConcentration = totalMidHigh > 0 ? peakEnergy / totalMidHigh : 0

    if (energyConcentration < 0.15) return [] // Less than 15% — not a resonance problem

    return [{
      id: generateId(),
      type: 'frameResonance',
      severity: energyConcentration > 0.4 ? 'high' : energyConcentration > 0.25 ? 'medium' : 'low',
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Frame resonance: ${dominantPeak.frequency.toFixed(0)} Hz with ${(energyConcentration * 100).toFixed(0)}% energy concentration`,
      metrics: {
        frequency: dominantPeak.frequency,
        amplitude: dominantPeak.magnitude,
      },
      confidence: Math.min(0.90, 0.55 + energyConcentration + peakProminence * 0.03),
    }]
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], _profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'frameResonance') continue

      const freq = issue.metrics.frequency ?? 0

      // Software mitigation: tune dynamic notch to target the resonance
      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'adjustFiltering',
        priority: 7,
        confidence: issue.confidence * 0.85,
        title: `Target dynamic notch at ${freq.toFixed(0)} Hz`,
        description: `Frame resonance at ${freq.toFixed(0)} Hz — adjust dynamic notch range to cover it`,
        rationale:
          'The dynamic notch filter can track and remove resonant frequencies. Ensuring the notch range covers the detected resonance frequency will suppress it without the delay penalty of wider low-pass filters.',
        risks: [
          'Notch filters have a narrow bandwidth — may need Q adjustment',
          'Does not fix the underlying structural issue',
        ],
        changes: [
          {
            parameter: 'dynamicNotchMinHz',
            recommendedChange: String(Math.max(50, Math.floor(freq - 30))),
            explanation: `Set dynamic notch minimum to cover the ${freq.toFixed(0)} Hz resonance`,
          },
        ],
        expectedImprovement: 'Reduced resonant vibration with minimal latency impact',
      })

      // Hardware recommendation
      recommendations.push({
        id: generateId(),
        issueId: issue.id,
        type: 'hardwareCheck',
        priority: 6,
        confidence: issue.confidence * 0.7,
        category: 'hardware',
        title: 'Check frame and mounting hardware',
        description: `Structural resonance at ${freq.toFixed(0)} Hz — may indicate loose hardware or frame flex`,
        rationale:
          'A fixed-frequency resonance that does not shift with throttle is characteristic of the frame structure vibrating at its natural frequency. Common causes: loose standoffs, cracked arms, soft TPU mounts transferring vibration.',
        risks: [
          'Requires physical inspection',
          'Frame design may inherently resonate at this frequency',
        ],
        changes: [],
        expectedImprovement: 'Eliminating the resonance at source allows less filtering and a cleaner tune',
      })
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}
