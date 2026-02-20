import { describe, it, expect } from 'vitest'
import { analyzeTemporalProgression } from './TemporalProgressionAnalyzer'
import type { DetectedIssue, Axis, IssueType } from '../types/Analysis'
import type { LogFrame, LogMetadata } from '../types/LogFrame'

function makeRawIssue(
  type: IssueType,
  axis: Axis,
  startTimeUs: number,
  amplitude?: number,
): DetectedIssue {
  return {
    id: `${type}-${axis}-${startTimeUs}`,
    type,
    severity: 'medium',
    axis,
    timeRange: [startTimeUs, startTimeUs + 500_000],
    description: `${type} on ${axis}`,
    metrics: amplitude !== undefined ? { amplitude } : {},
    confidence: 0.7,
  }
}

function makeDeduped(type: IssueType, axis: Axis, severity: 'low' | 'medium' | 'high' = 'medium'): DetectedIssue {
  return {
    id: `${type}-${axis}`,
    type,
    severity,
    axis,
    timeRange: [0, 60_000_000],
    description: `${type} on ${axis}`,
    metrics: {},
    confidence: 0.7,
  }
}

function makeFrames(durationUs: number, count: number = 100): LogFrame[] {
  const frames: LogFrame[] = []
  for (let i = 0; i < count; i++) {
    frames.push({
      time: (i / (count - 1)) * durationUs,
    } as LogFrame)
  }
  return frames
}

const metadata = {} as LogMetadata

describe('analyzeTemporalProgression', () => {
  describe('guards', () => {
    it('skips analysis for short flights (<30s)', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 0),
        makeRawIssue('gyroNoise', 'roll', 5_000_000),
        makeRawIssue('gyroNoise', 'roll', 10_000_000),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(20_000_000)

      const { annotatedIssues, metaIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues).toBe(deduped)
      expect(metaIssues).toEqual([])
    })

    it('skips groups with fewer than 3 occurrences', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 0),
        makeRawIssue('gyroNoise', 'roll', 30_000_000),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].temporalPattern).toBeUndefined()
    })

    it('returns unchanged issues for empty frames', () => {
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const { annotatedIssues, metaIssues } = analyzeTemporalProgression([], deduped, [], metadata)
      expect(annotatedIssues).toBe(deduped)
      expect(metaIssues).toEqual([])
    })
  })

  describe('trend classification', () => {
    it('detects worsening trend with increasing amplitude', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 10),
        makeRawIssue('gyroNoise', 'roll', 15_000_000, 15),
        makeRawIssue('gyroNoise', 'roll', 25_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 30),
        makeRawIssue('gyroNoise', 'roll', 45_000_000, 40),
        makeRawIssue('gyroNoise', 'roll', 55_000_000, 50),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].temporalPattern?.trend).toBe('worsening')
      expect(annotatedIssues[0].temporalPattern?.likelyCause).toBe('thermal')
    })

    it('detects improving trend with decreasing amplitude', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 50),
        makeRawIssue('gyroNoise', 'roll', 15_000_000, 40),
        makeRawIssue('gyroNoise', 'roll', 25_000_000, 30),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 45_000_000, 15),
        makeRawIssue('gyroNoise', 'roll', 55_000_000, 10),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].temporalPattern?.trend).toBe('improving')
      expect(annotatedIssues[0].temporalPattern?.likelyCause).toBe('coldStart')
    })

    it('detects earlyOnly pattern', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 2_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 8_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 10_000_000, 20),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].temporalPattern?.trend).toBe('earlyOnly')
      expect(annotatedIssues[0].temporalPattern?.likelyCause).toBe('coldStart')
    })

    it('detects lateOnset pattern', () => {
      // Q1 empty, 2 in Q2 (prevents suddenOnset), rest in second half (>70%)
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 16_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 20_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 40_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 45_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 50_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 55_000_000, 20),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].temporalPattern?.trend).toBe('lateOnset')
      expect(annotatedIssues[0].temporalPattern?.likelyCause).toBe('thermal')
    })

    it('detects suddenOnset pattern', () => {
      const raw = [
        makeRawIssue('bearingNoise', 'roll', 35_000_000, 20),
        makeRawIssue('bearingNoise', 'roll', 40_000_000, 25),
        makeRawIssue('bearingNoise', 'roll', 50_000_000, 30),
      ]
      const deduped = [makeDeduped('bearingNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].temporalPattern?.trend).toBe('suddenOnset')
      expect(annotatedIssues[0].temporalPattern?.likelyCause).toBe('mechanical')
    })

    it('detects stable pattern for evenly distributed issues', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 20_000_000, 21),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 19),
        makeRawIssue('gyroNoise', 'roll', 50_000_000, 20),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].temporalPattern?.trend).toBe('stable')
    })
  })

  describe('severity reduction', () => {
    it('reduces severity for earlyOnly coldStart issues', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 2_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 8_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 10_000_000, 20),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll', 'high')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].severity).toBe('medium')
    })

    it('reduces medium severity to low for earlyOnly coldStart', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 2_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 8_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 10_000_000, 20),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll', 'medium')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].severity).toBe('low')
    })

    it('does not reduce severity for worsening issues', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 10),
        makeRawIssue('gyroNoise', 'roll', 20_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 30),
        makeRawIssue('gyroNoise', 'roll', 50_000_000, 40),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll', 'high')]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues[0].severity).toBe('high')
    })
  })

  describe('meta-issues', () => {
    it('generates thermalDegradation when 2+ types worsen on same axis', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 10),
        makeRawIssue('gyroNoise', 'roll', 20_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 30),
        makeRawIssue('gyroNoise', 'roll', 50_000_000, 40),
        makeRawIssue('dtermNoise', 'roll', 5_000_000, 10),
        makeRawIssue('dtermNoise', 'roll', 20_000_000, 20),
        makeRawIssue('dtermNoise', 'roll', 35_000_000, 30),
        makeRawIssue('dtermNoise', 'roll', 50_000_000, 40),
      ]
      const deduped = [
        makeDeduped('gyroNoise', 'roll'),
        makeDeduped('dtermNoise', 'roll'),
      ]
      const frames = makeFrames(60_000_000)

      const { metaIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(metaIssues.some(i => i.type === 'thermalDegradation')).toBe(true)
      expect(metaIssues.find(i => i.type === 'thermalDegradation')?.axis).toBe('roll')
    })

    it('does not generate thermalDegradation for only one worsening type', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 10),
        makeRawIssue('gyroNoise', 'roll', 20_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 30),
        makeRawIssue('gyroNoise', 'roll', 50_000_000, 40),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { metaIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(metaIssues.some(i => i.type === 'thermalDegradation')).toBe(false)
    })

    it('generates mechanicalEvent for sudden mechanical issues', () => {
      const raw = [
        makeRawIssue('bearingNoise', 'roll', 35_000_000, 20),
        makeRawIssue('bearingNoise', 'roll', 40_000_000, 25),
        makeRawIssue('bearingNoise', 'roll', 50_000_000, 30),
      ]
      const deduped = [makeDeduped('bearingNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { metaIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(metaIssues.some(i => i.type === 'mechanicalEvent')).toBe(true)
      expect(metaIssues.find(i => i.type === 'mechanicalEvent')?.severity).toBe('high')
    })

    it('does not generate mechanicalEvent for non-mechanical sudden issues', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 40_000_000, 25),
        makeRawIssue('gyroNoise', 'roll', 50_000_000, 30),
      ]
      const deduped = [makeDeduped('gyroNoise', 'roll')]
      const frames = makeFrames(60_000_000)

      const { metaIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(metaIssues.some(i => i.type === 'mechanicalEvent')).toBe(false)
    })
  })

  describe('mixed issue types', () => {
    it('handles multiple issue types independently', () => {
      const raw = [
        // Worsening gyro noise
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 10),
        makeRawIssue('gyroNoise', 'roll', 20_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 30),
        makeRawIssue('gyroNoise', 'roll', 50_000_000, 40),
        // Stable propwash
        makeRawIssue('propwash', 'pitch', 5_000_000, 20),
        makeRawIssue('propwash', 'pitch', 20_000_000, 21),
        makeRawIssue('propwash', 'pitch', 35_000_000, 19),
        makeRawIssue('propwash', 'pitch', 50_000_000, 20),
      ]
      const deduped = [
        makeDeduped('gyroNoise', 'roll'),
        makeDeduped('propwash', 'pitch'),
      ]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      const gyro = annotatedIssues.find(i => i.type === 'gyroNoise')
      const propwash = annotatedIssues.find(i => i.type === 'propwash')
      expect(gyro?.temporalPattern?.trend).toBe('worsening')
      expect(propwash?.temporalPattern?.trend).toBe('stable')
    })

    it('preserves all original deduped issues', () => {
      const raw = [
        makeRawIssue('gyroNoise', 'roll', 5_000_000, 10),
        makeRawIssue('gyroNoise', 'roll', 20_000_000, 20),
        makeRawIssue('gyroNoise', 'roll', 35_000_000, 30),
        makeRawIssue('propwash', 'pitch', 10_000_000),
      ]
      const deduped = [
        makeDeduped('gyroNoise', 'roll'),
        makeDeduped('propwash', 'pitch'),
      ]
      const frames = makeFrames(60_000_000)

      const { annotatedIssues } = analyzeTemporalProgression(raw, deduped, frames, metadata)
      expect(annotatedIssues.length).toBe(2)
    })
  })
})
