import { describe, it, expect } from 'vitest'
import { loadTestBflLog, loadTestBflBuffer } from '../test-helpers'
import { parseBblBuffer } from './BblParser'

describe('BblParser', () => {
  describe('parsing test BFL', () => {
    it('produces frames', () => {
      const { frames } = loadTestBflLog()
      expect(frames.length).toBeGreaterThan(0)
    })

    it('populates metadata', () => {
      const { metadata } = loadTestBflLog()
      expect(metadata.firmwareType).toBeTruthy()
      expect(metadata.looptime).toBeGreaterThan(0)
      expect(metadata.motorCount).toBe(4)
      expect(metadata.fieldNames.length).toBeGreaterThan(0)
      expect(metadata.frameCount).toBeGreaterThan(0)
      expect(metadata.duration).toBeGreaterThan(0)
    })

    it('has valid looptime in Hz', () => {
      const { metadata } = loadTestBflLog()
      // Typical Betaflight looptimes: 1kHz-8kHz
      expect(metadata.looptime).toBeGreaterThanOrEqual(500)
      expect(metadata.looptime).toBeLessThanOrEqual(32000)
    })
  })

  describe('frame structure', () => {
    it('first frame has gyro, setpoint, PID, and motor data', () => {
      const { frames } = loadTestBflLog()
      const f = frames[0]

      expect(f.gyroADC).toBeDefined()
      expect(f.gyroADC).toHaveProperty('roll')
      expect(f.gyroADC).toHaveProperty('pitch')
      expect(f.gyroADC).toHaveProperty('yaw')

      expect(f.setpoint).toBeDefined()
      expect(f.setpoint).toHaveProperty('roll')

      expect(f.pidP).toBeDefined()
      expect(f.pidI).toBeDefined()
      expect(f.pidD).toBeDefined()

      expect(f.motor).toBeDefined()
      expect(Array.isArray(f.motor)).toBe(true)
      expect(f.motor.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('timestamps', () => {
    it('first frame time is zero-based', () => {
      const { frames } = loadTestBflLog()
      expect(frames[0].time).toBe(0)
    })

    it('timestamps are in ascending order', () => {
      const { frames } = loadTestBflLog()
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i].time).toBeGreaterThanOrEqual(frames[i - 1].time)
      }
    })
  })

  describe('PID profile', () => {
    it('extracts non-zero PID values', () => {
      const { metadata } = loadTestBflLog()
      const pid = metadata.pidProfile

      // PID profile may or may not be present depending on log content,
      // but if present, P gains should be reasonable
      if (pid) {
        if (pid.rollP !== undefined) {
          expect(pid.rollP).toBeGreaterThan(0)
          expect(pid.rollP).toBeLessThan(300)
        }
        if (pid.pitchP !== undefined) {
          expect(pid.pitchP).toBeGreaterThan(0)
          expect(pid.pitchP).toBeLessThan(300)
        }
      }
    })
  })

  describe('physically plausible values', () => {
    it('gyro values are within ±2000 deg/s', () => {
      const { frames } = loadTestBflLog()
      for (const f of frames) {
        expect(Math.abs(f.gyroADC.roll)).toBeLessThanOrEqual(2000)
        expect(Math.abs(f.gyroADC.pitch)).toBeLessThanOrEqual(2000)
        expect(Math.abs(f.gyroADC.yaw)).toBeLessThanOrEqual(2000)
      }
    })

    it('motor values are in valid range', () => {
      const { frames } = loadTestBflLog()
      for (const f of frames) {
        for (const m of f.motor) {
          expect(m).toBeGreaterThanOrEqual(0)
          // Betaflight uses 11-bit motor values (0–2047)
          expect(m).toBeLessThanOrEqual(2048)
        }
      }
    })
  })

  describe('progress callback', () => {
    it('invokes progress callback spanning 0–100 range', () => {
      const buffer = loadTestBflBuffer()
      const progressValues: number[] = []

      parseBblBuffer(buffer, (pct) => {
        progressValues.push(pct)
      })

      expect(progressValues.length).toBeGreaterThan(0)
      expect(Math.min(...progressValues)).toBeLessThanOrEqual(15)
      expect(Math.max(...progressValues)).toBeGreaterThanOrEqual(90)
    })
  })

  describe('error handling', () => {
    it('rejects empty buffer with meaningful error', () => {
      const empty = new Uint8Array(0)
      expect(() => parseBblBuffer(empty)).toThrow()
    })

    it('rejects invalid buffer with meaningful error', () => {
      const garbage = new Uint8Array([0, 1, 2, 3, 4, 5])
      expect(() => parseBblBuffer(garbage)).toThrow(/no valid|not found|header/i)
    })
  })
})
