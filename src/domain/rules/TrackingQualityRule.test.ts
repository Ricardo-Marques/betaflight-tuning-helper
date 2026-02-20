import { describe, it, expect } from 'vitest'
import { loadTestBflLog } from '../test-helpers'
import { RuleEngine } from '../engine/RuleEngine'

describe('TrackingQualityRule', () => {
  it('should not report implausible amplitude ratios (>200%) as underdamped', () => {
    const { frames, metadata } = loadTestBflLog()
    const engine = new RuleEngine()
    const result = engine.analyzeLog(frames, metadata)

    for (const issue of result.issues) {
      if (issue.type === 'underdamped') {
        const ratio = issue.metrics.amplitudeRatio ?? 0
        expect(ratio).toBeLessThanOrEqual(200)
        expect(ratio).toBeGreaterThan(105)
      }
    }
  })

  it('should detect tracking issues (phase lag) at ~9.35s', () => {
    const { frames, metadata } = loadTestBflLog()
    const engine = new RuleEngine()
    const result = engine.analyzeLog(frames, metadata)

    const targetTime = 9_350_000
    const margin = 200_000

    const trackingAtTarget = result.issues.filter(issue => {
      const [start, end] = issue.timeRange
      return (
        start <= targetTime + margin &&
        end >= targetTime - margin &&
        issue.type === 'lowFrequencyOscillation'
      )
    })

    expect(trackingAtTarget.length).toBeGreaterThan(0)
  })

})
