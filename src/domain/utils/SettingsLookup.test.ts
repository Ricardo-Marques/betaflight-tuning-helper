import { describe, it, expect } from 'vitest'
import {
  lookupCurrentValue,
  withCurrentValue,
  populateCurrentValues,
  isRpmFilterEnabled,
  isDGainZero,
  isFFZero,
} from './SettingsLookup'
import type { LogMetadata, PidProfile, FilterSettings } from '../types/LogFrame'
import type { ParameterChange } from '../types/Analysis'

function makeMetadata(
  pidProfile?: Partial<PidProfile>,
  filterSettings?: Partial<FilterSettings>
): LogMetadata {
  return {
    firmwareVersion: '4.4.0',
    firmwareType: 'Betaflight',
    looptime: 4000,
    gyroRate: 8000,
    motorCount: 4,
    fieldNames: [],
    frameCount: 1000,
    duration: 60,
    pidProfile: pidProfile as PidProfile | undefined,
    filterSettings: filterSettings as FilterSettings | undefined,
  }
}

describe('lookupCurrentValue', () => {
  it('looks up per-axis PID values', () => {
    const meta = makeMetadata({ rollP: 45, pitchD: 32 })
    expect(lookupCurrentValue('pidPGain', meta, 'roll')).toBe(45)
    expect(lookupCurrentValue('pidDGain', meta, 'pitch')).toBe(32)
  })

  it('returns undefined for missing per-axis PID values', () => {
    const meta = makeMetadata({ rollP: 45 })
    expect(lookupCurrentValue('pidPGain', meta, 'yaw')).toBeUndefined()
  })

  it('looks up global params from pidProfile', () => {
    const meta = makeMetadata({ tpaRate: 65, masterMultiplier: 110 })
    expect(lookupCurrentValue('tpaRate', meta)).toBe(65)
    expect(lookupCurrentValue('pidMasterMultiplier', meta)).toBe(110)
  })

  it('looks up global params from filterSettings', () => {
    const meta = makeMetadata(undefined, {
      gyroFilterMultiplier: 120,
      rpmFilterHarmonics: 3,
      itermRelaxCutoff: 15,
    })
    expect(lookupCurrentValue('gyroFilterMultiplier', meta)).toBe(120)
    expect(lookupCurrentValue('rpmFilterHarmonics', meta)).toBe(3)
    expect(lookupCurrentValue('itermRelaxCutoff', meta)).toBe(15)
  })

  it('returns undefined when metadata has no profile or filter settings', () => {
    const meta = makeMetadata()
    expect(lookupCurrentValue('pidPGain', meta, 'roll')).toBeUndefined()
    expect(lookupCurrentValue('tpaRate', meta)).toBeUndefined()
    expect(lookupCurrentValue('gyroFilterMultiplier', meta)).toBeUndefined()
  })
})

describe('withCurrentValue', () => {
  it('populates currentValue from metadata', () => {
    const meta = makeMetadata({ rollP: 45 })
    const change: ParameterChange = {
      parameter: 'pidPGain',
      recommendedChange: '+0.3',
      axis: 'roll',
      explanation: 'test',
    }
    const result = withCurrentValue(change, meta)
    expect(result.currentValue).toBe(45)
    expect(result).not.toBe(change) // new object
  })

  it('preserves existing currentValue', () => {
    const meta = makeMetadata({ rollP: 45 })
    const change: ParameterChange = {
      parameter: 'pidPGain',
      currentValue: 99,
      recommendedChange: '+0.3',
      axis: 'roll',
      explanation: 'test',
    }
    const result = withCurrentValue(change, meta)
    expect(result.currentValue).toBe(99)
    expect(result).toBe(change) // same object returned
  })

  it('returns unchanged when value not found in metadata', () => {
    const meta = makeMetadata()
    const change: ParameterChange = {
      parameter: 'pidPGain',
      recommendedChange: '+0.3',
      axis: 'yaw',
      explanation: 'test',
    }
    const result = withCurrentValue(change, meta)
    expect(result.currentValue).toBeUndefined()
    expect(result).toBe(change)
  })
})

describe('populateCurrentValues', () => {
  it('populates multiple changes in batch', () => {
    const meta = makeMetadata({ rollP: 45, tpaRate: 65 }, { gyroFilterMultiplier: 120 })
    const changes: ParameterChange[] = [
      { parameter: 'pidPGain', recommendedChange: '+0.3', axis: 'roll', explanation: 'a' },
      { parameter: 'tpaRate', recommendedChange: '+10', explanation: 'b' },
      { parameter: 'gyroFilterMultiplier', recommendedChange: '-5', explanation: 'c' },
      { parameter: 'pidDGain', recommendedChange: '+0.1', axis: 'yaw', explanation: 'd' },
    ]
    const results = populateCurrentValues(changes, meta)
    expect(results[0].currentValue).toBe(45)
    expect(results[1].currentValue).toBe(65)
    expect(results[2].currentValue).toBe(120)
    expect(results[3].currentValue).toBeUndefined() // yawD not in metadata
  })

  it('returns new array, does not mutate input', () => {
    const meta = makeMetadata({ rollP: 45 })
    const changes: ParameterChange[] = [
      { parameter: 'pidPGain', recommendedChange: '+0.3', axis: 'roll', explanation: 'a' },
    ]
    const results = populateCurrentValues(changes, meta)
    expect(results).not.toBe(changes)
    expect(changes[0].currentValue).toBeUndefined()
  })
})

describe('isRpmFilterEnabled', () => {
  it('returns true when harmonics >= 1', () => {
    expect(isRpmFilterEnabled(makeMetadata(undefined, { rpmFilterHarmonics: 3 }))).toBe(true)
    expect(isRpmFilterEnabled(makeMetadata(undefined, { rpmFilterHarmonics: 1 }))).toBe(true)
  })

  it('returns false when harmonics is 0', () => {
    expect(isRpmFilterEnabled(makeMetadata(undefined, { rpmFilterHarmonics: 0 }))).toBe(false)
  })

  it('returns false when filter settings absent', () => {
    expect(isRpmFilterEnabled(makeMetadata())).toBe(false)
  })
})

describe('isDGainZero', () => {
  it('returns true when D is 0', () => {
    expect(isDGainZero(makeMetadata({ rollD: 0 }), 'roll')).toBe(true)
  })

  it('returns false when D is nonzero', () => {
    expect(isDGainZero(makeMetadata({ rollD: 28 }), 'roll')).toBe(false)
  })

  it('returns false when D is not in metadata', () => {
    expect(isDGainZero(makeMetadata(), 'roll')).toBe(false)
  })
})

describe('isFFZero', () => {
  it('returns true when FF is 0', () => {
    expect(isFFZero(makeMetadata({ rollFF: 0 }), 'roll')).toBe(true)
  })

  it('returns false when FF is nonzero', () => {
    expect(isFFZero(makeMetadata({ rollFF: 100 }), 'roll')).toBe(false)
  })

  it('returns false when FF is not in metadata', () => {
    expect(isFFZero(makeMetadata(), 'roll')).toBe(false)
  })
})
