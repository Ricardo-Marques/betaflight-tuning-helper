import { Recommendation, ParameterChange, BetaflightParameter, Axis } from '../types/Analysis'
import { PidProfile, FilterSettings } from '../types/LogFrame'

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
}

/**
 * Parse a recommendedChange string and compute the new value
 * Returns [newValue, isResolved] where isResolved=false means we couldn't compute
 */
function resolveChange(
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
function getPidValue(
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
function getGlobalValue(
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
    default:
      return undefined
  }
}

/**
 * Generate a CLI set command for a single parameter change
 */
function generateSetCommand(
  change: ParameterChange,
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings
): string {
  const { parameter, axis, recommendedChange } = change

  const isPerAxisPid = parameter in PER_AXIS_PARAMS

  if (isPerAxisPid) {
    const mapping = PER_AXIS_PARAMS[parameter]
    const axes: Axis[] = axis ? [axis] : ['roll', 'pitch', 'yaw']
    const lines: string[] = []

    for (const a of axes) {
      const cliName = `${mapping.cliPrefix}_${a}`
      const currentValue = change.currentValue ?? getPidValue(pidProfile, parameter, a)
      const [newValue, resolved] = resolveChange(recommendedChange, currentValue, true)

      if (resolved && newValue !== null) {
        lines.push(`set ${cliName} = ${newValue}`)
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

  const currentValue = change.currentValue ?? getGlobalValue(parameter, pidProfile, filterSettings)
  const [newValue, resolved] = resolveChange(recommendedChange, currentValue, false)

  if (resolved && newValue !== null) {
    return `set ${cliName} = ${newValue}`
  }

  return `# ${parameter}: ${recommendedChange} (current value unknown)`
}

/**
 * Generate Betaflight CLI commands from analysis recommendations
 */
export function generateCliCommands(
  recommendations: Recommendation[],
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings
): string {
  const lines: string[] = [
    '# Betaflight Tuning Helper - CLI Commands',
    '# Paste these commands into the Betaflight CLI tab',
    '',
  ]

  for (const rec of recommendations) {
    lines.push(`# Recommendation: ${rec.title}`)

    for (const change of rec.changes) {
      lines.push(generateSetCommand(change, pidProfile, filterSettings))
    }

    lines.push('')
  }

  lines.push('save')

  return lines.join('\n')
}
