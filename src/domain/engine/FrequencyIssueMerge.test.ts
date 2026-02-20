import { describe, it, expect, beforeEach } from 'vitest'
import { mergeFrequencyIssues } from './FrequencyIssueMerge'
import type { DetectedIssue, Axis, IssueType, Severity, Recommendation } from '../types/Analysis'

let idCounter = 0

function makeIssue(
  type: IssueType,
  axis: Axis,
  frequency: number,
  overrides: Partial<Pick<DetectedIssue, 'severity' | 'confidence' | 'description'>> & {
    amplitude?: number
  } = {},
): DetectedIssue {
  idCounter++
  return {
    id: `${type}-${axis}-${idCounter}`,
    type,
    severity: overrides.severity ?? 'medium',
    axis,
    timeRange: [0, 1_000_000],
    description: overrides.description ?? `${type} on ${axis}`,
    metrics: { frequency, amplitude: overrides.amplitude },
    confidence: overrides.confidence ?? 0.8,
  }
}

function makeRec(issueId: string, relatedIssueIds?: string[]): Recommendation {
  return {
    id: `rec-${issueId}`,
    issueId,
    type: 'hardwareCheck',
    priority: 5,
    confidence: 0.8,
    title: 'Check frame',
    description: 'Inspect frame',
    rationale: 'Resonance detected',
    risks: [],
    changes: [],
    expectedImprovement: 'Less vibration',
    relatedIssueIds,
  }
}

beforeEach(() => { idCounter = 0 })

describe('mergeFrequencyIssues', () => {
  it('passes through a single-axis issue unchanged', () => {
    const issue = makeIssue('frameResonance', 'roll', 120)
    const { mergedIssues, updatedRecommendations } = mergeFrequencyIssues([issue], [])
    expect(mergedIssues).toHaveLength(1)
    expect(mergedIssues[0].id).toBe(issue.id)
    expect(mergedIssues[0].description).not.toContain('also on')
    expect(updatedRecommendations).toHaveLength(0)
  })

  it('merges same frequency on 3 axes into 1 winner with highest severity', () => {
    const roll = makeIssue('frameResonance', 'roll', 120, { severity: 'medium' })
    const pitch = makeIssue('frameResonance', 'pitch', 122, { severity: 'high' })
    const yaw = makeIssue('frameResonance', 'yaw', 118, { severity: 'low' })

    const { mergedIssues } = mergeFrequencyIssues([roll, pitch, yaw], [])
    expect(mergedIssues).toHaveLength(1)
    expect(mergedIssues[0].severity).toBe('high')
    expect(mergedIssues[0].axis).toBe('pitch')
    expect(mergedIssues[0].crossAxisContext?.pattern).toBe('allAxes')
    expect(mergedIssues[0].crossAxisContext?.affectedAxes).toEqual(['roll', 'pitch', 'yaw'])
    expect(mergedIssues[0].crossAxisContext?.description).toBe('Strongest on pitch, but present on all axes')
  })

  it('keeps different frequencies separate (120Hz vs 250Hz)', () => {
    const low = makeIssue('frameResonance', 'roll', 120)
    const high = makeIssue('frameResonance', 'pitch', 250)

    const { mergedIssues } = mergeFrequencyIssues([low, high], [])
    expect(mergedIssues).toHaveLength(2)
  })

  it('merges within 10% tolerance (120Hz and 130Hz, 8.3%)', () => {
    const a = makeIssue('frameResonance', 'roll', 120)
    const b = makeIssue('frameResonance', 'pitch', 130)

    const { mergedIssues } = mergeFrequencyIssues([a, b], [])
    expect(mergedIssues).toHaveLength(1)
  })

  it('does not merge beyond 10% tolerance (120Hz and 140Hz, 16.7%)', () => {
    const a = makeIssue('frameResonance', 'roll', 120)
    const b = makeIssue('frameResonance', 'pitch', 140)

    const { mergedIssues } = mergeFrequencyIssues([a, b], [])
    expect(mergedIssues).toHaveLength(2)
  })

  it('tiebreaks by amplitude then confidence when severity is equal', () => {
    const roll = makeIssue('frameResonance', 'roll', 120, {
      severity: 'medium', amplitude: 10, confidence: 0.9,
    })
    const pitch = makeIssue('frameResonance', 'pitch', 122, {
      severity: 'medium', amplitude: 20, confidence: 0.7,
    })

    const { mergedIssues } = mergeFrequencyIssues([roll, pitch], [])
    expect(mergedIssues).toHaveLength(1)
    expect(mergedIssues[0].axis).toBe('pitch') // higher amplitude wins
  })

  it('tiebreaks by confidence when severity and amplitude are equal', () => {
    const roll = makeIssue('frameResonance', 'roll', 120, {
      severity: 'medium', amplitude: 10, confidence: 0.9,
    })
    const pitch = makeIssue('frameResonance', 'pitch', 122, {
      severity: 'medium', amplitude: 10, confidence: 0.6,
    })

    const { mergedIssues } = mergeFrequencyIssues([roll, pitch], [])
    expect(mergedIssues[0].axis).toBe('roll') // higher confidence wins
  })

  it('sets crossAxisContext without modifying description', () => {
    const roll = makeIssue('frameResonance', 'roll', 120, {
      severity: 'high', description: 'Frame resonance at 120Hz (×3)',
    })
    const pitch = makeIssue('frameResonance', 'pitch', 121, { severity: 'low' })

    const { mergedIssues } = mergeFrequencyIssues([roll, pitch], [])
    expect(mergedIssues[0].description).toBe('Frame resonance at 120Hz (×3)')
    expect(mergedIssues[0].crossAxisContext?.description).toBe('Strongest on roll, also on pitch')
  })

  it('merges bearingNoise the same way', () => {
    const roll = makeIssue('bearingNoise', 'roll', 400, { severity: 'medium' })
    const pitch = makeIssue('bearingNoise', 'pitch', 405, { severity: 'high' })

    const { mergedIssues } = mergeFrequencyIssues([roll, pitch], [])
    expect(mergedIssues).toHaveLength(1)
    expect(mergedIssues[0].type).toBe('bearingNoise')
    expect(mergedIssues[0].axis).toBe('pitch')
    expect(mergedIssues[0].crossAxisContext?.description).toContain('also on roll')
  })

  it('remaps cross-axis recommendation IDs to surviving issue', () => {
    const roll = makeIssue('frameResonance', 'roll', 120, { severity: 'high' })
    const pitch = makeIssue('frameResonance', 'pitch', 122, { severity: 'low' })
    const rec = makeRec(pitch.id, [roll.id])

    const { mergedIssues, updatedRecommendations } = mergeFrequencyIssues([roll, pitch], [rec])
    const survivorId = mergedIssues[0].id
    expect(updatedRecommendations[0].issueId).toBe(survivorId)
    expect(updatedRecommendations[0].relatedIssueIds).toEqual([survivorId])
  })

  it('never merges non-frequency types', () => {
    const a = makeIssue('gyroNoise', 'roll', 120)
    const b = makeIssue('gyroNoise', 'pitch', 122)
    const c = makeIssue('propwash', 'roll', 120)
    const d = makeIssue('propwash', 'yaw', 121)

    const { mergedIssues } = mergeFrequencyIssues([a, b, c, d], [])
    expect(mergedIssues).toHaveLength(4)
  })

  it('skips issues without metrics.frequency', () => {
    const withFreq = makeIssue('frameResonance', 'roll', 120)
    const withoutFreq: DetectedIssue = {
      id: 'no-freq',
      type: 'frameResonance',
      severity: 'medium' as Severity,
      axis: 'pitch',
      timeRange: [0, 1_000_000],
      description: 'frame resonance (no freq)',
      metrics: {},
      confidence: 0.8,
    }

    const { mergedIssues } = mergeFrequencyIssues([withFreq, withoutFreq], [])
    expect(mergedIssues).toHaveLength(2) // no merge — one lacks frequency
  })
})
