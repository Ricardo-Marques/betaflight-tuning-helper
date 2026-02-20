import { describe, it, expect } from 'vitest'
import { loadTestBflLog } from '../test-helpers'
import { RuleEngine } from './RuleEngine'
import { QUAD_PROFILES, DEFAULT_PROFILE } from '../profiles/quadProfiles'
import { QuadProfile, ThresholdScaling } from '../types/QuadProfile'
import { Severity } from '../types/Analysis'

/** Mirrors ANALYSIS_LEVEL_MULTIPLIER from AnalysisStore (private). */
const LEVEL_MULTIPLIERS = { basic: 4.0, average: 1.25, expert: 0.5 } as const
type AnalysisLevel = keyof typeof LEVEL_MULTIPLIERS

function scaleProfile(base: QuadProfile, level: AnalysisLevel): QuadProfile {
  const m = LEVEL_MULTIPLIERS[level]
  const scaled: ThresholdScaling = {
    gyroNoise: base.thresholds.gyroNoise * m,
    dtermNoise: base.thresholds.dtermNoise * m,
    propwashAmplitude: base.thresholds.propwashAmplitude * m,
    bouncebackOvershoot: base.thresholds.bouncebackOvershoot * m,
    wobbleAmplitude: base.thresholds.wobbleAmplitude * m,
    motorSaturation: base.thresholds.motorSaturation * m,
    trackingError: base.thresholds.trackingError * m,
    highThrottleOscillation: base.thresholds.highThrottleOscillation * m,
  }
  return { ...base, thresholds: scaled }
}

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 }

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

describe('RuleEngine — analysis level monotonicity', () => {
  // Levels ordered from most lenient to most strict
  const LEVELS: AnalysisLevel[] = ['basic', 'average', 'expert']

  function runAtLevel(level: AnalysisLevel): ReturnType<RuleEngine['analyzeLog']> {
    const { frames, metadata } = loadTestBflLog()
    const engine = new RuleEngine()
    return engine.analyzeLog(frames, metadata, scaleProfile(DEFAULT_PROFILE, level))
  }

  it('stricter levels detect a superset of lenient-level issue types', () => {
    const results = Object.fromEntries(
      LEVELS.map(level => [level, runAtLevel(level)])
    ) as Record<AnalysisLevel, ReturnType<RuleEngine['analyzeLog']>>

    // Collect unique type+axis keys at each level
    const issueKeys = (level: AnalysisLevel): Set<string> =>
      new Set(results[level].issues.map(i => `${i.type}:${i.axis}`))

    const basicKeys = issueKeys('basic')
    const averageKeys = issueKeys('average')
    const expertKeys = issueKeys('expert')

    // basic ⊆ average ⊆ expert
    for (const key of basicKeys) {
      expect(averageKeys.has(key), `basic detects "${key}" but average does not`).toBe(true)
    }
    for (const key of averageKeys) {
      expect(expertKeys.has(key), `average detects "${key}" but expert does not`).toBe(true)
    }
  })

  it('stricter levels have equal or higher severity for shared issues', () => {
    const results = Object.fromEntries(
      LEVELS.map(level => [level, runAtLevel(level)])
    ) as Record<AnalysisLevel, ReturnType<RuleEngine['analyzeLog']>>

    // Build a map of type+axis → max severity at each level
    function maxSeverityByKey(level: AnalysisLevel): Map<string, number> {
      const map = new Map<string, number>()
      for (const issue of results[level].issues) {
        const key = `${issue.type}:${issue.axis}`
        const rank = SEVERITY_RANK[issue.severity]
        map.set(key, Math.max(map.get(key) ?? 0, rank))
      }
      return map
    }

    const basicSev = maxSeverityByKey('basic')
    const averageSev = maxSeverityByKey('average')
    const expertSev = maxSeverityByKey('expert')

    // For issues present in both adjacent levels, the stricter level's severity >= lenient
    for (const [key, basicRank] of basicSev) {
      const avgRank = averageSev.get(key)
      if (avgRank !== undefined) {
        expect(avgRank, `average severity for "${key}" (${avgRank}) < basic (${basicRank})`).toBeGreaterThanOrEqual(basicRank)
      }
    }
    for (const [key, avgRank] of averageSev) {
      const expRank = expertSev.get(key)
      if (expRank !== undefined) {
        expect(expRank, `expert severity for "${key}" (${expRank}) < average (${avgRank})`).toBeGreaterThanOrEqual(avgRank)
      }
    }
  })
})
