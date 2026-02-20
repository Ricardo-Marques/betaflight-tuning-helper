import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { analyzeFrequency } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues } from '../utils/SettingsLookup'

/**
 * Compares observed noise spectrum against configured filter cutoffs.
 *
 * Over-filtering: filter cutoff well below where noise actually starts — filters
 * are cutting useful signal and adding latency for no benefit.
 *
 * Under-filtering: significant energy above filter cutoff — noise is getting through.
 */
export const FilterNoiseComparisonRule: TuningRule = {
  id: 'filter-noise-comparison',
  name: 'Filter vs Noise Comparison',
  description: 'Compares observed noise spectrum against configured filter cutoffs',
  baseConfidence: 0.75,
  issueTypes: ['filterMismatch'],
  applicableAxes: ['roll', 'pitch'],

  condition: (window: AnalysisWindow, frames: LogFrame[]): boolean => {
    // Stable hover/cruise without stick input — clean spectral reading
    if (window.metadata.hasStickInput) return false
    if (window.metadata.avgThrottle < 1200 || window.metadata.avgThrottle > 1600) return false
    if (window.frameIndices.length < 64) return false

    // Need filter settings from metadata (accessed via detect)
    // Check that first frame exists as a basic sanity check
    return frames[window.frameIndices[0]] !== undefined
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile, metadata?: LogMetadata): DetectedIssue[] => {
    const filterSettings = metadata?.filterSettings
    if (!filterSettings) return []

    const gyroLpfCutoff = filterSettings.gyroLpf1Cutoff
    const dtermLpfCutoff = filterSettings.dtermLpf1Cutoff
    if (gyroLpfCutoff === undefined && dtermLpfCutoff === undefined) return []

    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    if (sampleRate <= 0) return []

    const scale = profile?.thresholds.filterMismatch ?? 1.0
    const gyroSignal = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const spectrum = analyzeFrequency(gyroSignal, sampleRate)

    if (spectrum.frequencies.length === 0) return []

    // Find noise onset: frequency where cumulative energy exceeds 10% of total
    // (i.e. 90% of energy is above this frequency — this is where noise starts)
    const totalEnergy = spectrum.magnitudes.reduce((s, m) => s + m * m, 0)
    if (totalEnergy === 0) return []

    let cumulativeEnergy = 0
    let noiseOnsetHz = spectrum.frequencies[spectrum.frequencies.length - 1]
    for (let i = 0; i < spectrum.frequencies.length; i++) {
      cumulativeEnergy += spectrum.magnitudes[i] * spectrum.magnitudes[i]
      if (cumulativeEnergy >= totalEnergy * 0.10) {
        noiseOnsetHz = spectrum.frequencies[i]
        break
      }
    }

    // Find noise dropoff: frequency where cumulative energy reaches 90%
    cumulativeEnergy = 0
    let noiseDropoffHz = spectrum.frequencies[spectrum.frequencies.length - 1]
    for (let i = 0; i < spectrum.frequencies.length; i++) {
      cumulativeEnergy += spectrum.magnitudes[i] * spectrum.magnitudes[i]
      if (cumulativeEnergy >= totalEnergy * 0.90) {
        noiseDropoffHz = spectrum.frequencies[i]
        break
      }
    }

    // Compute high-band energy ratio for secondary gating
    const highEnergy = spectrum.bandEnergy.high
    const highRatio = totalEnergy > 0 ? highEnergy / totalEnergy : 0

    const issues: DetectedIssue[] = []

    // Check gyro LPF cutoff
    if (gyroLpfCutoff !== undefined) {
      const mismatch = checkFilterMismatch(
        gyroLpfCutoff, noiseOnsetHz, noiseDropoffHz, highRatio,
        scale, window, 'gyro',
      )
      if (mismatch) issues.push(mismatch)
    }

    // Check D-term LPF cutoff
    if (dtermLpfCutoff !== undefined) {
      // Only flag D-term under-filtering — D-term over-filtering is less critical
      // because D-term filters are supposed to be aggressive
      const mismatch = checkFilterMismatch(
        dtermLpfCutoff, noiseOnsetHz, noiseDropoffHz, highRatio,
        scale, window, 'dterm',
      )
      if (mismatch && mismatch.metrics.filterDirection === 'under') {
        issues.push(mismatch)
      }
    }

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], _profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'filterMismatch') continue

      const direction = issue.metrics.filterDirection
      const currentCutoff = issue.metrics.currentCutoffHz ?? 0
      const suggestedCutoff = issue.metrics.suggestedCutoffHz ?? 0

      if (direction === 'over') {
        // Over-filtering: cutoff is too low, cutting useful signal
        const increase = Math.min(20, Math.round((suggestedCutoff - currentCutoff) / 10) * 5)
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 7,
          confidence: issue.confidence,
          title: `Raise gyro filter — noise starts at ${Math.round(suggestedCutoff)} Hz`,
          description: `Gyro LPF cutoff (${Math.round(currentCutoff)} Hz) is well below where noise actually begins (${Math.round(suggestedCutoff)} Hz) — filters are adding unnecessary latency`,
          rationale:
            'The noise spectrum shows clean signal at frequencies being filtered out. Raising the filter cutoff reduces phase lag without increasing noise.',
          risks: [
            'May slightly increase noise if noise floor changes with throttle',
            'Monitor motor temperatures after adjustment',
          ],
          changes: [
            {
              parameter: 'gyroFilterMultiplier',
              recommendedChange: `+${increase}`,
              explanation: `Raise gyro filter multiplier to reduce latency (noise onset at ${Math.round(suggestedCutoff)} Hz)`,
            },
          ],
          expectedImprovement: 'Reduced filter delay, more responsive tracking',
        })
      } else if (direction === 'under') {
        // Under-filtering: significant noise above cutoff
        const decrease = Math.min(20, Math.round(Math.abs(currentCutoff - suggestedCutoff) / 10) * 5)
        const isGyro = issue.description.includes('Gyro')
        const parameter = isGyro ? 'gyroFilterMultiplier' : 'dtermFilterMultiplier'
        const label = isGyro ? 'gyro' : 'D-term'

        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFiltering',
          priority: 7,
          confidence: issue.confidence,
          title: `Lower ${label} filter — noise above ${Math.round(currentCutoff)} Hz`,
          description: `Significant noise energy above the ${label} LPF cutoff (${Math.round(currentCutoff)} Hz) — filter is not blocking enough`,
          rationale:
            `The noise spectrum shows substantial energy above the configured ${label} LPF cutoff. Lowering the filter multiplier will block more of this noise.`,
          risks: [
            'Adds phase delay which may reduce responsiveness',
            'May feel "mushy" if overdone',
          ],
          changes: [
            {
              parameter,
              recommendedChange: `-${decrease}`,
              explanation: `Lower ${label} filter multiplier to block noise above ${Math.round(currentCutoff)} Hz`,
            },
          ],
          expectedImprovement: 'Quieter motors, reduced noise-driven motor heat',
        })
      }
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}

function checkFilterMismatch(
  filterCutoffHz: number,
  noiseOnsetHz: number,
  noiseDropoffHz: number,
  highRatio: number,
  scale: number,
  window: AnalysisWindow,
  filterName: 'gyro' | 'dterm',
): DetectedIssue | undefined {
  const mismatchThreshold = 50 * scale

  // Over-filtering: cutoff is 50+ Hz below noise onset
  if (noiseOnsetHz - filterCutoffHz > mismatchThreshold) {
    const gap = noiseOnsetHz - filterCutoffHz
    const severity = gap > 100 * scale ? 'high' : gap > 75 * scale ? 'medium' : 'low'
    const confidence = Math.min(0.90, 0.55 + gap * 0.002)
    const label = filterName === 'gyro' ? 'Gyro' : 'D-term'

    return {
      id: generateId(),
      type: 'filterMismatch',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `${label} over-filtering: LPF cutoff ${Math.round(filterCutoffHz)} Hz is ${Math.round(gap)} Hz below noise onset (${Math.round(noiseOnsetHz)} Hz)`,
      metrics: {
        frequency: noiseOnsetHz,
        currentCutoffHz: filterCutoffHz,
        suggestedCutoffHz: noiseOnsetHz,
        filterDirection: 'over',
      },
      confidence,
    }
  }

  // Under-filtering: significant high-freq energy AND noise extends well past cutoff
  if (highRatio > 0.25 && noiseDropoffHz - filterCutoffHz > mismatchThreshold) {
    const gap = noiseDropoffHz - filterCutoffHz
    const severity = gap > 100 * scale ? 'high' : gap > 75 * scale ? 'medium' : 'low'
    const confidence = Math.min(0.90, 0.50 + highRatio * 0.5 + gap * 0.001)
    const label = filterName === 'gyro' ? 'Gyro' : 'D-term'

    return {
      id: generateId(),
      type: 'filterMismatch',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `${label} under-filtering: noise extends to ${Math.round(noiseDropoffHz)} Hz, ${Math.round(gap)} Hz past LPF cutoff (${Math.round(filterCutoffHz)} Hz)`,
      metrics: {
        frequency: noiseDropoffHz,
        currentCutoffHz: filterCutoffHz,
        suggestedCutoffHz: noiseDropoffHz,
        filterDirection: 'under',
      },
      confidence,
    }
  }

  return undefined
}
