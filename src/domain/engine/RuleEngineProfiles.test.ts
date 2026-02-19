import { describe, it, expect } from 'vitest'
import { loadTestBflLog } from '../test-helpers'
import { RuleEngine } from './RuleEngine'
import { QUAD_PROFILES, DEFAULT_PROFILE } from '../profiles/quadProfiles'

describe('RuleEngine — quad profiles', () => {
  it('default profile matches explicit 5-inch profile', () => {
    const { frames, metadata } = loadTestBflLog()
    const engine = new RuleEngine()

    const defaultResult = engine.analyzeLog(frames, metadata)
    const fiveInchResult = engine.analyzeLog(frames, metadata, QUAD_PROFILES.five_inch)

    expect(defaultResult.issues.length).toBe(fiveInchResult.issues.length)

    const defaultTypes = defaultResult.issues.map(i => `${i.type}-${i.axis}`).sort()
    const fiveInchTypes = fiveInchResult.issues.map(i => `${i.type}-${i.axis}`).sort()
    expect(defaultTypes).toEqual(fiveInchTypes)
  })

  it('different profiles produce different results', () => {
    const { frames, metadata } = loadTestBflLog()
    const engine = new RuleEngine()

    const whoopResult = engine.analyzeLog(frames, metadata, QUAD_PROFILES.whoop)
    const fiveInchResult = engine.analyzeLog(frames, metadata, QUAD_PROFILES.five_inch)

    // Whoop profile has much higher thresholds (more lenient), so it should
    // detect fewer or different issues than the 5-inch profile
    const whoopIssueCount = whoopResult.issues.length
    const fiveInchIssueCount = fiveInchResult.issues.length

    // They should differ in at least count or severity distribution
    const whoopSeverities = whoopResult.issues.map(i => i.severity).sort()
    const fiveInchSeverities = fiveInchResult.issues.map(i => i.severity).sort()

    const countsDiffer = whoopIssueCount !== fiveInchIssueCount
    const severitiesDiffer = JSON.stringify(whoopSeverities) !== JSON.stringify(fiveInchSeverities)

    expect(countsDiffer || severitiesDiffer).toBe(true)
  })

  it('DEFAULT_PROFILE is the 5-inch profile', () => {
    expect(DEFAULT_PROFILE.id).toBe('five_inch')
  })
})
