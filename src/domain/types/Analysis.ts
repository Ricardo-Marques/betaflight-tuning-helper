
/**
 * Time window of frames for analysis
 */
export interface AnalysisWindow {
  /** Start time in microseconds */
  startTime: number

  /** End time in microseconds */
  endTime: number

  /** Frame indices in this window */
  frameIndices: number[]

  /** Axis being analyzed */
  axis: Axis

  /** Window metadata */
  metadata: WindowMetadata
}

export type Axis = 'roll' | 'pitch' | 'yaw'

export interface WindowMetadata {
  /** Average throttle in window */
  avgThrottle: number

  /** Max setpoint magnitude (deg/s) */
  maxSetpoint: number

  /** RMS of setpoint */
  rmsSetpoint: number

  /** Stick activity (true if significant RC input) */
  hasStickInput: boolean

  /** Flight phase classification */
  flightPhase: FlightPhase
}

export type FlightPhase =
  | 'hover'
  | 'cruise'
  | 'flip'
  | 'roll'
  | 'punch'
  | 'propwash'
  | 'idle'
  | 'unknown'

/**
 * Detected tuning issue
 */
export interface DetectedIssue {
  id: string
  type: IssueType
  severity: Severity
  axis: Axis
  timeRange: [number, number] // microseconds
  description: string
  metrics: IssueMetrics
  confidence: number // 0-1
  occurrences?: [number, number][] // individual timeRanges before collapse
}

export type IssueType =
  | 'bounceback'
  | 'propwash'
  | 'midThrottleWobble'
  | 'highFrequencyNoise'
  | 'lowFrequencyOscillation'
  | 'motorSaturation'
  | 'gyroNoise'
  | 'dtermNoise'
  | 'highThrottleOscillation'
  | 'underdamped'
  | 'overdamped'

export type Severity = 'low' | 'medium' | 'high'

export interface IssueMetrics {
  /** Overshoot ratio (gyro / setpoint peak) */
  overshoot?: number

  /** Settling time (ms) */
  settlingTime?: number

  /** Oscillation frequency (Hz) */
  frequency?: number

  /** Peak-to-peak oscillation amplitude (deg/s) */
  amplitude?: number

  /** RMS error between gyro and setpoint */
  rmsError?: number

  /** D-term activity level */
  dtermActivity?: number

  /** Motor saturation percentage (0-100) */
  motorSaturation?: number

  /** Noise floor (deg/s RMS) */
  noiseFloor?: number

  /** Dominant frequency band */
  dominantBand?: FrequencyBand

  /** Normalized tracking error (percentage of setpoint) */
  normalizedError?: number

  /** Amplitude ratio: gyro RMS / setpoint RMS (percentage) */
  amplitudeRatio?: number

  /** Signal-to-noise ratio */
  signalToNoise?: number

  /** Phase lag between setpoint and gyro (ms) */
  phaseLagMs?: number
}

export type FrequencyBand = 'low' | 'mid' | 'high'

/**
 * Tuning recommendation
 */
export interface Recommendation {
  id: string
  issueId: string
  type: RecommendationType
  priority: number // 1-10, higher = more important
  confidence: number // 0-1

  // Human-readable
  title: string
  description: string
  rationale: string
  risks: string[]

  // Actionable changes
  changes: ParameterChange[]

  // Expected outcome
  expectedImprovement: string

  // Additional issue IDs linked during recommendation dedup
  relatedIssueIds?: string[]
}

export type RecommendationType =
  | 'increasePID'
  | 'decreasePID'
  | 'adjustFiltering'
  | 'adjustDynamicIdle'
  | 'adjustTPA'
  | 'adjustRPMFilter'
  | 'adjustMasterMultiplier'
  | 'adjustFeedforward'

/**
 * Specific parameter change in Betaflight slider language
 */
export interface ParameterChange {
  parameter: BetaflightParameter
  currentValue?: number
  recommendedChange: string // e.g., "+0.3", "-5%", "32"
  axis?: Axis
  explanation: string
}

export type BetaflightParameter =
  // PID sliders (0-200, default 100)
  | 'pidMasterMultiplier'
  | 'pidPGain'
  | 'pidIGain'
  | 'pidDGain'
  | 'pidDMinGain'
  | 'pidFeedforward'

  // Filter sliders
  | 'gyroFilterMultiplier' // (0-200, default 100)
  | 'dtermFilterMultiplier' // (0-200, default 100)

  // Dynamic notch
  | 'dynamicNotchCount'
  | 'dynamicNotchQ'
  | 'dynamicNotchMinHz'
  | 'dynamicNotchMaxHz'

  // RPM filter
  | 'rpmFilterHarmonics'
  | 'rpmFilterMinHz'

  // Other
  | 'dynamicIdle'
  | 'tpaRate'
  | 'tpaBreakpoint'
  | 'itermRelaxCutoff'

/**
 * Analysis results for entire log
 */
export interface AnalysisResult {
  issues: DetectedIssue[]
  recommendations: Recommendation[]
  summary: AnalysisSummary
  segments: FlightSegment[]
}

export interface AnalysisSummary {
  overallHealth: 'excellent' | 'good' | 'needsWork' | 'poor'
  highIssueCount: number
  mediumIssueCount: number
  lowIssueCount: number
  topPriorities: string[] // Top 3 things to fix
}

export interface FlightSegment {
  id: string
  startTime: number
  endTime: number
  phase: FlightPhase
  description: string
  issueCount: number
}

/**
 * Frequency analysis result
 */
export interface FrequencySpectrum {
  frequencies: number[] // Hz
  magnitudes: number[] // Arbitrary units
  dominantFrequency: number // Hz
  dominantMagnitude: number
  bandEnergy: {
    low: number // 0-30 Hz (aerodynamic, I-term)
    mid: number // 30-150 Hz (PID oscillation, structural)
    high: number // 150+ Hz (motor noise, electrical)
  }
}
