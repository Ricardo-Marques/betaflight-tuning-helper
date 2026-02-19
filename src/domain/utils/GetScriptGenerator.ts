import { Recommendation, Axis } from '../types/Analysis'
import { PidProfile, FilterSettings } from '../types/LogFrame'
import { getCliName, getPidValue, getGlobalValue } from './CliExport'

const PER_AXIS_PARAMS = new Set([
  'pidPGain', 'pidIGain', 'pidDGain', 'pidDMinGain', 'pidFeedforward',
])

const ALL_AXES: Axis[] = ['roll', 'pitch', 'yaw']

/**
 * Generate a `get` script listing every CLI parameter that the recommendations
 * reference but that isn't already known from the blackbox log metadata.
 * Previously imported values are NOT excluded - the script always asks for
 * any parameter the log doesn't provide so the user can refresh them.
 */
export function generateGetScript(
  recommendations: Recommendation[],
  pidProfile?: PidProfile,
  filterSettings?: FilterSettings,
): string {
  const needed = new Set<string>()

  for (const rec of recommendations) {
    for (const change of rec.changes) {
      const { parameter, axis } = change

      if (PER_AXIS_PARAMS.has(parameter)) {
        const axes = axis ? [axis] : ALL_AXES
        for (const a of axes) {
          const fromLog = change.currentValue ?? getPidValue(pidProfile, parameter, a)
          if (fromLog === undefined) {
            needed.add(getCliName(parameter, a))
          }
        }
      } else {
        const fromLog = change.currentValue ?? getGlobalValue(parameter, pidProfile, filterSettings)
        if (fromLog === undefined) {
          needed.add(getCliName(parameter))
        }
      }
    }
  }

  if (needed.size === 0) return ''

  const lines = [
    '# Paste into Betaflight CLI, then copy the output back',
    '',
    ...Array.from(needed).sort().map(name => `get ${name}`),
  ]

  return lines.join('\n')
}
