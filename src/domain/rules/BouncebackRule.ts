import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame, LogMetadata } from '../types/LogFrame'
import { QuadProfile } from '../types/QuadProfile'
import { detectBounceback, extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'
import { calculateRMS, calculateStdDev } from '../utils/FrequencyAnalysis'
import { generateId } from '../utils/generateId'
import { populateCurrentValues, isFFZero, isDGainZero } from '../utils/SettingsLookup'

/**
 * Detects bounceback after rapid stick movements and recommends D/P adjustments
 */
export const BouncebackRule: TuningRule = {
  id: 'bounceback-detection',
  name: 'Bounceback Detection',
  description: 'Detects overshoot and oscillation after stick release',
  baseConfidence: 0.85,
  issueTypes: ['bounceback'],
  applicableAxes: ['roll', 'pitch'],

  condition: (window: AnalysisWindow, _frames: LogFrame[]): boolean => {
    // Only analyze windows with significant stick input followed by release
    // 50 deg/s is a meaningful deliberate stick movement (200 was unrealistically high)
    return window.metadata.maxSetpoint > 50 && window.metadata.hasStickInput
  },

  detect: (window: AnalysisWindow, frames: LogFrame[], profile?: QuadProfile): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)
    const scale = profile?.thresholds.bouncebackOvershoot ?? 1.0

    const metrics = detectBounceback(windowFrames, window.axis, sampleRate)

    if (!metrics.detected) {
      return []
    }

    // Classify severity based on overshoot and settling time (scaled by profile)
    let severity: 'low' | 'medium' | 'high'
    if (metrics.overshoot > 40 * scale || metrics.settlingTime > 150 * scale) {
      severity = 'high'
    } else if (metrics.overshoot > 25 * scale || metrics.settlingTime > 100 * scale) {
      severity = 'medium'
    } else if (metrics.overshoot > 15 * scale || metrics.settlingTime > 75 * scale) {
      severity = 'low'
    } else {
      return []
    }

    // Calculate confidence based on signal quality
    const gyro = extractAxisData(windowFrames, 'gyroADC', window.axis)
    const signalToNoise = Math.abs(metrics.overshoot) / (calculateStdDev(gyro) + 1)
    const confidence = Math.min(0.95, 0.6 + signalToNoise * 0.1)

    // Compute feedforward RMS if FF data is present
    const hasFeedforward = windowFrames.some(f => f.feedforward !== undefined)
    let feedforwardRMS: number | undefined
    if (hasFeedforward) {
      const ffSignal = extractAxisData(windowFrames, 'feedforward', window.axis)
      feedforwardRMS = calculateRMS(ffSignal)
    }

    issues.push({
      id: generateId(),
      type: 'bounceback',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Bounceback detected: ${metrics.overshoot.toFixed(1)}° overshoot, settling in ${metrics.settlingTime.toFixed(0)}ms`,
      metrics: {
        overshoot: metrics.overshoot,
        settlingTime: metrics.settlingTime,
        amplitude: metrics.overshoot,
        ...(feedforwardRMS !== undefined && { feedforwardRMS }),
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[], _profile?: QuadProfile, metadata?: LogMetadata): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'bounceback') continue

      const overshoot = issue.metrics.overshoot || 0
      const settlingTime = issue.metrics.settlingTime || 0
      const feedforwardRMS = issue.metrics.feedforwardRMS
      const hasFfData = feedforwardRMS !== undefined

      // Skip FF reduction if FF is already zero for this axis
      const ffIsZero = metadata ? isFFZero(metadata, issue.axis) : false
      // Skip D increase if D is already zero (misconfiguration)
      const dIsZero = metadata ? isDGainZero(metadata, issue.axis) : false

      // FF-aware classification: use actual FF data when available
      if (hasFfData && feedforwardRMS > overshoot * 0.3 && !ffIsZero) {
        // FF data available and FF is high (contributing >30% of overshoot magnitude)
        // Primary: lower feedforward transition to reduce FF during stick deceleration
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFeedforward',
          priority: 9,
          confidence: issue.confidence,
          title: `Reduce FF transition on ${issue.axis}`,
          description: 'Feedforward is driving overshoot on stick release — reduce transition to taper FF during deceleration',
          rationale:
            `Feedforward RMS (${feedforwardRMS.toFixed(1)}°/s) is significant relative to the ${overshoot.toFixed(1)}° overshoot. Lowering feedforward_transition reduces FF authority during stick deceleration without hurting active-flight response.`,
          risks: [
            'May slightly reduce responsiveness on fast direction changes',
            'Only affects stick deceleration phase',
          ],
          changes: [
            {
              parameter: 'feedforwardTransition',
              recommendedChange: '25',
              explanation: 'Lower FF transition to reduce overshoot on stick release',
            },
          ],
          expectedImprovement: 'Cleaner stick stops with maintained tracking during active flying',
        })

        // Secondary: reduce FF gain as fallback
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFeedforward',
          priority: 7,
          confidence: issue.confidence * 0.85,
          title: `Reduce Feedforward on ${issue.axis}`,
          description: 'Lower feedforward gain as secondary measure if transition alone is insufficient',
          rationale:
            'If reducing feedforward transition alone doesn\'t resolve the overshoot, reducing the FF gain directly lowers the feedforward contribution across all stick movements.',
          risks: [
            'May slightly increase tracking lag during active flying',
            'May feel less responsive on initial stick inputs',
          ],
          changes: [
            {
              parameter: 'pidFeedforward',
              recommendedChange: '-8%',
              axis: issue.axis,
              explanation: 'Reduce feedforward gain to prevent overshoot on stick release',
            },
          ],
          expectedImprovement: 'Reduced overshoot with moderate tracking trade-off',
        })
      } else if (overshoot > 50 && settlingTime < 100) {
        // Large overshoot with fast settling - P is too high, overshooting target
        // (FF data available but low, or no FF data — P-driven)
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'decreasePID',
          priority: 8,
          confidence: issue.confidence,
          title: `Reduce P on ${issue.axis}`,
          description: 'Large overshoot indicates P gain is too aggressive',
          rationale:
            'High P gain drives the quad past its target too aggressively, causing overshoot on stick release. Reducing P prevents the initial overshoot.',
          risks: [
            'May reduce responsiveness slightly',
            'Could feel less locked-in during fast maneuvers',
          ],
          changes: [
            {
              parameter: 'pidPGain',
              recommendedChange: '-0.3',
              axis: issue.axis,
              explanation: 'Reduce P to prevent overshooting on stick release',
            },
          ],
          expectedImprovement: 'Smoother stick release with less overshoot',
        })
      } else if (!hasFfData && overshoot > 30 && settlingTime < 80 && !ffIsZero) {
        // No FF data: preserve existing heuristic (moderate overshoot + fast settling = likely FF)
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'adjustFeedforward',
          priority: 8,
          confidence: issue.confidence,
          title: `Reduce Feedforward on ${issue.axis}`,
          description: 'Overshoot with fast settling suggests feedforward is too aggressive',
          rationale:
            'Feedforward predicts needed corrections based on stick movement. On stick release, excessive feedforward drives the quad past zero before the PID loop can correct. Reducing feedforward smooths stick stops.',
          risks: [
            'May slightly increase tracking lag during active flying',
            'May feel less responsive on initial stick inputs',
          ],
          changes: [
            {
              parameter: 'pidFeedforward',
              recommendedChange: '-8%',
              axis: issue.axis,
              explanation: 'Reduce feedforward to prevent overshoot on stick release',
            },
          ],
          expectedImprovement: 'Cleaner stick stops without sacrificing much tracking',
        })
      } else if (settlingTime > 150 && !dIsZero) {
        // Slow settling - underdamped, need more D or increase D_min
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'increasePID',
          priority: 7,
          confidence: issue.confidence,
          title: `Increase D_min on ${issue.axis}`,
          description: 'Slow settling indicates insufficient damping at low throttle',
          rationale:
            'D_min provides damping during slow movements and recovery. Increasing it improves settling without adding noise at high throttle.',
          risks: ['May slightly increase motor heat', 'Could amplify gyro noise if too high'],
          changes: [
            {
              parameter: 'pidDMinGain',
              recommendedChange: '+0.2',
              axis: issue.axis,
              explanation: 'Increase D_min to improve damping during recovery phase',
            },
          ],
          expectedImprovement: 'Faster settling with less oscillation after stick release',
        })
      } else if (!dIsZero) {
        // Moderate bounceback - adjust P/D balance
        recommendations.push({
          id: generateId(),
          issueId: issue.id,
          type: 'increasePID',
          priority: 6,
          confidence: issue.confidence * 0.9,
          title: `Fine-tune P/D balance on ${issue.axis}`,
          description: 'Moderate bounceback suggests P/D ratio adjustment needed',
          rationale:
            'The P/D ratio determines response speed vs damping. Slight increase in D improves stability.',
          risks: ['Minor increase in motor heat', 'May need filter adjustment'],
          changes: [
            {
              parameter: 'pidDGain',
              recommendedChange: '+0.1',
              axis: issue.axis,
              explanation: 'Small D increase for better damping',
            },
          ],
          expectedImprovement: 'Reduced overshoot while maintaining response',
        })
      }
    }

    if (metadata) {
      return recommendations.map(r => ({ ...r, changes: populateCurrentValues(r.changes, metadata) }))
    }
    return recommendations
  },
}

