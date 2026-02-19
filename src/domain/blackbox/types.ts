/**
 * BBL binary format types - enums and interfaces for the Betaflight blackbox binary encoding.
 */

/** Frame type marker bytes */
export const FRAME_TYPE = {
  INTRA: 0x49, // 'I'
  INTER: 0x50, // 'P'
  SLOW:  0x53, // 'S'
  EVENT: 0x45, // 'E'
  GPS:   0x47, // 'G'
  GPS_HOME: 0x48, // 'H'
} as const

/** Valid frame start bytes for scanning */
export const VALID_FRAME_BYTES: Set<number> = new Set([
  FRAME_TYPE.INTRA,
  FRAME_TYPE.INTER,
  FRAME_TYPE.SLOW,
  FRAME_TYPE.EVENT,
  FRAME_TYPE.GPS,
  FRAME_TYPE.GPS_HOME,
])

/** Encoder type IDs as stored in headers */
export enum EncoderType {
  SIGNED_VB = 0,
  UNSIGNED_VB = 1,
  NEG_14BIT = 3,
  ELIAS_DELTA_UNSIGNED = 4,
  ELIAS_DELTA_SIGNED = 5,
  TAG8_8SVB = 6,
  TAG2_3S32 = 7,
  TAG8_4S16 = 8,
  NULL = 9,
  TAG2_3S_VARIABLE = 10,
  ELIAS_GAMMA_SIGNED = 11,
}

/** Predictor type IDs as stored in headers */
export enum PredictorType {
  ZERO = 0,
  PREVIOUS = 1,
  STRAIGHT_LINE = 2,
  AVERAGE_2 = 3,
  MINTHROTTLE = 4,
  MOTOR_0 = 5,
  INCREMENT = 6,
  CONST_1500 = 8,
  VBATREF = 9,
  LAST_MAIN_FRAME_TIME = 10,
  MINMOTOR = 11,
}

/** Definition for a single field from headers */
export interface FieldDef {
  name: string
  signed: boolean
  predictor: PredictorType
  encoder: EncoderType
  /** Index in the flat field array */
  index: number
}

/** Parsed BBL header data */
export interface BblHeaders {
  /** Data version (usually 2) */
  dataVersion: number

  /** Raw header key-value pairs */
  headerMap: Map<string, string>

  /** Field definitions for I-frames */
  iFieldDefs: FieldDef[]
  /** Field definitions for P-frames (inherits names/signed from I-frame) */
  pFieldDefs: FieldDef[]
  /** Field definitions for S-frames (slow) */
  sFieldDefs: FieldDef[]

  /** Index of motor[0] in I-frame field list (for MOTOR_0 predictor) */
  motor0Index: number

  /** Minthrottle value for predictor */
  minthrottle: number
  /** Vbatref value for predictor */
  vbatref: number
  /** Motor output range [min, max] for predictor */
  motorOutput: [number, number]

  /** Byte offset where data frames begin */
  dataStart: number
}

/** Context passed to predictors during frame decoding */
export interface PredictorContext {
  /** Previously decoded values for this frame type */
  previous: number[]
  /** Two frames ago values */
  previousPrevious: number[]
  /** Current frame's values decoded so far (updated as fields are decoded) */
  current: number[]
  /** Index of motor[0] field */
  motor0Index: number
  /** Header constants */
  minthrottle: number
  vbatref: number
  motorOutput: [number, number]
}
