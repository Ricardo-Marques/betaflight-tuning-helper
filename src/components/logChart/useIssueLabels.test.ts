import { describe, it, expect } from 'vitest'
import { shortLabel } from './useIssueLabels'
import type { DetectedIssue } from '../../domain/types/Analysis'

function makeIssue(overrides: Partial<DetectedIssue>): DetectedIssue {
  return {
    id: 'test-1',
    type: 'bounceback',
    severity: 'medium',
    axis: 'roll',
    timeRange: [0, 1000000],
    description: 'Test issue',
    metrics: {},
    confidence: 0.8,
    ...overrides,
  } as DetectedIssue
}

describe('shortLabel', () => {
  it('returns description prefix before the colon', () => {
    const issue = makeIssue({ description: 'Bounceback detected: 15° overshoot on roll axis' })
    expect(shortLabel(issue)).toBe('Bounceback detected')
  })

  it('falls back to issue type when no colon in description', () => {
    const issue = makeIssue({ type: 'propwash', description: 'Propwash oscillation' })
    expect(shortLabel(issue)).toBe('propwash')
  })

  it('handles colon at the very start by falling back to type', () => {
    const issue = makeIssue({ type: 'midThrottleWobble', description: ': some details' })
    expect(shortLabel(issue)).toBe('midThrottleWobble')
  })
})
