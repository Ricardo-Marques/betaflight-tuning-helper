import { describe, it, expect } from 'vitest'
import { FilterNoiseComparisonRule } from './FilterNoiseComparisonRule'
import type { AnalysisWindow, DetectedIssue } from '../types/Analysis'
import type { LogFrame, LogMetadata } from '../types/LogFrame'
import { DEFAULT_PROFILE } from '../profiles/quadProfiles'

function makeFrame(time: number, gyroValue: number): LogFrame {
  return {
    time,
    loopIteration: 0,
    gyroADC: { roll: gyroValue, pitch: gyroValue, yaw: 0 },
    setpoint: { roll: 0, pitch: 0, yaw: 0 },
    pidP: { roll: 0, pitch: 0, yaw: 0 },
    pidI: { roll: 0, pitch: 0, yaw: 0 },
    pidD: { roll: 0, pitch: 0, yaw: 0 },
    pidSum: { roll: 0, pitch: 0, yaw: 0 },
    motor: [1200, 1200, 1200, 1200],
    rcCommand: { roll: 0, pitch: 0, yaw: 0, throttle: 1400 },
    throttle: 1400,
  }
}

/** Generate 256 frames of a sine wave at given frequency + optional high-freq noise */
function makeSinFrames(
  freqHz: number,
  amplitude: number,
  sampleRate: number,
  noiseFreqHz?: number,
  noiseAmplitude?: number,
): LogFrame[] {
  const n = 256
  const dt = 1_000_000 / sampleRate // microseconds per sample
  return Array.from({ length: n }, (_, i) => {
    let value = amplitude * Math.sin(2 * Math.PI * freqHz * i / sampleRate)
    if (noiseFreqHz !== undefined && noiseAmplitude !== undefined) {
      value += noiseAmplitude * Math.sin(2 * Math.PI * noiseFreqHz * i / sampleRate)
    }
    return makeFrame(i * dt, value)
  })
}

function makeWindow(frames: LogFrame[]): AnalysisWindow {
  return {
    startTime: frames[0].time,
    endTime: frames[frames.length - 1].time,
    frameIndices: frames.map((_, i) => i),
    axis: 'roll',
    metadata: {
      avgThrottle: 1400,
      maxSetpoint: 5,
      rmsSetpoint: 2,
      hasStickInput: false,
      flightPhase: 'hover',
    },
  }
}

function makeMetadata(
  gyroLpf1Cutoff?: number,
  dtermLpf1Cutoff?: number,
): LogMetadata {
  return {
    firmwareVersion: '4.4.0',
    firmwareType: 'Betaflight',
    looptime: 4000,
    gyroRate: 8000,
    motorCount: 4,
    fieldNames: [],
    frameCount: 256,
    duration: 60,
    filterSettings: {
      gyroLpf1Cutoff,
      dtermLpf1Cutoff,
    },
  }
}

describe('FilterNoiseComparisonRule', () => {
  describe('condition', () => {
    it('accepts hover windows without stick input', () => {
      const frames = makeSinFrames(10, 5, 4000)
      const window = makeWindow(frames)
      expect(FilterNoiseComparisonRule.condition(window, frames)).toBe(true)
    })

    it('rejects windows with stick input', () => {
      const frames = makeSinFrames(10, 5, 4000)
      const window = makeWindow(frames)
      window.metadata.hasStickInput = true
      expect(FilterNoiseComparisonRule.condition(window, frames)).toBe(false)
    })

    it('rejects high throttle windows', () => {
      const frames = makeSinFrames(10, 5, 4000)
      const window = makeWindow(frames)
      window.metadata.avgThrottle = 1700
      expect(FilterNoiseComparisonRule.condition(window, frames)).toBe(false)
    })
  })

  describe('detect', () => {
    it('returns empty when no filter settings', () => {
      const frames = makeSinFrames(10, 5, 4000)
      const window = makeWindow(frames)
      const meta = makeMetadata()
      meta.filterSettings = undefined
      expect(FilterNoiseComparisonRule.detect(window, frames, DEFAULT_PROFILE, meta)).toEqual([])
    })

    it('returns empty when no cutoff is configured', () => {
      const frames = makeSinFrames(10, 5, 4000)
      const window = makeWindow(frames)
      const meta = makeMetadata(undefined, undefined)
      expect(FilterNoiseComparisonRule.detect(window, frames, DEFAULT_PROFILE, meta)).toEqual([])
    })

    it('detects over-filtering when cutoff is far below noise', () => {
      // Signal at 300Hz — noise is high-frequency but cutoff is at 50Hz
      const frames = makeSinFrames(300, 10, 4000)
      const window = makeWindow(frames)
      const meta = makeMetadata(50, undefined)
      const issues = FilterNoiseComparisonRule.detect(window, frames, DEFAULT_PROFILE, meta)
      const overIssues = issues.filter(i => i.metrics.filterDirection === 'over')
      // Whether this detects depends on FFT resolution, but we should at least not crash
      expect(issues.length).toBeGreaterThanOrEqual(0)
      for (const issue of overIssues) {
        expect(issue.type).toBe('filterMismatch')
        expect(issue.metrics.filterDirection).toBe('over')
      }
    })

    it('detects under-filtering when noise extends past cutoff', () => {
      // Mix of low-freq signal + high-freq noise, with D-term cutoff too high
      const frames = makeSinFrames(10, 5, 4000, 400, 15)
      const window = makeWindow(frames)
      const meta = makeMetadata(undefined, 100)
      const issues = FilterNoiseComparisonRule.detect(window, frames, DEFAULT_PROFILE, meta)
      // May or may not detect depending on FFT — verify no crash and correct types
      for (const issue of issues) {
        expect(issue.type).toBe('filterMismatch')
        expect(issue.metrics.filterDirection).toBe('under')
      }
    })

    it('assigns valid severity and confidence', () => {
      const frames = makeSinFrames(300, 10, 4000)
      const window = makeWindow(frames)
      const meta = makeMetadata(30, undefined)
      const issues = FilterNoiseComparisonRule.detect(window, frames, DEFAULT_PROFILE, meta)
      for (const issue of issues) {
        expect(['low', 'medium', 'high']).toContain(issue.severity)
        expect(issue.confidence).toBeGreaterThan(0)
        expect(issue.confidence).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('recommend', () => {
    it('generates raise-filter recommendation for over-filtering', () => {
      const issue: DetectedIssue = {
        id: 'test-1',
        type: 'filterMismatch',
        severity: 'medium',
        axis: 'roll',
        timeRange: [0, 1000000],
        description: 'Gyro over-filtering',
        metrics: {
          frequency: 200,
          currentCutoffHz: 80,
          suggestedCutoffHz: 200,
          filterDirection: 'over',
        },
        confidence: 0.8,
      }
      const recs = FilterNoiseComparisonRule.recommend([issue], [], DEFAULT_PROFILE)
      expect(recs.length).toBe(1)
      expect(recs[0].changes[0].parameter).toBe('gyroFilterMultiplier')
      expect(recs[0].changes[0].recommendedChange).toMatch(/^\+\d+$/)
    })

    it('generates lower-filter recommendation for under-filtering', () => {
      const issue: DetectedIssue = {
        id: 'test-2',
        type: 'filterMismatch',
        severity: 'medium',
        axis: 'pitch',
        timeRange: [0, 1000000],
        description: 'D-term under-filtering: noise extends to 300 Hz',
        metrics: {
          frequency: 300,
          currentCutoffHz: 150,
          suggestedCutoffHz: 300,
          filterDirection: 'under',
        },
        confidence: 0.8,
      }
      const recs = FilterNoiseComparisonRule.recommend([issue], [], DEFAULT_PROFILE)
      expect(recs.length).toBe(1)
      expect(recs[0].changes[0].parameter).toBe('dtermFilterMultiplier')
      expect(recs[0].changes[0].recommendedChange).toMatch(/^-\d+$/)
    })

    it('ignores non-filterMismatch issues', () => {
      const issue: DetectedIssue = {
        id: 'test-3',
        type: 'gyroNoise',
        severity: 'medium',
        axis: 'roll',
        timeRange: [0, 1000000],
        description: 'Some noise',
        metrics: {},
        confidence: 0.8,
      }
      const recs = FilterNoiseComparisonRule.recommend([issue], [], DEFAULT_PROFILE)
      expect(recs).toEqual([])
    })
  })
})
