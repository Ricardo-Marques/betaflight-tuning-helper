import { describe, it, expect } from 'vitest'
import { deduplicateRecommendations } from './RecommendationDedup'
import type { Recommendation } from '../types/Analysis'

let idCounter = 0

function makeRec(overrides: Partial<Recommendation> = {}): Recommendation {
  idCounter++
  return {
    id: `rec-${idCounter}`,
    issueId: `issue-${idCounter}`,
    type: 'hardwareCheck',
    priority: 5,
    confidence: 0.8,
    title: 'Inspect motor bearings and shafts',
    description: 'Check for worn bearings',
    rationale: 'Bearing noise detected',
    risks: [],
    changes: [],
    expectedImprovement: 'Reduced vibration',
    category: 'hardware',
    ...overrides,
  }
}

describe('deduplicateRecommendations — title-only recs', () => {
  it('passes through a single title-only rec unchanged', () => {
    const rec = makeRec()
    const result = deduplicateRecommendations([rec])

    expect(result).toHaveLength(1)
    expect(result[0].issueId).toBe(rec.issueId)
    expect(result[0].relatedIssueIds).toBeUndefined()
  })

  it('merges three title-only recs with same title into one with relatedIssueIds', () => {
    const roll = makeRec({ issueId: 'issue-roll' })
    const pitch = makeRec({ issueId: 'issue-pitch' })
    const yaw = makeRec({ issueId: 'issue-yaw' })

    const result = deduplicateRecommendations([roll, pitch, yaw])

    expect(result).toHaveLength(1)
    expect(result[0].issueId).toBe('issue-roll')
    expect(result[0].relatedIssueIds).toEqual(
      expect.arrayContaining(['issue-pitch', 'issue-yaw'])
    )
    expect(result[0].relatedIssueIds).toHaveLength(2)
    // Surviving rec's own issueId should NOT be in relatedIssueIds
    expect(result[0].relatedIssueIds).not.toContain('issue-roll')
  })

  it('does not merge title-only recs with different titles', () => {
    const bearing = makeRec({ title: 'Inspect motor bearings and shafts' })
    const frame = makeRec({ title: 'Check frame and mounting hardware' })

    const result = deduplicateRecommendations([bearing, frame])

    expect(result).toHaveLength(2)
    expect(result[0].title).toBe('Inspect motor bearings and shafts')
    expect(result[1].title).toBe('Check frame and mounting hardware')
  })

  it('preserves existing relatedIssueIds from duplicate recs during merge', () => {
    const first = makeRec({ issueId: 'issue-1' })
    const second = makeRec({
      issueId: 'issue-2',
      relatedIssueIds: ['issue-extra'],
    })

    const result = deduplicateRecommendations([first, second])

    expect(result).toHaveLength(1)
    expect(result[0].relatedIssueIds).toEqual(
      expect.arrayContaining(['issue-2', 'issue-extra'])
    )
    expect(result[0].relatedIssueIds).not.toContain('issue-1')
  })
})

describe('deduplicateRecommendations — change-bearing recs', () => {
  it('deduplicates recs with identical parameter changes normally', () => {
    const rec1 = makeRec({
      issueId: 'issue-a',
      title: 'Increase P gain on roll',
      changes: [
        { parameter: 'pidPGain', axis: 'roll', recommendedChange: '+10%', explanation: 'Reduce overshoot' },
      ],
    })
    const rec2 = makeRec({
      issueId: 'issue-b',
      title: 'Increase P gain on roll',
      priority: 7,
      changes: [
        { parameter: 'pidPGain', axis: 'roll', recommendedChange: '+10%', explanation: 'Better tracking' },
      ],
    })

    const result = deduplicateRecommendations([rec1, rec2])

    // Higher priority rec wins
    expect(result).toHaveLength(1)
    expect(result[0].issueId).toBe('issue-b')
  })
})

describe('deduplicateRecommendations — mixed recs', () => {
  it('handles title-only and change-bearing recs together', () => {
    const hardware1 = makeRec({ issueId: 'hw-roll', title: 'Inspect bearings' })
    const hardware2 = makeRec({ issueId: 'hw-pitch', title: 'Inspect bearings' })
    const software = makeRec({
      issueId: 'sw-1',
      title: 'Increase P gain',
      type: 'increasePID',
      changes: [
        { parameter: 'pidPGain', axis: 'roll', recommendedChange: '+10%', explanation: 'Better response' },
      ],
    })

    const result = deduplicateRecommendations([hardware1, software, hardware2])

    expect(result).toHaveLength(2)

    const hwRec = result.find(r => r.title === 'Inspect bearings')!
    const swRec = result.find(r => r.changes.length > 0)!

    expect(hwRec).toBeDefined()
    expect(hwRec.relatedIssueIds).toEqual(['hw-pitch'])

    expect(swRec).toBeDefined()
    expect(swRec.issueId).toBe('sw-1')
  })
})
