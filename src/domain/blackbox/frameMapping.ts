/**
 * Frame mapping - converts decoded field arrays into LogFrame/LogMetadata interfaces.
 *
 * This bridges the raw parser output to the existing domain types used by the rest of the app.
 */
import type { LogFrame, LogMetadata, PidProfile, FilterSettings } from '../types/LogFrame.ts'
import type { BblHeaders } from './types.ts'
import type { DecodedFrame } from './FrameDecoder.ts'

/**
 * Build a name→index lookup map from field definitions.
 */
function buildFieldIndex(headers: BblHeaders): Map<string, number> {
  const map = new Map<string, number>()
  for (const def of headers.iFieldDefs) {
    map.set(def.name, def.index)
  }
  return map
}

/**
 * Get a field value by name from decoded values, with a default fallback.
 */
function getField(values: number[], fieldIndex: Map<string, number>, name: string, defaultValue = 0): number {
  const idx = fieldIndex.get(name)
  if (idx === undefined) return defaultValue
  return values[idx] ?? defaultValue
}

/**
 * Convert a decoded frame to a LogFrame.
 */
export function toLogFrame(
  frame: DecodedFrame,
  fieldIndex: Map<string, number>,
  frameNumber: number,
): LogFrame {
  const v = frame.values

  const motorValues: number[] = []
  for (let i = 0; i < 8; i++) {
    const idx = fieldIndex.get(`motor[${i}]`)
    if (idx === undefined) break
    motorValues.push(v[idx] ?? 1000)
  }
  if (motorValues.length === 0) {
    motorValues.push(1000, 1000, 1000, 1000)
  }

  const throttle = getField(v, fieldIndex, 'rcCommand[3]', 1000)

  // Try setpoint fields first, then rcCommand (older firmware)
  const setpointRoll = getField(v, fieldIndex, 'setpoint[0]') || getField(v, fieldIndex, 'rcCommand[0]')
  const setpointPitch = getField(v, fieldIndex, 'setpoint[1]') || getField(v, fieldIndex, 'rcCommand[1]')
  const setpointYaw = getField(v, fieldIndex, 'setpoint[2]') || getField(v, fieldIndex, 'rcCommand[2]')

  // PID sum: try axisSum first, then compute from components
  const pidSumRoll = getField(v, fieldIndex, 'axisSum[0]') ||
    (getField(v, fieldIndex, 'axisP[0]') + getField(v, fieldIndex, 'axisI[0]') + getField(v, fieldIndex, 'axisD[0]'))
  const pidSumPitch = getField(v, fieldIndex, 'axisSum[1]') ||
    (getField(v, fieldIndex, 'axisP[1]') + getField(v, fieldIndex, 'axisI[1]') + getField(v, fieldIndex, 'axisD[1]'))
  const pidSumYaw = getField(v, fieldIndex, 'axisSum[2]') ||
    (getField(v, fieldIndex, 'axisP[2]') + getField(v, fieldIndex, 'axisI[2]') + getField(v, fieldIndex, 'axisD[2]'))

  // Debug values
  let debug: number[] | undefined
  const debugIdx0 = fieldIndex.get('debug[0]')
  if (debugIdx0 !== undefined) {
    debug = []
    for (let i = 0; i < 8; i++) {
      const idx = fieldIndex.get(`debug[${i}]`)
      if (idx === undefined) break
      debug.push(v[idx] ?? 0)
    }
  }

  const logFrame: LogFrame = {
    time: getField(v, fieldIndex, 'time', frameNumber * 125),
    loopIteration: getField(v, fieldIndex, 'loopIteration', frameNumber),

    gyroADC: {
      roll: getField(v, fieldIndex, 'gyroADC[0]'),
      pitch: getField(v, fieldIndex, 'gyroADC[1]'),
      yaw: getField(v, fieldIndex, 'gyroADC[2]'),
    },

    setpoint: {
      roll: setpointRoll,
      pitch: setpointPitch,
      yaw: setpointYaw,
    },

    pidP: {
      roll: getField(v, fieldIndex, 'axisP[0]'),
      pitch: getField(v, fieldIndex, 'axisP[1]'),
      yaw: getField(v, fieldIndex, 'axisP[2]'),
    },

    pidI: {
      roll: getField(v, fieldIndex, 'axisI[0]'),
      pitch: getField(v, fieldIndex, 'axisI[1]'),
      yaw: getField(v, fieldIndex, 'axisI[2]'),
    },

    pidD: {
      roll: getField(v, fieldIndex, 'axisD[0]'),
      pitch: getField(v, fieldIndex, 'axisD[1]'),
      yaw: getField(v, fieldIndex, 'axisD[2]'),
    },

    pidSum: {
      roll: pidSumRoll,
      pitch: pidSumPitch,
      yaw: pidSumYaw,
    },

    motor: motorValues,

    rcCommand: {
      roll: getField(v, fieldIndex, 'rcCommand[0]'),
      pitch: getField(v, fieldIndex, 'rcCommand[1]'),
      yaw: getField(v, fieldIndex, 'rcCommand[2]'),
      throttle,
    },

    throttle,
  }

  if (debug) {
    logFrame.debug = debug
  }

  const flightModeFlags = fieldIndex.get('flightModeFlags')
  if (flightModeFlags !== undefined) {
    logFrame.flightModeFlags = v[flightModeFlags] ?? 0
  }

  const stateFlags = fieldIndex.get('stateFlags')
  if (stateFlags !== undefined) {
    logFrame.stateFlags = v[stateFlags] ?? 0
  }

  return logFrame
}

/**
 * Convert BBL headers into LogMetadata.
 */
export function toLogMetadata(
  headers: BblHeaders,
  frameCount: number,
  durationSeconds: number,
): LogMetadata {
  const h = headers.headerMap

  const firmwareType = h.get('Firmware type') ?? 'Betaflight'
  const firmwareVersion = h.get('Firmware revision') ?? h.get('Firmware version') ?? 'Unknown'
  const firmwareRevision = h.get('Firmware date') ?? undefined

  const looptime = parseInt(h.get('looptime') ?? '125') || 125
  const frameIntervalPDenom = parseInt(
    h.get('frameIntervalPDenom') ?? h.get('P interval') ?? '1'
  ) || 1
  const effectiveLooptime = looptime * frameIntervalPDenom

  const fieldNames = headers.iFieldDefs.map(d => d.name)

  const motorCount = fieldNames.filter(f => f.startsWith('motor[')).length || 4
  const craftName = h.get('Craft name') ?? undefined
  const debugMode = h.get('debug_mode') ?? undefined

  const pidProfile = extractPidProfile(h)
  const filterSettings = extractFilterSettings(h)

  return {
    firmwareVersion,
    firmwareType,
    firmwareRevision,
    looptime: 1_000_000 / effectiveLooptime,
    gyroRate: 1_000_000 / looptime,
    motorCount,
    fieldNames,
    debugMode,
    craftName,
    pidProfile,
    filterSettings,
    frameCount,
    duration: durationSeconds,
  }
}

/**
 * Build the fieldIndex map (exported for use by BblParser).
 */
export { buildFieldIndex }

function extractPidProfile(h: Map<string, string>): PidProfile | undefined {
  // PID values are stored as "rollPID" or individual "p_roll" etc.
  const rollPID = h.get('rollPID')
  const pitchPID = h.get('pitchPID')
  const yawPID = h.get('yawPID')

  if (!rollPID && !pitchPID) return undefined

  const parsePID = (s: string | undefined): [number, number, number] => {
    if (!s) return [0, 0, 0]
    const parts = s.split(',').map(v => parseInt(v.trim()) || 0)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }

  const [rollP, rollI, rollD] = parsePID(rollPID)
  const [pitchP, pitchI, pitchD] = parsePID(pitchPID)
  const [yawP, yawI, yawD] = parsePID(yawPID)

  const tpaRate = parseInt(h.get('tpa_rate') ?? '0') || undefined
  const tpaBreakpoint = parseInt(h.get('tpa_breakpoint') ?? '0') || undefined
  const dynamicIdle = parseInt(h.get('dynamic_idle_min_rpm') ?? '0') || undefined

  // D_min values
  const dMinRoll = parseInt(h.get('d_min_roll') ?? '0') || undefined
  const dMinPitch = parseInt(h.get('d_min_pitch') ?? '0') || undefined
  const dMinYaw = parseInt(h.get('d_min_yaw') ?? '0') || undefined

  // Feedforward
  const ffRoll = parseInt(h.get('feedforward_roll') ?? '0') || undefined
  const ffPitch = parseInt(h.get('feedforward_pitch') ?? '0') || undefined
  const ffYaw = parseInt(h.get('feedforward_yaw') ?? '0') || undefined

  const masterMultiplier = parseInt(h.get('simplified_master_multiplier') ?? '0') || undefined

  return {
    rollP, rollI, rollD,
    pitchP, pitchI, pitchD,
    yawP, yawI, yawD,
    rollDmin: dMinRoll,
    pitchDmin: dMinPitch,
    yawDmin: dMinYaw,
    rollFF: ffRoll,
    pitchFF: ffPitch,
    yawFF: ffYaw,
    tpaRate,
    tpaBreakpoint,
    dynamicIdle,
    masterMultiplier,
  }
}

function extractFilterSettings(h: Map<string, string>): FilterSettings | undefined {
  const gyroLpf1Cutoff = parseInt(h.get('gyro_lpf1_static_hz') ?? h.get('gyro_lowpass_hz') ?? '0') || undefined
  const gyroLpf2Cutoff = parseInt(h.get('gyro_lpf2_static_hz') ?? h.get('gyro_lowpass2_hz') ?? '0') || undefined
  const dtermLpf1Cutoff = parseInt(h.get('dterm_lpf1_static_hz') ?? h.get('dterm_lowpass_hz') ?? '0') || undefined
  const dtermLpf2Cutoff = parseInt(h.get('dterm_lpf2_static_hz') ?? h.get('dterm_lowpass2_hz') ?? '0') || undefined

  const dynamicNotchCount = parseInt(h.get('dyn_notch_count') ?? '0') || undefined
  const dynamicNotchQ = parseInt(h.get('dyn_notch_q') ?? '0') || undefined
  const dynamicNotchMinHz = parseInt(h.get('dyn_notch_min_hz') ?? '0') || undefined
  const dynamicNotchMaxHz = parseInt(h.get('dyn_notch_max_hz') ?? '0') || undefined

  const rpmFilterHarmonics = parseInt(h.get('rpm_filter_harmonics') ?? '0') || undefined
  const rpmFilterMinHz = parseInt(h.get('rpm_filter_min_hz') ?? '0') || undefined
  const rpmFilterQ = parseInt(h.get('rpm_filter_q') ?? '0') || undefined

  const gyroLpf1Type = h.get('gyro_lpf1_type') ?? undefined
  const gyroLpf2Type = h.get('gyro_lpf2_type') ?? undefined
  const dtermLpf1Type = h.get('dterm_lpf1_type') ?? undefined
  const dtermLpf2Type = h.get('dterm_lpf2_type') ?? undefined

  const gyroFilterMultiplier = parseInt(h.get('simplified_gyro_filter_multiplier') ?? '0') || undefined
  const dtermFilterMultiplier = parseInt(h.get('simplified_dterm_filter_multiplier') ?? '0') || undefined
  const itermRelaxCutoff = parseInt(h.get('iterm_relax_cutoff') ?? '0') || undefined

  if (!gyroLpf1Cutoff && !dtermLpf1Cutoff && !dynamicNotchCount && !rpmFilterHarmonics
      && !gyroFilterMultiplier && !dtermFilterMultiplier && !itermRelaxCutoff) {
    return undefined
  }

  return {
    gyroLpf1Type,
    gyroLpf1Cutoff,
    gyroLpf2Type,
    gyroLpf2Cutoff,
    dtermLpf1Type,
    dtermLpf1Cutoff,
    dtermLpf2Type,
    dtermLpf2Cutoff,
    dynamicNotchCount,
    dynamicNotchQ,
    dynamicNotchMinHz,
    dynamicNotchMaxHz,
    rpmFilterHarmonics,
    rpmFilterMinHz,
    rpmFilterQ,
    gyroFilterMultiplier,
    dtermFilterMultiplier,
    itermRelaxCutoff,
  }
}
