import { ParameterChange, BetaflightParameter, Axis } from '../types/Analysis'
import { LogMetadata } from '../types/LogFrame'
import { getPidValue, getGlobalValue } from './CliExport'

/**
 * Look up the current value of any BetaflightParameter from log metadata.
 * Delegates to getPidValue for per-axis PID params and getGlobalValue for everything else.
 */
export function lookupCurrentValue(
  parameter: BetaflightParameter,
  metadata: LogMetadata,
  axis?: Axis
): number | undefined {
  const pidValue = getPidValue(metadata.pidProfile, parameter, axis)
  if (pidValue !== undefined) return pidValue
  return getGlobalValue(parameter, metadata.pidProfile, metadata.filterSettings)
}

/**
 * Returns a new ParameterChange with `currentValue` populated from metadata.
 * If the change already has a currentValue, it is preserved.
 */
export function withCurrentValue(
  change: ParameterChange,
  metadata: LogMetadata
): ParameterChange {
  if (change.currentValue !== undefined) return change
  const current = lookupCurrentValue(change.parameter, metadata, change.axis)
  if (current === undefined) return change
  return { ...change, currentValue: current }
}

/**
 * Batch version of withCurrentValue — returns a new array with currentValue populated on each change.
 */
export function populateCurrentValues(
  changes: ParameterChange[],
  metadata: LogMetadata
): ParameterChange[] {
  return changes.map(c => withCurrentValue(c, metadata))
}

// ---------------------------------------------------------------------------
// Convenience checks for common setting queries
// ---------------------------------------------------------------------------

/** True when the RPM filter is enabled (harmonics >= 1) */
export function isRpmFilterEnabled(metadata: LogMetadata): boolean {
  const h = metadata.filterSettings?.rpmFilterHarmonics
  return h !== undefined && h >= 1
}

/** True when D gain is zero for the given axis */
export function isDGainZero(metadata: LogMetadata, axis: Axis): boolean {
  const d = getPidValue(metadata.pidProfile, 'pidDGain', axis)
  return d !== undefined && d === 0
}

/** True when feedforward is zero for the given axis */
export function isFFZero(metadata: LogMetadata, axis: Axis): boolean {
  const ff = getPidValue(metadata.pidProfile, 'pidFeedforward', axis)
  return ff !== undefined && ff === 0
}
