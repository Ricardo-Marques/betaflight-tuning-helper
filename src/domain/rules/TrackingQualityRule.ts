import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { calculateRMS, calculateError, calculateStdDev, estimatePhaseLag } from '../utils/FrequencyAnalysis'
import { extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'

/**
 * Detects poor tracking quality during active flight maneuvers
 * This fills the gap left by other rules that only analyze specific scenarios
 */
export const TrackingQualityRule: TuningRule = {
  id: 'tracking-quality-detection',
  name: 'Tracking Quality Analysis',
  description: 'Measures how accurately gyro follows setpoint during active flight',
  baseConfidence: 0.75,
  issueTypes: ['underdamped', 'overdamped', 'lowFrequencyOscillation'],
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

    // Determine severity based on normalized error (scaled by profile)
    // 20% threshold — even well-tuned quads show 10-20% error during fast moves
    // due to inherent PID phase lag (feedforward reduces but doesn't eliminate)
    let severity: 'low' | 'medium' | 'high'
    if (normalizedError > 60 * scale) {
      severity = 'high' // Quad barely responding
    } else if (normalizedError > 40 * scale) {
      severity = 'medium' // Significantly delayed
    } else if (normalizedError > 20 * scale) {
      severity = 'low' // Noticeable sluggishness
    } else {
      // Acceptable tracking quality — within normal PID phase lag range
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
    let issueType: 'underdamped' | 'overdamped' | 'lowFrequencyOscillation'
    let issueDescription: string

    if (lag.lagMs > 2 && correctedRatio >= 80 && correctedRatio <= 120) {
      // Significant phase lag with reasonable amplitude — timing problem, not gain
      issueType = 'lowFrequencyOscillation'
      issueDescription = `Phase lag: gyro delayed by ${lag.lagMs.toFixed(1)}ms (${normalizedError.toFixed(0)}% tracking error)`
    } else if (correctedRatio < 90 && normalizedError > 25) {
      issueType = 'overdamped'
      issueDescription = `Poor tracking: gyro only reaching ${correctedRatio.toFixed(0)}% of setpoint — insufficient P gain or too much D (${normalizedError.toFixed(0)}% error)`
    } else if (correctedRatio > 105 && correctedRatio <= 200) {
      issueType = 'underdamped'
      issueDescription = `Poor tracking: overshooting setpoint at ${correctedRatio.toFixed(0)}% — too much P or insufficient D damping (${normalizedError.toFixed(0)}% error)`
    } else {
      issueType = 'lowFrequencyOscillation'
      issueDescription = `Poor tracking: ${normalizedError.toFixed(0)}% error during active flight`
    }

    // Calculate confidence based on signal quality
    const confidence = Math.min(0.95, 0.6 + signalToNoise * 0.05)

    issues.push({
      id: uuidv4(),
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
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    // Group issues by axis to detect widespread problems
    const issuesByAxis = new Map<string, DetectedIssue[]>()
    for (const issue of issues) {
      if (
        issue.type !== 'underdamped' &&
        issue.type !== 'overdamped' &&
        issue.type !== 'lowFrequencyOscillation'
      ) {
        continue
      }

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

      const normalizedError = worstIssue.metrics.normalizedError || 0
      const amplitudeRatio = worstIssue.metrics.amplitudeRatio || 0

      // Recommendation logic based on issue type
      if (worstIssue.type === 'overdamped') {
        // Low amplitude ratio + high error = insufficient P gain or excessive D
        const pIncrease = normalizedError > 50 ? '+0.5' : normalizedError > 35 ? '+0.4' : '+0.3'

        recommendations.push({
          id: uuidv4(),
          issueId: worstIssue.id,
          type: 'increasePID',
          priority: 8,
          confidence: worstIssue.confidence,
          title: `Increase P gain on ${axis}`,
          description: 'Gyro not reaching setpoint — overdamped or insufficient P',
          rationale:
            'Low amplitude ratio indicates the quad is not generating enough corrective force to match commanded rates. The response is sluggish, possibly due to too little P or too much D dampening the response.',
          risks: [
            'Too much P can cause rapid oscillations',
            'May need corresponding D increase',
            'Monitor motor temperatures',
          ],
          changes: [
            {
              parameter: 'pidPGain',
              recommendedChange: pIncrease,
              axis: axis as 'roll' | 'pitch' | 'yaw',
              explanation: `Increase P to improve tracking authority (current error: ${normalizedError.toFixed(1)}%)`,
            },
          ],
          expectedImprovement: 'Gyro will follow setpoint more closely during maneuvers',
        })
      } else if (worstIssue.type === 'underdamped') {
        // Underdamped: overshooting setpoint — too much P or not enough D
        const dIncrease = normalizedError > 50 ? '+0.3' : normalizedError > 35 ? '+0.2' : '+0.15'

        recommendations.push({
          id: uuidv4(),
          issueId: worstIssue.id,
          type: 'increasePID',
          priority: 7,
          confidence: worstIssue.confidence,
          title: `Increase D gain on ${axis}`,
          description: 'Underdamped response — overshooting setpoint',
          rationale:
            'High amplitude ratio with tracking error indicates the quad is overshooting its target and oscillating around it. Increasing D gain provides more damping to resist overshoot. If D is already high, consider reducing P instead.',
          risks: [
            'High D amplifies gyro noise — monitor motor temperatures',
            'May need filter adjustment if D-term noise increases',
            'If D is already high, reduce P instead',
          ],
          changes: [
            {
              parameter: 'pidDGain',
              recommendedChange: dIncrease,
              axis: axis as 'roll' | 'pitch' | 'yaw',
              explanation: `Increase D to damp overshoot (amplitude ratio: ${amplitudeRatio.toFixed(0)}%)`,
            },
          ],
          expectedImprovement: 'Reduced overshoot and cleaner tracking',
        })
      } else {
        // Generic tracking issue - try feedforward first
        const ffIncrease = normalizedError > 35 ? '+10' : normalizedError > 25 ? '+7' : '+5'

        recommendations.push({
          id: uuidv4(),
          issueId: worstIssue.id,
          type: 'adjustFeedforward',
          priority: 6,
          confidence: worstIssue.confidence * 0.9,
          title: `Increase Feedforward on ${axis}`,
          description: 'Moderate tracking error - feedforward can help',
          rationale:
            'Feedforward anticipates needed control inputs, reducing tracking lag without relying solely on error correction.',
          risks: [
            'Too much feedforward can cause overshoot on stick inputs',
            'May feel "twitchy" if overdone',
          ],
          changes: [
            {
              parameter: 'pidFeedforward',
              recommendedChange: ffIncrease,
              axis: axis as 'roll' | 'pitch' | 'yaw',
              explanation: `Increase feedforward for more proactive tracking (current error: ${normalizedError.toFixed(1)}%)`,
            },
          ],
          expectedImprovement: 'Reduced lag, more locked-in feel during active maneuvers',
        })
      }
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
        id: uuidv4(),
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

    return recommendations
  },
}

// Re-export uuidv4 for consistency with other rules
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
