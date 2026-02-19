import { describe, it, expect } from 'vitest'
import { loadTestBflLog } from '../test-helpers'
import { RuleEngine } from '../engine/RuleEngine'
import {
  resolveChange,
  getCliName,
  isNoOpChange,
  generateCliCommands,
} from './CliExport'
import type { ParameterChange, Axis } from '../types/Analysis'
import type { PidProfile, FilterSettings } from '../types/LogFrame'

describe('resolveChange', () => {
  describe('percentage changes', () => {
    it('applies positive percentage', () => {
      expect(resolveChange('+5%', 100, false)).toEqual([105, true])
    })

    it('applies negative percentage', () => {
      expect(resolveChange('-10%', 200, false)).toEqual([180, true])
    })

    it('rounds result to integer', () => {
      expect(resolveChange('+5%', 33, false)).toEqual([35, true])
    })

    it('returns null when current value is unknown', () => {
      expect(resolveChange('+5%', undefined, false)).toEqual([null, false])
    })
  })

  describe('relative changes — per-axis PID', () => {
    it('scales current value by relative factor', () => {
      // +0.3 means +30% for PID params: 45 * (1 + 0.3) = 58.5 → 59
      expect(resolveChange('+0.3', 45, true)).toEqual([59, true])
    })

    it('scales down with negative factor', () => {
      // -0.2 means -20%: 50 * (1 - 0.2) = 40
      expect(resolveChange('-0.2', 50, true)).toEqual([40, true])
    })

    it('returns null when current value is unknown', () => {
      expect(resolveChange('+0.3', undefined, true)).toEqual([null, false])
    })
  })

  describe('relative changes — global (additive)', () => {
    it('adds to current value', () => {
      expect(resolveChange('+10', 65, false)).toEqual([75, true])
    })

    it('subtracts from current value', () => {
      expect(resolveChange('-50', 200, false)).toEqual([150, true])
    })

    it('returns null when current value is unknown', () => {
      expect(resolveChange('+10', undefined, false)).toEqual([null, false])
    })
  })

  describe('absolute values', () => {
    it('returns absolute value regardless of current', () => {
      expect(resolveChange('32', 100, false)).toEqual([32, true])
    })

    it('works without current value', () => {
      expect(resolveChange('32', undefined, false)).toEqual([32, true])
    })

    it('rounds decimal absolute values', () => {
      expect(resolveChange('3.7', undefined, false)).toEqual([4, true])
    })
  })

  describe('unparseable input', () => {
    it('returns null for garbage input', () => {
      expect(resolveChange('abc', 100, false)).toEqual([null, false])
    })
  })
})

describe('getCliName', () => {
  describe('per-axis PID parameters', () => {
    it('maps pidPGain + roll', () => {
      expect(getCliName('pidPGain', 'roll')).toBe('p_roll')
    })

    it('maps pidDGain + pitch', () => {
      expect(getCliName('pidDGain', 'pitch')).toBe('d_pitch')
    })

    it('maps pidIGain + yaw', () => {
      expect(getCliName('pidIGain', 'yaw')).toBe('i_yaw')
    })

    it('maps pidFeedforward + roll', () => {
      expect(getCliName('pidFeedforward', 'roll')).toBe('f_roll')
    })

    it('maps pidDMinGain + pitch', () => {
      expect(getCliName('pidDMinGain', 'pitch')).toBe('d_min_pitch')
    })
  })

  describe('global parameters', () => {
    it('maps gyroFilterMultiplier', () => {
      expect(getCliName('gyroFilterMultiplier')).toBe('simplified_gyro_filter_multiplier')
    })

    it('maps dynamicIdle', () => {
      expect(getCliName('dynamicIdle')).toBe('dshot_idle_value')
    })

    it('maps dtermFilterMultiplier', () => {
      expect(getCliName('dtermFilterMultiplier')).toBe('simplified_dterm_filter_multiplier')
    })

    it('maps pidMasterMultiplier', () => {
      expect(getCliName('pidMasterMultiplier')).toBe('simplified_master_multiplier')
    })

    it('maps dynamicNotchCount', () => {
      expect(getCliName('dynamicNotchCount')).toBe('dyn_notch_count')
    })

    it('maps tpaRate', () => {
      expect(getCliName('tpaRate')).toBe('tpa_rate')
    })

    it('maps tpaBreakpoint', () => {
      expect(getCliName('tpaBreakpoint')).toBe('tpa_breakpoint')
    })

    it('maps itermRelaxCutoff', () => {
      expect(getCliName('itermRelaxCutoff')).toBe('iterm_relax_cutoff')
    })
  })
})

describe('isNoOpChange', () => {
  const pidProfile: PidProfile = {
    rollP: 45, rollI: 80, rollD: 40,
    pitchP: 47, pitchI: 84, pitchD: 46,
    yawP: 45, yawI: 80, yawD: 0,
    rollFF: 120, pitchFF: 125, yawFF: 120,
  }

  const filterSettings: FilterSettings = {
    gyroFilterMultiplier: 100,
    dtermFilterMultiplier: 100,
    dynamicNotchCount: 3,
    itermRelaxCutoff: 15,
  }

  it('detects no-op when resolved value equals current value', () => {
    const change: ParameterChange = {
      parameter: 'gyroFilterMultiplier',
      currentValue: 100,
      recommendedChange: '+0',
      explanation: 'test',
    }
    expect(isNoOpChange(change, pidProfile, filterSettings)).toBe(true)
  })

  it('is not a no-op when current value is unknown', () => {
    const change: ParameterChange = {
      parameter: 'gyroFilterMultiplier',
      recommendedChange: '+5',
      explanation: 'test',
    }
    // No currentValue, no matching filter setting, no importedValues
    expect(isNoOpChange(change, undefined, undefined)).toBe(false)
  })

  it('detects no-op for per-axis parameter without specific axis (all 3 match)', () => {
    const change: ParameterChange = {
      parameter: 'pidPGain',
      recommendedChange: '+0',
      explanation: 'test',
    }
    expect(isNoOpChange(change, pidProfile, filterSettings)).toBe(true)
  })

  it('is not a no-op when any axis differs', () => {
    const change: ParameterChange = {
      parameter: 'pidPGain',
      recommendedChange: '+0.1',
      explanation: 'test',
    }
    expect(isNoOpChange(change, pidProfile, filterSettings)).toBe(false)
  })

  it('detects no-op for per-axis with specific axis', () => {
    const change: ParameterChange = {
      parameter: 'pidPGain',
      axis: 'roll' as Axis,
      currentValue: 45,
      recommendedChange: '+0',
      explanation: 'test',
    }
    expect(isNoOpChange(change, pidProfile, filterSettings)).toBe(true)
  })
})

describe('generateCliCommands', () => {
  const pidProfile: PidProfile = {
    rollP: 45, rollI: 80, rollD: 40,
    pitchP: 47, pitchI: 84, pitchD: 46,
    yawP: 45, yawI: 80, yawD: 0,
  }

  const filterSettings: FilterSettings = {
    gyroFilterMultiplier: 100,
    dtermFilterMultiplier: 100,
  }

  it('produces valid set commands', () => {
    const output = generateCliCommands(
      [{
        id: 'rec-1',
        issueId: 'issue-1',
        type: 'adjustFiltering',
        priority: 5,
        confidence: 0.8,
        title: 'Test',
        description: 'test',
        rationale: 'test',
        risks: [],
        changes: [{
          parameter: 'gyroFilterMultiplier',
          currentValue: 100,
          recommendedChange: '+10',
          explanation: 'increase filtering',
        }],
        expectedImprovement: 'better',
      }],
      pidProfile,
      filterSettings,
    )

    const setLines = output.split('\n').filter(l => l.startsWith('set '))
    expect(setLines.length).toBeGreaterThan(0)

    for (const line of setLines) {
      expect(line).toMatch(/^set \w+ = \d+$/)
    }
  })

  it('skips no-op recommendations', () => {
    const output = generateCliCommands(
      [{
        id: 'rec-1',
        issueId: 'issue-1',
        type: 'adjustFiltering',
        priority: 5,
        confidence: 0.8,
        title: 'No-op',
        description: 'test',
        rationale: 'test',
        risks: [],
        changes: [{
          parameter: 'gyroFilterMultiplier',
          currentValue: 100,
          recommendedChange: '+0',
          explanation: 'no change',
        }],
        expectedImprovement: 'none',
      }],
      pidProfile,
      filterSettings,
    )

    const setLines = output.split('\n').filter(l => l.startsWith('set '))
    expect(setLines.length).toBe(0)
  })

  it('ends with save', () => {
    const output = generateCliCommands([], pidProfile, filterSettings)
    const lines = output.split('\n').filter(l => l.trim() !== '')
    expect(lines[lines.length - 1]).toBe('save')
  })

  it('comments out unknown current values', () => {
    const output = generateCliCommands(
      [{
        id: 'rec-1',
        issueId: 'issue-1',
        type: 'adjustFiltering',
        priority: 5,
        confidence: 0.8,
        title: 'Unknown',
        description: 'test',
        rationale: 'test',
        risks: [],
        changes: [{
          parameter: 'gyroFilterMultiplier',
          recommendedChange: '+10',
          explanation: 'increase',
        }],
        expectedImprovement: 'better',
      }],
      undefined,
      undefined,
    )

    const commentLines = output.split('\n').filter(l => l.includes('current value unknown'))
    expect(commentLines.length).toBeGreaterThan(0)
    for (const line of commentLines) {
      expect(line.startsWith('#')).toBe(true)
    }
  })

  describe('integration: real analysis → CLI', () => {
    it('generates valid CLI from real flight data', () => {
      const { frames, metadata } = loadTestBflLog()
      const engine = new RuleEngine()
      const result = engine.analyzeLog(frames, metadata)

      const output = generateCliCommands(
        result.recommendations,
        metadata.pidProfile,
        metadata.filterSettings,
      )

      const lines = output.split('\n')

      // Starts with header comment
      expect(lines[0]).toMatch(/^# Betaflight/)

      // Ends with save
      const nonEmptyLines = lines.filter(l => l.trim() !== '')
      expect(nonEmptyLines[nonEmptyLines.length - 1]).toBe('save')

      // All set lines have valid parameter names and integer values
      const setLines = lines.filter(l => l.startsWith('set '))
      for (const line of setLines) {
        expect(line).toMatch(/^set [\w_]+ = -?\d+$/)
      }
    })
  })
})
