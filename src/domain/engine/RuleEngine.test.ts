import { describe, it, expect } from 'vitest'
import { loadTestBflLog } from '../test-helpers'
import { RuleEngine } from './RuleEngine'
import type { IssueType, Severity, Axis, AnalysisResult } from '../types/Analysis'

const VALID_ISSUE_TYPES: IssueType[] = [
  'bounceback', 'propwash', 'midThrottleWobble', 'highFrequencyNoise',
  'lowFrequencyOscillation', 'motorSaturation', 'gyroNoise', 'dtermNoise',
  'highThrottleOscillation', 'underdamped', 'overdamped', 'overFiltering',
  'cgOffset', 'motorImbalance', 'bearingNoise', 'frameResonance',
  'electricalNoise', 'escDesync', 'voltageSag',
]

const VALID_SEVERITIES: Severity[] = ['low', 'medium', 'high']
const VALID_AXES: Axis[] = ['roll', 'pitch', 'yaw']

function runAnalysis(): AnalysisResult {
  const { frames, metadata } = loadTestBflLog()
  const engine = new RuleEngine()
  return engine.analyzeLog(frames, metadata)
}

describe('RuleEngine — full analysis pipeline', () => {
  describe('result structure', () => {
    it('returns issues, recommendations, summary, and segments', () => {
      const result = runAnalysis()

      expect(result).toHaveProperty('issues')
      expect(result).toHaveProperty('recommendations')
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('segments')
      expect(Array.isArray(result.issues)).toBe(true)
      expect(Array.isArray(result.recommendations)).toBe(true)
      expect(Array.isArray(result.segments)).toBe(true)
    })
  })

  describe('issues', () => {
    it('detects issues in real flight data', () => {
      const result = runAnalysis()
      expect(result.issues.length).toBeGreaterThan(0)
    })

    it('issues have valid types', () => {
      const result = runAnalysis()
      for (const issue of result.issues) {
        expect(VALID_ISSUE_TYPES).toContain(issue.type)
      }
    })

    it('issues have valid axes', () => {
      const result = runAnalysis()
      for (const issue of result.issues) {
        expect(VALID_AXES).toContain(issue.axis)
      }
    })

    it('issues have valid time ranges', () => {
      const result = runAnalysis()
      for (const issue of result.issues) {
        const [start, end] = issue.timeRange
        expect(start).toBeLessThanOrEqual(end)
        expect(start).toBeGreaterThanOrEqual(0)
      }
    })

    it('issues have confidence between 0 and 1', () => {
      const result = runAnalysis()
      for (const issue of result.issues) {
        expect(issue.confidence).toBeGreaterThanOrEqual(0)
        expect(issue.confidence).toBeLessThanOrEqual(1)
      }
    })

    it('issues have valid severities', () => {
      const result = runAnalysis()
      for (const issue of result.issues) {
        expect(VALID_SEVERITIES).toContain(issue.severity)
      }
    })

    it('deduplicates so no two issues share the same type+axis', () => {
      const result = runAnalysis()
      const seen = new Set<string>()

      for (const issue of result.issues) {
        const key = `${issue.type}-${issue.axis}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    })
  })

  describe('recommendations', () => {
    it('generates recommendations from real flight data', () => {
      const result = runAnalysis()
      expect(result.recommendations.length).toBeGreaterThan(0)
    })

    it('each recommendation references a valid issue ID', () => {
      const result = runAnalysis()
      const issueIds = new Set(result.issues.map(i => i.id))

      for (const rec of result.recommendations) {
        expect(issueIds.has(rec.issueId)).toBe(true)
      }
    })

    it('recommendations are sorted by priority descending', () => {
      const result = runAnalysis()
      for (let i = 1; i < result.recommendations.length; i++) {
        expect(result.recommendations[i - 1].priority)
          .toBeGreaterThanOrEqual(result.recommendations[i].priority)
      }
    })

    it('no two recommendations contain the same parameter+axis in their changes', () => {
      const result = runAnalysis()
      const seen = new Set<string>()

      for (const rec of result.recommendations) {
        for (const change of rec.changes) {
          const key = `${change.parameter}:${change.axis ?? '_global'}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
        }
      }
    })
  })

  describe('summary', () => {
    it('severity counts match actual issues', () => {
      const result = runAnalysis()
      const { summary, issues } = result

      const highCount = issues.filter(i => i.severity === 'high').length
      const mediumCount = issues.filter(i => i.severity === 'medium').length
      const lowCount = issues.filter(i => i.severity === 'low').length

      expect(summary.highIssueCount).toBe(highCount)
      expect(summary.mediumIssueCount).toBe(mediumCount)
      expect(summary.lowIssueCount).toBe(lowCount)
    })

    it('overallHealth is a valid value', () => {
      const result = runAnalysis()
      expect(['excellent', 'good', 'needsWork', 'poor'])
        .toContain(result.summary.overallHealth)
    })

    it('overallHealth is consistent with severity counts', () => {
      const result = runAnalysis()
      const { summary } = result

      if (summary.highIssueCount > 3) {
        expect(summary.overallHealth).toBe('poor')
      } else if (summary.highIssueCount > 0 || summary.mediumIssueCount > 5) {
        expect(summary.overallHealth).toBe('needsWork')
      } else if (summary.mediumIssueCount > 0 || summary.lowIssueCount > 3) {
        expect(summary.overallHealth).toBe('good')
      } else {
        expect(summary.overallHealth).toBe('excellent')
      }
    })

    it('topPriorities match first 3 recommendation titles', () => {
      const result = runAnalysis()
      const expectedTitles = result.recommendations.slice(0, 3).map(r => r.title)
      expect(result.summary.topPriorities).toEqual(expectedTitles)
    })
  })

  describe('segments', () => {
    it('generates non-empty segments', () => {
      const result = runAnalysis()
      expect(result.segments.length).toBeGreaterThan(0)
    })

    it('segments cover the full time range', () => {
      const result = runAnalysis()
      const { frames } = loadTestBflLog()

      const firstSegStart = result.segments[0].startTime
      const lastSegEnd = result.segments[result.segments.length - 1].endTime
      const lastFrameTime = frames[frames.length - 1].time

      expect(firstSegStart).toBe(0)
      // Last segment should extend to at least near the end of the log
      expect(lastSegEnd).toBeGreaterThanOrEqual(lastFrameTime * 0.9)
    })

    it('each segment has a valid phase', () => {
      const result = runAnalysis()
      const validPhases = ['hover', 'cruise', 'flip', 'roll', 'punch', 'propwash', 'idle', 'unknown']
      for (const seg of result.segments) {
        expect(validPhases).toContain(seg.phase)
      }
    })
  })

  describe('determinism', () => {
    it('two runs on the same data produce identical results', () => {
      const { frames, metadata } = loadTestBflLog()
      const engine = new RuleEngine()

      const result1 = engine.analyzeLog(frames, metadata)
      const result2 = engine.analyzeLog(frames, metadata)

      // Same number of issues and types
      expect(result1.issues.length).toBe(result2.issues.length)

      const types1 = result1.issues.map(i => `${i.type}-${i.axis}`).sort()
      const types2 = result2.issues.map(i => `${i.type}-${i.axis}`).sort()
      expect(types1).toEqual(types2)

      // Same number of recommendations
      expect(result1.recommendations.length).toBe(result2.recommendations.length)

      // Same severities
      const severities1 = result1.issues.map(i => i.severity).sort()
      const severities2 = result2.issues.map(i => i.severity).sort()
      expect(severities1).toEqual(severities2)
    }, 15000)
  })
})
