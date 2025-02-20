import { describe, it, expect } from 'vitest'
import { deduplicateIssues, MAX_DISPLAYED_OCCURRENCES } from './IssueDeduplication'
import type { DetectedIssue } from '../types/Analysis'

function makeIssue(overrides: Partial<DetectedIssue> & { timeRange: [number, number]; confidence: number }): DetectedIssue {
  return {
    id: `issue-${overrides.timeRange[0]}`,
    type: 'bounceback',
    severity: 'medium',
    axis: 'roll',
    description: 'Bounceback on roll',
    metrics: { peakTime: (overrides.timeRange[0] + overrides.timeRange[1]) / 2 },
    ...overrides,
  }
}

describe('deduplicateIssues — occurrence limiting', () => {
  it('does not limit groups with <= MAX_DISPLAYED_OCCURRENCES entries', () => {
    const issues = Array.from({ length: 3 }, (_, i) =>
      makeIssue({
        timeRange: [i * 1_000_000, i * 1_000_000 + 500_000] as [number, number],
        confidence: 0.5 + i * 0.1,
      })
    )

    const result = deduplicateIssues(issues)

    expect(result).toHaveLength(1)
    expect(result[0].occurrences).toHaveLength(3)
    expect(result[0].totalOccurrences).toBeUndefined()
  })

  it('limits groups with > MAX_DISPLAYED_OCCURRENCES to top 5 by confidence', () => {
    // Create 8 issues with varying confidence; spread far apart so no temporal merge
    const confidences = [0.3, 0.9, 0.5, 0.8, 0.2, 0.95, 0.4, 0.7]
    const issues = confidences.map((conf, i) =>
      makeIssue({
        timeRange: [i * 2_000_000, i * 2_000_000 + 500_000] as [number, number],
        confidence: conf,
      })
    )

    const result = deduplicateIssues(issues)

    expect(result).toHaveLength(1)
    const issue = result[0]

    // Should be limited to 5
    expect(issue.occurrences).toHaveLength(MAX_DISPLAYED_OCCURRENCES)
    expect(issue.peakTimes).toHaveLength(MAX_DISPLAYED_OCCURRENCES)

    // totalOccurrences should reflect the full count
    expect(issue.totalOccurrences).toBe(8)

    // The displayed occurrences should be the top 5 by confidence: 0.95, 0.9, 0.8, 0.7, 0.5
    // Indices in original: 5(0.95), 1(0.9), 3(0.8), 7(0.7), 2(0.5)
    // Re-sorted chronologically by timeRange[0]: 1, 2, 3, 5, 7
    const expectedStarts = [1, 2, 3, 5, 7].map(i => i * 2_000_000)
    const actualStarts = issue.occurrences!.map(o => o[0])
    expect(actualStarts).toEqual(expectedStarts)
  })

  it('preserves description count, severity, and timeRange from full group', () => {
    const issues = Array.from({ length: 7 }, (_, i) =>
      makeIssue({
        timeRange: [i * 2_000_000, i * 2_000_000 + 500_000] as [number, number],
        confidence: 0.5,
        severity: i === 6 ? 'high' : 'medium',
      })
    )

    const result = deduplicateIssues(issues)
    const issue = result[0]

    // Description should say (×7), not (×5)
    expect(issue.description).toContain('×7')

    // Severity should be worst-case from full group
    expect(issue.severity).toBe('high')

    // timeRange should span the full group
    expect(issue.timeRange[0]).toBe(0)
    expect(issue.timeRange[1]).toBe(6 * 2_000_000 + 500_000)
  })

  it('exactly MAX_DISPLAYED_OCCURRENCES entries are not limited', () => {
    const issues = Array.from({ length: MAX_DISPLAYED_OCCURRENCES }, (_, i) =>
      makeIssue({
        timeRange: [i * 2_000_000, i * 2_000_000 + 500_000] as [number, number],
        confidence: 0.5 + i * 0.05,
      })
    )

    const result = deduplicateIssues(issues)

    expect(result[0].occurrences).toHaveLength(MAX_DISPLAYED_OCCURRENCES)
    expect(result[0].totalOccurrences).toBeUndefined()
  })
})
