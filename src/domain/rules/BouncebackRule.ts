import { TuningRule } from '../types/TuningRule'
import { AnalysisWindow, DetectedIssue, Recommendation } from '../types/Analysis'
import { LogFrame } from '../types/LogFrame'
import { detectBounceback, extractAxisData, deriveSampleRate } from '../utils/SignalAnalysis'

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

  detect: (window: AnalysisWindow, frames: LogFrame[]): DetectedIssue[] => {
    const issues: DetectedIssue[] = []
    const windowFrames = window.frameIndices.map(i => frames[i])
    const sampleRate = deriveSampleRate(windowFrames)

    // Log why detection might not run
    console.debug(`${BouncebackRule.id} analyzing window:`, {
      axis: window.axis,
      maxSetpoint: window.metadata.maxSetpoint,
      hasStickInput: window.metadata.hasStickInput,
      avgThrottle: window.metadata.avgThrottle,
      frameCount: windowFrames.length,
    })

    const metrics = detectBounceback(windowFrames, window.axis, sampleRate)

    if (!metrics.detected) {
      console.debug(`${BouncebackRule.id}: No issue detected`, metrics)
      return []
    }

    // Classify severity based on overshoot and settling time
    // Well-tuned quads have < 10 deg/s overshoot
    let severity: 'low' | 'medium' | 'high'
    if (metrics.overshoot > 40 || metrics.settlingTime > 150) {
      severity = 'high'
    } else if (metrics.overshoot > 25 || metrics.settlingTime > 100) {
      severity = 'high'
    } else if (metrics.overshoot > 15 || metrics.settlingTime > 75) {
      severity = 'medium'
    } else {
      severity = 'low'
    }

    // Calculate confidence based on signal quality
    const gyro = extractAxisData(windowFrames, 'gyroADC', window.axis)
    extractAxisData(windowFrames, 'setpoint', window.axis)
    const signalToNoise = Math.abs(metrics.overshoot) / (calculateStdDev(gyro) + 1)
    const confidence = Math.min(0.95, 0.6 + signalToNoise * 0.1)

    issues.push({
      id: uuidv4(),
      type: 'bounceback',
      severity,
      axis: window.axis,
      timeRange: [window.startTime, window.endTime],
      description: `Bounceback detected: ${metrics.overshoot.toFixed(1)}° overshoot, settling in ${metrics.settlingTime.toFixed(0)}ms`,
      metrics: {
        overshoot: metrics.overshoot,
        settlingTime: metrics.settlingTime,
        amplitude: metrics.overshoot,
      },
      confidence,
    })

    return issues
  },

  recommend: (issues: DetectedIssue[], _frames: LogFrame[]): Recommendation[] => {
    const recommendations: Recommendation[] = []

    for (const issue of issues) {
      if (issue.type !== 'bounceback') continue

      const overshoot = issue.metrics.overshoot || 0
      const settlingTime = issue.metrics.settlingTime || 0

      // Decision logic based on bounceback characteristics
      if (overshoot > 50 && settlingTime < 100) {
        // Fast but large overshoot - too much D or not enough damping
        recommendations.push({
          id: uuidv4(),
          issueId: issue.id,
          type: 'decreasePID',
          priority: 8,
          confidence: issue.confidence,
          title: `Reduce D on ${issue.axis}`,
          description: 'Large overshoot with fast oscillation indicates excessive D-term',
          rationale:
            'High D-term amplifies small errors too aggressively, causing overshoot. Reducing D allows smoother response.',
          risks: [
            'May increase settling time slightly',
            'Could allow more propwash if reduced too much',
          ],
          changes: [
            {
              parameter: 'pidDGain',
              recommendedChange: '-0.3',
              axis: issue.axis,
              explanation: 'Reduce D slider by 0.3 steps to decrease damping aggression',
            },
          ],
          expectedImprovement: 'Smoother stick release with less overshoot',
        })
      } else if (settlingTime > 150) {
        // Slow settling - underdamped, need more D or increase D_min
        recommendations.push({
          id: uuidv4(),
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
      } else {
        // Moderate bounceback - adjust P/D balance
        recommendations.push({
          id: uuidv4(),
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

    return recommendations
  },
}

function calculateStdDev(signal: number[]): number {
  const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length
  const variance =
    signal.reduce((sum, val) => sum + (val - mean) ** 2, 0) / signal.length
  return Math.sqrt(variance)
}

// Re-export for use in other modules
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
