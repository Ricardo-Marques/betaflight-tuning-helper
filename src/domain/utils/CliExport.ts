import { Recommendation, ParameterChange, BetaflightParameter, Axis } from '../types/Analysis'
import { PidProfile, FilterSettings } from '../types/LogFrame'
import { CLI_OPTIONS } from '../../lib/betaflight/cliOptions'

/**
 * Maps BetaflightParameter to CLI command patterns
 */
const PER_AXIS_PARAMS: Record<string, { cliPrefix: string; profileField: (axis: Axis) => string }> = {
  pidPGain: { cliPrefix: 'p', profileField: (a) => `${a}P` },
  pidIGain: { cliPrefix: 'i', profileField: (a) => `${a}I` },
  pidDGain: { cliPrefix: 'd', profileField: (a) => `${a}D` },
  pidDMinGain: { cliPrefix: 'd_min', profileField: (a) => `${a}Dmin` },
  pidFeedforward: { cliPrefix: 'f', profileField: (a) => `${a}FF` },
}

const GLOBAL_PARAM_MAP: Partial<Record<BetaflightParameter, string>> = {
  pidMasterMultiplier: 'simplified_master_multiplier',
  gyroFilterMultiplier: 'simplified_gyro_filter_multiplier',
  dtermFilterMultiplier: 'simplified_dterm_filter_multiplier',
  dynamicNotchCount: 'dyn_notch_count',
  dynamicNotchQ: 'dyn_notch_q',
  dynamicNotchMinHz: 'dyn_notch_min_hz',
  dynamicNotchMaxHz: 'dyn_notch_max_hz',
  rpmFilterHarmonics: 'rpm_filter_harmonics',
  rpmFilterMinHz: 'rpm_filter_min_hz',
  dynamicIdle: 'dshot_idle_value',
  tpaRate: 'tpa_rate',
  tpaBreakpoint: 'tpa_breakpoint',
  itermRelaxCutoff: 'iterm_relax_cutoff',
}

/**
 * Human-readable display names for Betaflight parameters
 */
export const PARAMETER_DISPLAY_NAMES: Record<BetaflightParameter, string> = {
  pidMasterMultiplier: 'Master Multiplier',
  pidPGain: 'P Gain',
  pidIGain: 'I Gain',
  pidDGain: 'D Gain',
  pidDMinGain: 'D Min',
  pidFeedforward: 'Feedforward',
  gyroFilterMultiplier: 'Gyro Filter',
  dtermFilterMultiplier: 'D-term Filter',
  dynamicNotchCount: 'Dyn Notch Count',
  dynamicNotchQ: 'Dyn Notch Q',
  dynamicNotchMinHz: 'Dyn Notch Min',
  dynamicNotchMaxHz: 'Dyn Notch Max',
  rpmFilterHarmonics: 'RPM Harmonics',
  rpmFilterMinHz: 'RPM Min Hz',
  dynamicIdle: 'Dynamic Idle',
  tpaRate: 'TPA Rate',
  tpaBreakpoint: 'TPA Breakpoint',
  itermRelaxCutoff: 'I-term Relax Cutoff',
}

/**
 * Get the CLI parameter name for a BetaflightParameter + axis combo
 */
export function getCliName(parameter: BetaflightParameter, axis?: Axis): string {
  const perAxis = PER_AXIS_PARAMS[parameter]
  if (perAxis && axis) {
    return `${perAxis.cliPrefix}_${axis}`
  }
  return GLOBAL_PARAM_MAP[parameter] ?? parameter
}

/**
 * Parse a recommendedChange string and compute the new value
 * Returns [newValue, isResolved] where isResolved=false means we couldn't compute
 */
export function resolveChange(
  recommendedChange: string,
  currentValue: number | undefined,
  isPerAxisPid: boolean
): [number | null, boolean] {
  const trimmed = recommendedChange.trim()

  // Percentage change: "+5%", "-10%"
  const pctMatch = trimmed.match(/^([+-])(\d+(?:\.\d+)?)%$/)
  if (pctMatch) {
    if (currentValue === undefined) return [null, false]
    const sign = pctMatch[1] === '+' ? 1 : -1
    const pct = parseFloat(pctMatch[2])
    return [Math.round(currentValue * (1 + sign * pct / 100)), true]
  }

  // Relative change: "+0.3", "-0.2", "+10", "-50"
  const relMatch = trimmed.match(/^([+-])(\d+(?:\.\d+)?)$/)
  if (relMatch) {
    const sign = relMatch[1] === '+' ? 1 : -1
    const delta = parseFloat(relMatch[2])

    if (isPerAxisPid) {
      // For PID params, relative means scale (e.g. +0.3 = +30%)
      if (currentValue === undefined) return [null, false]
      return [Math.round(currentValue * (1 + sign * delta)), true]
    } else {
      // For non-PID params, relative means additive
      if (currentValue === undefined) return [null, false]
      return [Math.round(currentValue + sign * delta), true]
    }
  }

  // Absolute value: "32", "3", "2"
  const absMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/)
  if (absMatch) {
    return [Math.round(parseFloat(absMatch[1])), true]
  }

  return [null, false]
}

/**
 * Look up the current PID value from the profile
 */
export function getPidValue(
  pidProfile: PidProfile | undefined,
  parameter: BetaflightParameter,
  axis: Axis | undefined
): number | undefined {
  if (!pidProfile || !axis) return undefined

  const mapping = PER_AXIS_PARAMS[parameter]
  if (!mapping) return undefined

  const fieldName = mapping.profileField(axis)
  return (pidProfile as Record<string, number | undefined>)[fieldName]
}

/**
 * Look up current value for a global parameter from profile/filter settings
 */
export function getGlobalValue(
  parameter: BetaflightParameter,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings
): number | undefined {
  switch (parameter) {
    case 'pidMasterMultiplier':
      return pidProfile?.masterMultiplier
    case 'tpaRate':
      return pidProfile?.tpaRate
    case 'tpaBreakpoint':
      return pidProfile?.tpaBreakpoint
    case 'dynamicIdle':
      return pidProfile?.dynamicIdle
    case 'dynamicNotchCount':
      return filterSettings?.dynamicNotchCount
    case 'dynamicNotchQ':
      return filterSettings?.dynamicNotchQ
    case 'dynamicNotchMinHz':
      return filterSettings?.dynamicNotchMinHz
    case 'dynamicNotchMaxHz':
      return filterSettings?.dynamicNotchMaxHz
    case 'rpmFilterHarmonics':
      return filterSettings?.rpmFilterHarmonics
    case 'rpmFilterMinHz':
      return filterSettings?.rpmFilterMinHz
    case 'gyroFilterMultiplier':
      return filterSettings?.gyroFilterMultiplier
    case 'dtermFilterMultiplier':
      return filterSettings?.dtermFilterMultiplier
    case 'itermRelaxCutoff':
      return filterSettings?.itermRelaxCutoff
    default:
      return undefined
  }
}

/**
 * Clamp a resolved value to the CLI_OPTIONS range for the given parameter name.
 * Returns the clamped value, or the original if no range is defined.
 */
function clampToRange(cliName: string, value: number): number {
  const option = CLI_OPTIONS[cliName]
  if (option && option.type === 'range') {
    return Math.max(option.min, Math.min(option.max, value))
  }
  return value
}

/**
 * Generate a CLI set command for a single parameter change
 */
function generateSetCommand(
  change: ParameterChange,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): string {
  const { parameter, axis, recommendedChange } = change

  const isPerAxisPid = parameter in PER_AXIS_PARAMS

  if (isPerAxisPid) {
    const mapping = PER_AXIS_PARAMS[parameter]
    const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']
    const lines: string[] = []

    for (const a of axes) {
      const cliName = `${mapping.cliPrefix}_${a}`
      const currentValue = change.currentValue
        ?? getPidValue(pidProfile, parameter, a)
        ?? importedValues?.get(cliName)
      const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, true)

      if (resolved && rawValue !== null) {
        lines.push(`set ${cliName} = ${clampToRange(cliName, rawValue)}`)
      } else {
        lines.push(`# ${parameter}[${a}]: ${recommendedChange} (current value unknown)`)
      }
    }

    return lines.join('\n')
  }

  // Global parameter
  const cliName = GLOBAL_PARAM_MAP[parameter]
  if (!cliName) {
    return `# ${parameter}: ${recommendedChange} (unknown CLI mapping)`
  }

  const currentValue = change.currentValue
    ?? getGlobalValue(parameter, pidProfile, filterSettings)
    ?? importedValues?.get(cliName)
  const [rawValue, resolved] = resolveChange(recommendedChange, currentValue, false)

  if (resolved && rawValue !== null) {
    return `set ${cliName} = ${clampToRange(cliName, rawValue)}`
  }

  return `# ${parameter}: ${recommendedChange} (current value unknown)`
}

/**
 * Resolve all recommendation changes to a map of CLI parameter name → new value.
 * Used by "Accept Tune" to treat recommended values as the new current settings.
 */
export function resolveAllChanges(
  recommendations: Recommendation[],
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): Map<string, number> {
  const resolved = new Map<string, number>()

  for (const rec of recommendations) {
    for (const change of rec.changes) {
      const { parameter, axis, recommendedChange } = change
      const isPerAxisPid = parameter in PER_AXIS_PARAMS

      if (isPerAxisPid) {
        const mapping = PER_AXIS_PARAMS[parameter]
        const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']
        for (const a of axes) {
          const cliName = `${mapping.cliPrefix}_${a}`
          const currentValue = change.currentValue
            ?? getPidValue(pidProfile, parameter, a)
            ?? importedValues?.get(cliName)
          const [rawValue, ok] = resolveChange(recommendedChange, currentValue, true)
          if (ok && rawValue !== null) {
            resolved.set(cliName, clampToRange(cliName, rawValue))
          }
        }
      } else {
        const cliName = GLOBAL_PARAM_MAP[parameter]
        if (!cliName) continue
        const currentValue = change.currentValue
          ?? getGlobalValue(parameter, pidProfile, filterSettings)
          ?? importedValues?.get(cliName)
        const [rawValue, ok] = resolveChange(recommendedChange, currentValue, false)
        if (ok && rawValue !== null) {
          resolved.set(cliName, clampToRange(cliName, rawValue))
        }
      }
    }
  }

  return resolved
}

/**
 * Generate Betaflight CLI commands from analysis recommendations
 */
export function generateCliCommands(
  recommendations: Recommendation[],
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
  importedValues?: Map<string, number>
): string {
  const lines: string[] = [
    '# Betaflight Tuning Helper - CLI Commands',
    '# Paste these commands into the Betaflight CLI tab',
    '',
  ]

  for (const rec of recommendations) {
    lines.push(`# Recommendation: ${rec.title}`)

    for (const change of rec.changes) {
      lines.push(generateSetCommand(change, pidProfile, filterSettings, importedValues))
    }

    lines.push('')
  }

  lines.push('save')

  return lines.join('\n')
}
