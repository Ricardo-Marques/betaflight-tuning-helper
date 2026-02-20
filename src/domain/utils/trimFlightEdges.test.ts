import { describe, it, expect } from 'vitest'
import { trimFlightEdges } from './trimFlightEdges'
import type { LogFrame, LogMetadata } from '../types/LogFrame'

const AXIS_ZERO = { roll: 0, pitch: 0, yaw: 0 }

function makeFrame(timeUs: number): LogFrame {
  return {
    time: timeUs,
    loopIteration: 0,
    gyroADC: AXIS_ZERO,
    setpoint: AXIS_ZERO,
    pidP: AXIS_ZERO,
    pidI: AXIS_ZERO,
    pidD: AXIS_ZERO,
    pidSum: AXIS_ZERO,
    motor: [1000, 1000, 1000, 1000],
    rcCommand: { roll: 0, pitch: 0, yaw: 0, throttle: 1000 },
    throttle: 1000,
  }
}

function makeMetadata(overrides: Partial<LogMetadata> = {}): LogMetadata {
  return {
    firmwareVersion: '4.4.0',
    firmwareType: 'Betaflight',
    looptime: 8000,
    gyroRate: 8000,
    motorCount: 4,
    fieldNames: [],
    frameCount: 0,
    duration: 0,
    ...overrides,
  }
}

/** Generate evenly spaced frames over a given duration in seconds */
function generateFrames(durationSeconds: number, rateHz: number = 1000): LogFrame[] {
  const intervalUs = 1_000_000 / rateHz
  const count = Math.round(durationSeconds * rateHz)
  return Array.from({ length: count }, (_, i) => makeFrame(i * intervalUs))
}

describe('trimFlightEdges', () => {
  it('returns originals for empty frames', () => {
    const frames: LogFrame[] = []
    const metadata = makeMetadata({ duration: 0, frameCount: 0 })
    const result = trimFlightEdges(frames, metadata)

    expect(result.frames).toBe(frames)
    expect(result.metadata).toBe(metadata)
    expect(result.trimmedStartSeconds).toBe(0)
    expect(result.trimmedEndSeconds).toBe(0)
  })

  it('does not trim flights shorter than 3 seconds', () => {
    const frames = generateFrames(2.5)
    const metadata = makeMetadata({ duration: 2.5, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    expect(result.frames).toBe(frames)
    expect(result.metadata).toBe(metadata)
    expect(result.trimmedStartSeconds).toBe(0)
    expect(result.trimmedEndSeconds).toBe(0)
  })

  it('applies proportional trim on 3.5s flight (0.5s each side)', () => {
    const frames = generateFrames(3.5)
    const metadata = makeMetadata({ duration: 3.5, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    expect(result.trimmedStartSeconds).toBeCloseTo(0.5, 1)
    expect(result.trimmedEndSeconds).toBeCloseTo(0.5, 1)
    // First frame should be re-zeroed to 0
    expect(result.frames[0].time).toBe(0)
    // Duration should be approximately 2.5s
    expect(result.metadata.duration).toBeCloseTo(2.5, 1)
    expect(result.metadata.frameCount).toBe(result.frames.length)
  })

  it('applies full 1s trim on 5s+ flight', () => {
    const frames = generateFrames(5)
    const metadata = makeMetadata({ duration: 5, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    expect(result.trimmedStartSeconds).toBe(1)
    expect(result.trimmedEndSeconds).toBe(1)
    expect(result.frames[0].time).toBe(0)
    // Duration should be approximately 3s
    expect(result.metadata.duration).toBeCloseTo(3, 1)
    expect(result.metadata.frameCount).toBe(result.frames.length)
  })

  it('re-zero-bases timestamps correctly', () => {
    const frames = generateFrames(5)
    const metadata = makeMetadata({ duration: 5, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    // All timestamps should be >= 0
    expect(result.frames.every(f => f.time >= 0)).toBe(true)
    // First frame at 0
    expect(result.frames[0].time).toBe(0)
    // Last frame should be close to the new duration
    const lastTimeUs = result.frames[result.frames.length - 1].time
    expect(lastTimeUs / 1_000_000).toBeCloseTo(result.metadata.duration, 2)
  })

  it('updates metadata duration and frameCount', () => {
    const frames = generateFrames(10)
    const metadata = makeMetadata({ duration: 10, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    expect(result.metadata.frameCount).toBe(result.frames.length)
    expect(result.metadata.frameCount).toBeLessThan(frames.length)
    expect(result.metadata.duration).toBeCloseTo(8, 1)
  })

  it('returns originals if filtering produces no frames', () => {
    // Create frames all at the same time — trimming would remove all of them
    const frames = [makeFrame(0), makeFrame(0), makeFrame(0)]
    const metadata = makeMetadata({ duration: 5, frameCount: 3 })
    const result = trimFlightEdges(frames, metadata)

    expect(result.frames).toBe(frames)
    expect(result.metadata).toBe(metadata)
    expect(result.trimmedStartSeconds).toBe(0)
    expect(result.trimmedEndSeconds).toBe(0)
  })

  it('preserves non-time frame data', () => {
    const frames = generateFrames(5)
    // Set distinctive values on a middle frame
    const midIdx = Math.floor(frames.length / 2)
    frames[midIdx] = { ...frames[midIdx], throttle: 1500 }

    const metadata = makeMetadata({ duration: 5, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    // The middle frame should still exist with its throttle value
    const found = result.frames.find(f => f.throttle === 1500)
    expect(found).toBeDefined()
  })

  it('does not trim at exactly 3s', () => {
    const frames = generateFrames(3)
    const metadata = makeMetadata({ duration: 3, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    expect(result.trimmedStartSeconds).toBe(0)
    expect(result.trimmedEndSeconds).toBe(0)
  })

  it('applies full trim at exactly 4s', () => {
    const frames = generateFrames(4)
    const metadata = makeMetadata({ duration: 4, frameCount: frames.length })
    const result = trimFlightEdges(frames, metadata)

    expect(result.trimmedStartSeconds).toBe(1)
    expect(result.trimmedEndSeconds).toBe(1)
    expect(result.metadata.duration).toBeCloseTo(2, 1)
  })
})
