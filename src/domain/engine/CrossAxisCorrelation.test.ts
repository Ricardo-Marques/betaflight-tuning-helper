import { describe, it, expect } from 'vitest'
import { correlateAxes } from './CrossAxisCorrelation'
import type { DetectedIssue, Axis, IssueType } from '../types/Analysis'

function makeIssue(type: IssueType, axis: Axis, severity: 'low' | 'medium' | 'high' = 'medium'): DetectedIssue {
  return {
    id: `${type}-${axis}`,
    type,
    severity,
    axis,
    timeRange: [0, 1000000],
    description: `${type} on ${axis}`,
    metrics: {},
    confidence: 0.8,
  }
}

describe('correlateAxes', () => {
  describe('pattern classification', () => {
    it('classifies allAxes when all 3 axes affected', () => {
      const issues = [
        makeIssue('gyroNoise', 'roll'),
        makeIssue('gyroNoise', 'pitch'),
        makeIssue('gyroNoise', 'yaw'),
      ]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues[0].crossAxisContext?.pattern).toBe('allAxes')
    })

    it('classifies rollPitchOnly for roll+pitch', () => {
      const issues = [
        makeIssue('propwash', 'roll'),
        makeIssue('propwash', 'pitch'),
      ]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues[0].crossAxisContext?.pattern).toBe('rollPitchOnly')
    })

    it('classifies yawOnly for yaw-only', () => {
      const issues = [makeIssue('dtermNoise', 'yaw')]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues[0].crossAxisContext?.pattern).toBe('yawOnly')
    })

    it('classifies singleAxis for single non-yaw', () => {
      const issues = [makeIssue('bounceback', 'roll')]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues[0].crossAxisContext?.pattern).toBe('singleAxis')
    })

    it('classifies asymmetric for roll+yaw', () => {
      const issues = [
        makeIssue('highFrequencyNoise', 'roll'),
        makeIssue('highFrequencyNoise', 'yaw'),
      ]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues[0].crossAxisContext?.pattern).toBe('asymmetric')
    })
  })

  describe('cross-axis recommendations', () => {
    it('generates hardware rec for allAxes pattern', () => {
      const issues = [
        makeIssue('gyroNoise', 'roll', 'high'),
        makeIssue('gyroNoise', 'pitch', 'medium'),
        makeIssue('gyroNoise', 'yaw', 'low'),
      ]
      const { crossAxisRecommendations } = correlateAxes(issues)
      expect(crossAxisRecommendations.length).toBe(1)
      expect(crossAxisRecommendations[0].category).toBe('hardware')
      expect(crossAxisRecommendations[0].title).toContain('all axes')
    })

    it('generates hardware rec for asymmetric pattern', () => {
      const issues = [
        makeIssue('bounceback', 'roll'),
        makeIssue('bounceback', 'yaw'),
      ]
      const { crossAxisRecommendations } = correlateAxes(issues)
      expect(crossAxisRecommendations.length).toBe(1)
      expect(crossAxisRecommendations[0].title).toContain('Asymmetric')
    })

    it('does not generate rec for singleAxis', () => {
      const issues = [makeIssue('propwash', 'roll')]
      const { crossAxisRecommendations } = correlateAxes(issues)
      expect(crossAxisRecommendations).toEqual([])
    })

    it('does not generate rec for yawOnly', () => {
      const issues = [makeIssue('dtermNoise', 'yaw')]
      const { crossAxisRecommendations } = correlateAxes(issues)
      expect(crossAxisRecommendations).toEqual([])
    })

    it('does not generate rec for rollPitchOnly', () => {
      const issues = [
        makeIssue('propwash', 'roll'),
        makeIssue('propwash', 'pitch'),
      ]
      const { crossAxisRecommendations } = correlateAxes(issues)
      expect(crossAxisRecommendations).toEqual([])
    })
  })

  describe('global issue types', () => {
    it('skips cross-axis context for global-only types', () => {
      const issues = [makeIssue('motorSaturation', 'roll')]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues[0].crossAxisContext).toBeUndefined()
    })

    it('skips cross-axis context for voltageSag', () => {
      const issues = [makeIssue('voltageSag', 'roll')]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues[0].crossAxisContext).toBeUndefined()
    })
  })

  describe('mixed issue types', () => {
    it('handles multiple issue types independently', () => {
      const issues = [
        makeIssue('gyroNoise', 'roll'),
        makeIssue('gyroNoise', 'pitch'),
        makeIssue('gyroNoise', 'yaw'),
        makeIssue('propwash', 'roll'),
      ]
      const { annotatedIssues } = correlateAxes(issues)
      const gyroIssues = annotatedIssues.filter(i => i.type === 'gyroNoise')
      const propwashIssues = annotatedIssues.filter(i => i.type === 'propwash')
      expect(gyroIssues[0].crossAxisContext?.pattern).toBe('allAxes')
      expect(propwashIssues[0].crossAxisContext?.pattern).toBe('singleAxis')
    })

    it('preserves all original issues', () => {
      const issues = [
        makeIssue('gyroNoise', 'roll'),
        makeIssue('propwash', 'pitch'),
        makeIssue('motorSaturation', 'roll'),
      ]
      const { annotatedIssues } = correlateAxes(issues)
      expect(annotatedIssues.length).toBe(3)
    })
  })
})
