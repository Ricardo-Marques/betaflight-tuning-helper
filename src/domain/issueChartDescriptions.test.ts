import { describe, it, expect } from 'vitest'
import { ISSUE_CHART_DESCRIPTIONS } from './issueChartDescriptions'
import type { IssueType } from './types/Analysis'

/**
 * All issue types defined in the IssueType union.
 * Keep this list in sync with src/domain/types/Analysis.ts.
 */
const ALL_ISSUE_TYPES: IssueType[] = [
  'bounceback',
  'propwash',
  'midThrottleWobble',
  'highFrequencyNoise',
  'lowFrequencyOscillation',
  'motorSaturation',
  'gyroNoise',
  'dtermNoise',
  'highThrottleOscillation',
  'underdamped',
  'overdamped',
  'overFiltering',
  'cgOffset',
  'motorImbalance',
  'bearingNoise',
  'frameResonance',
  'electricalNoise',
  'escDesync',
  'voltageSag',
]

describe('ISSUE_CHART_DESCRIPTIONS', () => {
  it('has a description for every IssueType', () => {
    for (const type of ALL_ISSUE_TYPES) {
      expect(ISSUE_CHART_DESCRIPTIONS[type], `missing description for "${type}"`).toBeDefined()
    }
  })

  it('every description is a non-empty string', () => {
    for (const type of ALL_ISSUE_TYPES) {
      const desc = ISSUE_CHART_DESCRIPTIONS[type]
      expect(typeof desc).toBe('string')
      expect(desc.length, `empty description for "${type}"`).toBeGreaterThan(20)
    }
  })

  it('no extra keys exist beyond known IssueType values', () => {
    const descKeys = Object.keys(ISSUE_CHART_DESCRIPTIONS)
    for (const key of descKeys) {
      expect(ALL_ISSUE_TYPES).toContain(key)
    }
  })

  it('descriptions reference specific traces or chart elements', () => {
    const traceKeywords = ['gyro', 'setpoint', 'motor', 'd-term', 'D-term', 'trace', 'output']
    for (const type of ALL_ISSUE_TYPES) {
      const desc = ISSUE_CHART_DESCRIPTIONS[type].toLowerCase()
      const refersToTrace = traceKeywords.some(kw => desc.includes(kw.toLowerCase()))
      expect(refersToTrace, `"${type}" description doesn't reference any chart trace`).toBe(true)
    }
  })
})
