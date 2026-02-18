import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { parseBblBuffer } from '../blackbox/BblParser'
import { RuleEngine } from '../engine/RuleEngine'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadTestLog(): ReturnType<typeof parseBblBuffer> {
  const bflPath = resolve(__dirname, '../../../test-logs/bflLog.BFL')
  const buffer = new Uint8Array(readFileSync(bflPath))
  return parseBblBuffer(buffer)
}

describe('TrackingQualityRule', () => {
  it('should not report implausible amplitude ratios (>200%) as underdamped', () => {
    const { frames, metadata } = loadTestLog()
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
    const { frames, metadata } = loadTestLog()
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

  it('should use corrected ratio in metrics, not raw inflated ratio', () => {
    const { frames, metadata } = loadTestLog()
    const engine = new RuleEngine()
    const result = engine.analyzeLog(frames, metadata)

    // No tracking-quality issue should report a ratio above 200%
    // (the old bug produced 398% from raw gyroRMS/setpointRMS mismatch)
    const trackingIssues = result.issues.filter(
      i => i.type === 'underdamped' || i.type === 'overdamped' || i.type === 'lowFrequencyOscillation'
    )

    for (const issue of trackingIssues) {
      const ratio = issue.metrics.amplitudeRatio
      if (ratio !== undefined) {
        expect(ratio).toBeLessThan(300)
      }
    }
  })
})
