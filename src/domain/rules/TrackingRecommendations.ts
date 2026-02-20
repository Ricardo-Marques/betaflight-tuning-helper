import { DetectedIssue, Recommendation } from '../types/Analysis'
import { LogMetadata } from '../types/LogFrame'
import { generateId } from '../utils/generateId'
import { populateCurrentValues } from '../utils/SettingsLookup'

/**
 * Generates per-axis tracking quality recommendations based on issue type and FF contribution
 */
export function generateAxisRecommendation(
  axis: string,
  worstIssue: DetectedIssue,
  metadata?: LogMetadata,
): Recommendation | undefined {
  // Skip filter raise if multiplier already >= 140
  if (worstIssue.type === 'overFiltering' && metadata) {
    const gyroMult = metadata.filterSettings?.gyroFilterMultiplier
    const dtermMult = metadata.filterSettings?.dtermFilterMultiplier
    if (gyroMult !== undefined && gyroMult >= 140 && dtermMult !== undefined && dtermMult >= 140) {
      return undefined
    }
  }

  const rec = generateAxisRecommendationInner(axis, worstIssue)
  if (!rec || !metadata) return rec
  return { ...rec, changes: populateCurrentValues(rec.changes, metadata) }
}

function generateAxisRecommendationInner(
  axis: string,
  worstIssue: DetectedIssue,
): Recommendation | undefined {
  const normalizedError = worstIssue.metrics.normalizedError || 0
  const amplitudeRatio = worstIssue.metrics.amplitudeRatio || 0
  const typedAxis = axis as 'roll' | 'pitch' | 'yaw'

  if (worstIssue.type === 'overFiltering') {
    return {
      id: generateId(),
      issueId: worstIssue.id,
      type: 'adjustFiltering',
      priority: 8,
      confidence: worstIssue.confidence,
      title: 'Raise filter cutoffs',
      description: 'Filters are too aggressive — causing tracking delay without meaningful noise reduction',
      rationale:
        'The gyro noise floor is already clean, but the tracking error is high due to excessive filter delay. Raising the filter multipliers reduces phase lag without adding significant noise.',
      risks: [
        'May slightly increase motor noise if noise floor was borderline',
        'Monitor motor temperatures after adjustment',
      ],
      changes: [
        {
          parameter: 'gyroFilterMultiplier',
          recommendedChange: '+10',
          explanation: `Raise gyro filter multiplier to reduce ${worstIssue.metrics.phaseLagMs?.toFixed(1) ?? ''}ms phase lag`,
        },
        {
          parameter: 'dtermFilterMultiplier',
          recommendedChange: '+10',
          explanation: 'Raise D-term filter multiplier to reduce filtering delay',
        },
      ],
      expectedImprovement: 'Reduced phase lag, more responsive tracking with maintained noise levels',
    }
  }

  if (worstIssue.type === 'overdamped') {
    const pIncrease = normalizedError > 50 ? '+0.5' : normalizedError > 35 ? '+0.4' : '+0.3'
    return {
      id: generateId(),
      issueId: worstIssue.id,
      type: 'increasePID',
      priority: 8,
      confidence: worstIssue.confidence,
      title: `Increase P gain on ${axis}`,
      description: 'Gyro not reaching setpoint - overdamped or insufficient P',
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
          axis: typedAxis,
          explanation: `Increase P to improve tracking authority (current error: ${normalizedError.toFixed(1)}%)`,
        },
      ],
      expectedImprovement: 'Gyro will follow setpoint more closely during maneuvers',
    }
  }

  if (worstIssue.type === 'underdamped') {
    return generateUnderdampedRec(typedAxis, worstIssue, normalizedError, amplitudeRatio)
  }

  // Generic tracking issue — recommendation depends on FF contribution
  return generateGenericTrackingRec(typedAxis, worstIssue, normalizedError)
}

function generateUnderdampedRec(
  axis: 'roll' | 'pitch' | 'yaw',
  issue: DetectedIssue,
  normalizedError: number,
  amplitudeRatio: number,
): Recommendation {
  const ffContrib = issue.metrics.feedforwardContribution

  if (ffContrib !== undefined && ffContrib > 0.30 && amplitudeRatio > 105) {
    // FF-driven overshoot — reduce FF instead of adding D (avoids D-term noise)
    return {
      id: generateId(),
      issueId: issue.id,
      type: 'adjustFeedforward',
      priority: 7,
      confidence: issue.confidence,
      title: `Reduce Feedforward on ${axis}`,
      description: 'Feedforward is driving overshoot — reduce FF instead of increasing D',
      rationale:
        `Feedforward contributes ${(ffContrib * 100).toFixed(0)}% of total PID+FF authority. The overshoot (${amplitudeRatio.toFixed(0)}% amplitude ratio) is FF-driven, so reducing feedforward is more effective than adding D-term noise.`,
      risks: [
        'May slightly increase tracking lag during active flying',
        'May feel less responsive on initial stick inputs',
      ],
      changes: [
        {
          parameter: 'pidFeedforward',
          recommendedChange: '-8%',
          axis,
          explanation: `Reduce feedforward to prevent FF-driven overshoot (${(ffContrib * 100).toFixed(0)}% FF contribution)`,
        },
      ],
      expectedImprovement: 'Reduced overshoot without adding D-term noise',
    }
  }

  // P-driven or no FF data — standard underdamped recommendation
  const dIncrease = normalizedError > 50 ? '+0.3' : normalizedError > 35 ? '+0.2' : '+0.15'
  return {
    id: generateId(),
    issueId: issue.id,
    type: 'increasePID',
    priority: 7,
    confidence: issue.confidence,
    title: `Increase D gain on ${axis}`,
    description: 'Underdamped response - overshooting setpoint',
    rationale:
      'High amplitude ratio with tracking error indicates the quad is overshooting its target and oscillating around it. Increasing D gain provides more damping to resist overshoot. If D is already high, consider reducing P instead.',
    risks: [
      'High D amplifies gyro noise - monitor motor temperatures',
      'May need filter adjustment if D-term noise increases',
      'If D is already high, reduce P instead',
    ],
    changes: [
      {
        parameter: 'pidDGain',
        recommendedChange: dIncrease,
        axis,
        explanation: `Increase D to damp overshoot (amplitude ratio: ${amplitudeRatio.toFixed(0)}%)`,
      },
    ],
    expectedImprovement: 'Reduced overshoot and cleaner tracking',
  }
}

function generateGenericTrackingRec(
  axis: 'roll' | 'pitch' | 'yaw',
  issue: DetectedIssue,
  normalizedError: number,
): Recommendation {
  const ffContrib = issue.metrics.feedforwardContribution

  if (ffContrib !== undefined && ffContrib > 0.30) {
    // FF already strong — recommend P increase instead
    const pIncrease = normalizedError > 35 ? '+0.4' : normalizedError > 25 ? '+0.3' : '+0.2'
    return {
      id: generateId(),
      issueId: issue.id,
      type: 'increasePID',
      priority: 6,
      confidence: issue.confidence * 0.9,
      title: `Increase P gain on ${axis}`,
      description: 'Feedforward is already doing its share — PID needs more authority',
      rationale:
        `Feedforward contributes ${(ffContrib * 100).toFixed(0)}% of total authority, which is already strong. The remaining tracking error (${normalizedError.toFixed(0)}%) is best addressed by increasing P gain for tighter PID correction.`,
      risks: [
        'Too much P can cause rapid oscillations',
        'May need corresponding D increase',
      ],
      changes: [
        {
          parameter: 'pidPGain',
          recommendedChange: pIncrease,
          axis,
          explanation: `Increase P to improve PID tracking authority (FF already at ${(ffContrib * 100).toFixed(0)}%)`,
        },
      ],
      expectedImprovement: 'Tighter tracking from PID correction without FF overshoot risk',
    }
  }

  if (ffContrib !== undefined && ffContrib < 0.10) {
    // FF is the bottleneck — recommend stronger FF increase
    const ffIncrease = normalizedError > 35 ? '+10%' : normalizedError > 25 ? '+8%' : '+6%'
    return {
      id: generateId(),
      issueId: issue.id,
      type: 'adjustFeedforward',
      priority: 7,
      confidence: issue.confidence * 0.95,
      title: `Increase Feedforward on ${axis}`,
      description: 'Feedforward is very low — increasing it will significantly improve tracking',
      rationale:
        `Feedforward only contributes ${(ffContrib * 100).toFixed(0)}% of total authority. Increasing it will add proactive stick-tracking without waiting for error buildup.`,
      risks: [
        'Too much feedforward can cause overshoot on stick inputs',
        'May feel "twitchy" if overdone',
      ],
      changes: [
        {
          parameter: 'pidFeedforward',
          recommendedChange: ffIncrease,
          axis,
          explanation: `Increase feedforward — currently only ${(ffContrib * 100).toFixed(0)}% of authority (error: ${normalizedError.toFixed(1)}%)`,
        },
      ],
      expectedImprovement: 'Significantly reduced tracking lag with proactive stick response',
    }
  }

  // No FF data or moderate contribution — fall back to existing behavior
  const ffIncrease = normalizedError > 35 ? '+8%' : normalizedError > 25 ? '+6%' : '+4%'
  return {
    id: generateId(),
    issueId: issue.id,
    type: 'adjustFeedforward',
    priority: 6,
    confidence: issue.confidence * 0.9,
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
        axis,
        explanation: `Increase feedforward for more proactive tracking (current error: ${normalizedError.toFixed(1)}%)`,
      },
    ],
    expectedImprovement: 'Reduced lag, more locked-in feel during active maneuvers',
  }
}
