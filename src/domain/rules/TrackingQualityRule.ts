import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { calculateRMS, calculateError, calculateStdDev } from '../utils/FrequencyAnalysis'
import { extractAxisData } from '../utils/SignalAnalysis'

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
  applicableAxes: ['roll', 'pitch'],

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

    // Only log the first few and any with high error
    const shouldLog = window.frameIndices[0] < 2000 || window.metadata.rmsSetpoint > 50

    if (shouldLog) {
      console.log(`${TrackingQualityRule.id} analyzing window:`, {
        axis: window.axis,
        windowStart: window.frameIndices[0],
        maxSetpoint: window.metadata.maxSetpoint.toFixed(1),
        rmsSetpoint: window.metadata.rmsSetpoint.toFixed(1),
        hasStickInput: window.metadata.hasStickInput,
        avgThrottle: window.metadata.avgThrottle.toFixed(0),
        frameCount: windowFrames.length,
      })
    }

    const gyro = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const setpoint = extractAxisData(windowFrames, 'setpoint', window.axis)

    // Calculate tracking quality metrics
    const error = calculateError(setpoint, gyro)
    const rmsError = calculateRMS(error)
    const rmsSetpoint = window.metadata.rmsSetpoint
    const gyroRMS = calculateRMS(gyro)

    // Avoid division by zero
    if (rmsSetpoint < 10) {
      console.debug(`${TrackingQualityRule.id}: Setpoint too small, skipping`)
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

    // Log all windows with meaningful setpoint to find worst case
    if (rmsSetpoint > 30) {
      console.log(`${TrackingQualityRule.id} metrics (window ${window.frameIndices[0]}):`, {
        axis: window.axis,
        normalizedError: normalizedError.toFixed(2) + '%',
        amplitudeRatio: amplitudeRatio.toFixed(2) + '%',
        rmsError: rmsError.toFixed(2),
        rmsSetpoint: rmsSetpoint.toFixed(2),
        wouldDetect: normalizedError > 15 ? '🔴 YES' : '✅ NO (good tracking)',
      })
    }

    // Only skip if error is trivially small (< 5 deg/s RMS)
    // Don't rely solely on SNR since normalized error % is more reliable
    if (rmsError < 5) {
      return []
    }

    // Determine severity based on normalized error (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (normalizedError > 60 * scale) {
      severity = 'high' // Quad barely responding
    } else if (normalizedError > 40 * scale) {
      severity = 'medium' // Significantly delayed
    } else if (normalizedError > 25 * scale) {
      severity = 'low' // Noticeable sluggishness
    } else if (normalizedError > 12 * scale) {
      severity = 'low' // Visible lag/slop
    } else {
      // Acceptable tracking quality
      console.debug(`${TrackingQualityRule.id}: No issue detected (error < ${(12 * scale).toFixed(0)}%)`)
      return []
    }

    // Classify issue type based on amplitude ratio
    // amplitudeRatio = gyroRMS / setpointRMS * 100
    //   < 90%  → underdamped: gyro not reaching setpoint (too little P)
    //   > 105% → overdamped: too much D or too little P causing sluggish, ringing response
    //   90-105% → reasonable amplitude but still high error (phase lag / timing)
    let issueType: 'underdamped' | 'overdamped' | 'lowFrequencyOscillation'
    let issueDescription: string

    if (amplitudeRatio < 90 && normalizedError > 25) {
      issueType = 'underdamped'
      issueDescription = `Poor tracking: not enough P gain — gyro only reaching ${amplitudeRatio.toFixed(0)}% of setpoint (${normalizedError.toFixed(0)}% error)`
    } else if (amplitudeRatio > 105) {
      issueType = 'overdamped'
      issueDescription = `Poor tracking: overshooting setpoint — ${amplitudeRatio.toFixed(0)}% amplitude ratio, too much P or not enough D (${normalizedError.toFixed(0)}% error)`
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
        amplitudeRatio,
        rmsError,
        signalToNoise,
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
      if (worstIssue.type === 'underdamped') {
        // Low amplitude ratio + high error = insufficient P gain
        const pIncrease = normalizedError > 50 ? '+0.5' : normalizedError > 35 ? '+0.4' : '+0.3'

        recommendations.push({
          id: uuidv4(),
          issueId: worstIssue.id,
          type: 'increasePID',
          priority: 8,
          confidence: worstIssue.confidence,
          title: `Increase P gain on ${axis}`,
          description: 'Gyro not reaching setpoint - insufficient P gain',
          rationale:
            'Low amplitude ratio indicates the quad is not generating enough corrective force to match commanded rates. Increasing P gain improves responsiveness.',
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
      } else if (worstIssue.type === 'overdamped') {
        // Overdamped: too much D or too little P causing sluggish, ringing response
        recommendations.push({
          id: uuidv4(),
          issueId: worstIssue.id,
          type: 'decreasePID',
          priority: 7,
          confidence: worstIssue.confidence,
          title: `Reduce D gain on ${axis}`,
          description: 'Overdamped response — too much D or too little P',
          rationale:
            'High amplitude ratio with tracking error indicates excessive damping. The quad is overshooting and ringing because D gain is too high relative to P, causing a sluggish, oscillating response. Reducing D allows faster settling.',
          risks: [
            'May need corresponding P increase for responsiveness',
            'Too little D can cause overshoot on stick stops',
            'Reduce in small increments',
          ],
          changes: [
            {
              parameter: 'pidDGain',
              recommendedChange: '-0.3',
              axis: axis as 'roll' | 'pitch' | 'yaw',
              explanation: `Reduce D to fix overdamped response (amplitude ratio: ${amplitudeRatio.toFixed(0)}%)`,
            },
          ],
          expectedImprovement: 'Faster settling and cleaner tracking',
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
