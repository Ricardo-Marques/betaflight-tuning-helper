import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { calculateRMS, calculateError, calculateStdDev, estimatePhaseLag } from '../utils/FrequencyAnalysis'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { generateId } from '../utils/generateId'
import { generateAxisRecommendation } from './TrackingRecommendations'
import { populateCurrentValues } from '../utils/SettingsLookup'

/**
 * Detects poor tracking quality during active flight maneuvers
 * This fills the gap left by other rules that only analyze specific scenarios
 */
export const TrackingQualityRule: TuningRule = {
  id: 'tracking-quality-detection',
  name: 'Tracking Quality Analysis',
  description: 'Measures how accurately gyro follows setpoint during active flight',
  baseConfidence: 0.75,
  issueTypes: ['underdamped', 'overdamped', 'lowFrequencyOscillation', 'overFiltering'],
  applicableAxes: ['roll', 'pitch', 'yaw'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Analyze active flight maneuvers - the gap other rules don't cover
    // Use RMS setpoint instead of hasStickInput flag to catch smaller movements
    return (
      window.metadata.rmsSetpoint > 10 && // Any stick movement (lowered from 20 to catch gentle flying)
      window.metadata.maxSetpoint > 30 && // Meaningful movement (lowered from 50)
      window.metadata.avgThrottle >= 1100 && // Normal flight range (lowered from 1200)
      window.metadata.avgThrottle <= 1900 &&
      window.frameIndices.length >= 50 // Sufficient data
    )
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const scale = profile?.thresholds.trackingError ?? 1.0

    const gyro = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const setpoint = extractAxisData(windowFrames, 'setpoint', window.axis)

    // Calculate tracking quality metrics
    const error = calculateError(setpoint, gyro)
    const rmsError = calculateRMS(error)
    const rmsSetpoint = window.metadata.rmsSetpoint
    const gyroRMS = calculateRMS(gyro)

    // Avoid division by zero
    if (rmsSetpoint < 10) {
      return []
    }

    // Primary metric: Normalized RMS error (percentage)
    const normalizedError = (rmsError / rmsSetpoint) * 100

    // Secondary metric: Amplitude ratio (should be ~95-100%)
    const amplitudeRatio = (gyroRMS / rmsSetpoint) * 100

    // Calculate signal-to-noise for confidence scoring
    // SNR = how much larger the error is compared to background gyro activity
    const gyroStdDev = calculateStdDev(gyro)
    const signalToNoise = gyroStdDev > 0 ? rmsError / gyroStdDev : 10

    // Only skip if error is trivially small (< 5 deg/s RMS)
    // Don't rely solely on SNR since normalized error % is more reliable
    if (rmsError < 5) {
      return []
    }

    // Yaw has higher moment of inertia — raise thresholds to avoid false positives
    const yawMultiplier = window.axis === 'yaw' ? 1.5 : 1.0

    // Determine severity based on normalized error (scaled by profile and yaw multiplier)
    // 20% threshold - even well-tuned quads show 10-20% error during fast moves
    // due to inherent PID phase lag (feedforward reduces but doesn't eliminate)
    let severity: 'low' | 'medium' | 'high'
    if (normalizedError > 60 * scale * yawMultiplier) {
      severity = 'high' // Quad barely responding
    } else if (normalizedError > 40 * scale * yawMultiplier) {
      severity = 'medium' // Significantly delayed
    } else if (normalizedError > 20 * scale * yawMultiplier) {
      severity = 'low' // Noticeable sluggishness
    } else {
      // Acceptable tracking quality - within normal PID phase lag range
      return []
    }

    // Detect phase lag via cross-correlation
    const sampleRate = deriveSampleRate(windowFrames)
    const lag = estimatePhaseLag(setpoint, gyro, sampleRate)

    // Compute lag-corrected amplitude ratio by aligning signals before comparing RMS.
    // Raw amplitudeRatio is inflated when gyro lags setpoint because the overlap
    // region contains mismatched data.
    let correctedRatio = amplitudeRatio
    if (lag.lagMs > 2) {
      const lagSamples = Math.round(lag.lagMs / 1000 * sampleRate)
      const alignedSetpoint = setpoint.slice(0, setpoint.length - lagSamples)
      const alignedGyro = gyro.slice(lagSamples)
      if (alignedSetpoint.length > 0) {
        correctedRatio = (calculateRMS(alignedGyro) / calculateRMS(alignedSetpoint)) * 100
      }
    }

    // Classify issue type using phase lag + amplitude ratio
    //   lagMs > 2 → primary problem is timing, not amplitude
    //   amplitudeRatio < 90%  → overdamped (too little P or too much D)
    //   amplitudeRatio > 105% → underdamped (too much P or not enough D)
    //   Otherwise → phase lag / timing issue
    let issueType: 'underdamped' | 'overdamped' | 'lowFrequencyOscillation' | 'overFiltering'
    let issueDescription: string

    // Over-filtering detection: high phase lag with clean gyro signal
    if (lag.lagMs > 3 && gyroRMS < 5) {
      // High lag + low noise floor = aggressive filters causing delay, not a PID problem
      issueType = 'overFiltering'
      issueDescription = `Over-filtering: ${lag.lagMs.toFixed(1)}ms phase lag with clean ${gyroRMS.toFixed(1)}°/s noise floor — filters are too aggressive`
    } else if (lag.lagMs > 2 && correctedRatio >= 80 && correctedRatio <= 120) {
      // Significant phase lag with reasonable amplitude - timing problem, not gain
      issueType = 'lowFrequencyOscillation'
      issueDescription = `Phase lag: gyro delayed by ${lag.lagMs.toFixed(1)}ms (${normalizedError.toFixed(0)}% tracking error)`
    } else if (correctedRatio < 90 && normalizedError > 25) {
      issueType = 'overdamped'
      issueDescription = `Poor tracking: gyro only reaching ${correctedRatio.toFixed(0)}% of setpoint - insufficient P gain or too much D (${normalizedError.toFixed(0)}% error)`
    } else if (correctedRatio > 105 && correctedRatio <= 200) {
      issueType = 'underdamped'
      issueDescription = `Poor tracking: overshooting setpoint at ${correctedRatio.toFixed(0)}% - too much P or insufficient D damping (${normalizedError.toFixed(0)}% error)`
    } else {
      issueType = 'lowFrequencyOscillation'
      issueDescription = `Poor tracking: ${normalizedError.toFixed(0)}% error during active flight`
    }

    // Calculate confidence based on signal quality
    const confidence = Math.min(0.95, 0.6 + signalToNoise * 0.05)

    // Compute feedforward contribution if FF data is present
    const hasFeedforward = windowFrames.some(f => f.feedforward !== undefined)
    let feedforwardRMS: number | undefined
    let feedforwardContribution: number | undefined
    if (hasFeedforward) {
      const ffSignal = extractAxisData(windowFrames, 'feedforward', window.axis)
      const pidSumSignal = extractAxisData(windowFrames, 'pidSum', window.axis)
      feedforwardRMS = calculateRMS(ffSignal)
      const pidSumRMS = calculateRMS(pidSumSignal)
      const total = pidSumRMS + feedforwardRMS
      feedforwardContribution = total > 0 ? feedforwardRMS / total : 0
    }

    issues.push({
      id: generateId(),
      type: issueType,
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: issueDescription,
      metrics: {
        normalizedError,
        amplitudeRatio: correctedRatio,
        rmsError,
        signalToNoise,
        phaseLagMs: lag.lagMs,
        ...(feedforwardRMS !== undefined && { feedforwardRMS }),
        ...(feedforwardContribution !== undefined && { feedforwardContribution }),
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], _profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    // Group issues by axis to detect widespread problems
    const issuesByAxis = new Map<string, DetectedIssue[]>()
    for (const issue of issues) {
      if (
        issue.type !== 'underdamped' &&
        issue.type !== 'overdamped' &&
        issue.type !== 'lowFrequencyOscillation' &&
        issue.type !== 'overFiltering'
      ) {
        continue
      }

      // Only process issues detected by this rule (they have tracking-specific metrics)
      if (issue.metrics.normalizedError === undefined) continue

      const existing = issuesByAxis.get(issue.axis) || []
      existing.push(issue)
      issuesByAxis.set(issue.axis, existing)
    }

    // Generate recommendations for each axis
    for (const [axis, axisIssues] of issuesByAxis) {
      // Find the most severe issue
      const severityOrder = { high: 3, medium: 2, low: 1 }
      const worstIssue = axisIssues.reduce((worst, current) =>
        severityOrder[current.severity] > severityOrder[worst.severity] ? current : worst
      )

      const rec = generateAxisRecommendation(axis, worstIssue, metadata)
      if (rec) recommendations.push(rec)
    }

    // If multiple axes have high errors, suggest master multiplier
    const highErrorAxes = Array.from(issuesByAxis.values()).filter(axisIssues =>
      axisIssues.some(
        issue =>
          issue.severity === 'high' &&
          (issue.metrics.normalizedError || 0) > 35
      )
    )

    if (highErrorAxes.length >= 2) {
      // Find the highest severity issue for the recommendation
      const allHighIssues = highErrorAxes
        .flat()
        .filter(
          issue =>
            issue.severity === 'high'
        )
      const worstGlobalIssue = allHighIssues[0]

      recommendations.push({
        id: generateId(),
        issueId: worstGlobalIssue.id,
        type: 'adjustMasterMultiplier',
        priority: 8,
        confidence: 0.75,
        title: 'Increase Master Multiplier',
        description: 'Widespread tracking issues across multiple axes',
        rationale:
          'When multiple axes show poor tracking, the quad is generally under-tuned. Master multiplier scales all PIDs proportionally for global improvement.',
        risks: [
          'Affects all axes - may over-tune axes that are already good',
          'Increases motor heat and battery consumption',
          'May require filter adjustments to handle increased PID activity',
        ],
        changes: [
          {
            parameter: 'pidMasterMultiplier',
            recommendedChange: '+5%',
            explanation: 'Global PID increase to improve overall tracking performance',
          },
        ],
        expectedImprovement: 'Improved tracking quality across all axes during active flight',
      })
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}
