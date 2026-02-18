/**
 * Represents a single frame from a Betaflight blackbox log
 * All values are in Betaflight native units unless specified
 */
export interface LogFrame {
  /** Frame timestamp in microseconds */
  time: number

  /** Loop iteration number */
  loopIteration: number

  // Gyro data (deg/s)
  gyroADC: AxisData

  // Setpoint (target) (deg/s)
  setpoint: AxisData

  // PID components (arbitrary units)
  pidP: AxisData
  pidI: AxisData
  pidD: AxisData
  pidSum: AxisData

  // Motor outputs (0-2000, where 1000 = min, 2000 = max)
  motor: number[]

  // RC commands (-500 to 500 for roll/pitch/yaw, 1000-2000 for throttle)
  rcCommand: RcCommand

  // Throttle (1000-2000)
  throttle: number

  // D-term setpoint (if available)
  dtermSetpoint?: AxisData

  // Debug values (varies by debug mode)
  debug?: number[]

  // Flight mode flags
  flightModeFlags?: number

  // State flags
  stateFlags?: number
}

export interface AxisData {
  roll: number
  pitch: number
  yaw: number
}

export interface RcCommand {
  roll: number
  pitch: number
  yaw: number
  throttle: number
}

/**
 * Metadata extracted from blackbox log header
 */
export interface LogMetadata {
  /** Firmware version string */
  firmwareVersion: string

  /** Firmware type (e.g., "Betaflight") */
  firmwareType: string

  /** Firmware revision */
  firmwareRevision?: string

  /** PID loop frequency (Hz) */
  looptime: number

  /** Gyro update frequency (Hz) */
  gyroRate: number

  /** Number of motors */
  motorCount: number

  /** Field names present in log */
  fieldNames: string[]

  /** Debug mode active during logging */
  debugMode?: string

  /** Craft name */
  craftName?: string

  /** PID profile settings */
  pidProfile?: PidProfile

  /** Filter settings */
  filterSettings?: FilterSettings

  /** Total frames in log */
  frameCount: number

  /** Duration in seconds */
  duration: number
}

export interface PidProfile {
  // PID values (actual values, not slider positions)
  rollP?: number
  rollI?: number
  rollD?: number
  pitchP?: number
  pitchI?: number
  pitchD?: number
  yawP?: number
  yawI?: number
  yawD?: number

  // D_min values
  rollDmin?: number
  pitchDmin?: number
  yawDmin?: number

  // Feedforward
  rollFF?: number
  pitchFF?: number
  yawFF?: number

  // TPA (Throttle PID Attenuation)
  tpaRate?: number
  tpaBreakpoint?: number

  // Dynamic idle
  dynamicIdle?: number

  // Master multiplier
  masterMultiplier?: number
}

export interface FilterSettings {
  // Gyro filters
  gyroLpf1Type?: string
  gyroLpf1Cutoff?: number
  gyroLpf2Type?: string
  gyroLpf2Cutoff?: number

  // D-term filters
  dtermLpf1Type?: string
  dtermLpf1Cutoff?: number
  dtermLpf2Type?: string
  dtermLpf2Cutoff?: number

  // Dynamic notch
  dynamicNotchCount?: number
  dynamicNotchQ?: number
  dynamicNotchMinHz?: number
  dynamicNotchMaxHz?: number

  // RPM filter
  rpmFilterHarmonics?: number
  rpmFilterMinHz?: number
  rpmFilterQ?: number

  // Simplified filter multipliers
  gyroFilterMultiplier?: number
  dtermFilterMultiplier?: number

  // I-term relax
  itermRelaxCutoff?: number
}
