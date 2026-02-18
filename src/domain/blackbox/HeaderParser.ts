/**
 * HeaderParser — finds log start markers and parses BBL headers into structured data.
 *
 * P-frame field definitions inherit name/signed from I-frames but have their own predictor/encoding.
 * This matches the reference implementation in blackbox-log-viewer.
 */
import { ByteStream } from './ByteStream.ts'
import {
  type BblHeaders,
  type FieldDef,
  EncoderType,
  PredictorType,
} from './types.ts'

/**
 * Find the byte offset of the start of the first (or next) log in the buffer.
 * Scans for the "H Product:" header line.
 */
export function findLogStart(data: Uint8Array, startFrom = 0): number {
  const marker = [0x48, 0x20, 0x50, 0x72, 0x6F, 0x64, 0x75, 0x63, 0x74, 0x3A] // "H Product:"

  outer:
  for (let i = startFrom; i <= data.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (data[i + j] !== marker[j]) continue outer
    }
    return i
  }

  return -1
}

/**
 * Parse all headers from the log start position.
 */
export function parseHeaders(data: Uint8Array, logStart: number): BblHeaders {
  const stream = new ByteStream(data, logStart)
  const headerMap = new Map<string, string>()

  // Read all header lines
  while (!stream.eof) {
    const savedOffset = stream.offset
    const line = stream.readLine()
    if (line === null) break

    if (!line.startsWith('H ')) {
      stream.offset = savedOffset
      break
    }

    const content = line.substring(2)
    const colonIdx = content.indexOf(':')
    if (colonIdx >= 0) {
      const key = content.substring(0, colonIdx).trim()
      const value = content.substring(colonIdx + 1).trim()
      headerMap.set(key, value)
    }
  }

  const dataVersion = parseInt(headerMap.get('Data version') ?? '2') || 2

  // Build I-frame field definitions
  const iFieldDefs = buildFieldDefs(headerMap, 'I')

  // P-frame: inherits name/signed from I-frame, has own predictor/encoding
  const pPredictors = splitHeader(headerMap.get('Field P predictor'))
  const pEncoders = splitHeader(headerMap.get('Field P encoding'))
  const pFieldDefs: FieldDef[] = iFieldDefs.map((iDef, i) => ({
    name: iDef.name,
    signed: iDef.signed,
    index: i,
    predictor: (parseInt(pPredictors[i]) || 0) as PredictorType,
    encoder: (parseInt(pEncoders[i]) || 0) as EncoderType,
  }))

  // S-frame has its own complete definition
  const sFieldDefs = buildFieldDefs(headerMap, 'S')

  // Compute motor[0] field index for the MOTOR_0 predictor
  const motor0Index = iFieldDefs.findIndex(d => d.name === 'motor[0]')

  // Extract predictor constants
  const minthrottle = parseInt(headerMap.get('minthrottle') ?? '1070') || 1070
  const vbatref = parseInt(headerMap.get('vbatref') ?? '4095') || 4095

  let motorMin = 0
  let motorMax = 0
  const motorOutputStr = headerMap.get('motorOutput')
  if (motorOutputStr && motorOutputStr.includes(',')) {
    const parts = motorOutputStr.split(',')
    motorMin = parseInt(parts[0]) || 0
    motorMax = parseInt(parts[1]) || 0
  } else {
    motorMin = parseInt(headerMap.get('motorOutput') ?? '0') || 0
  }

  return {
    dataVersion,
    headerMap,
    iFieldDefs,
    pFieldDefs,
    sFieldDefs,
    motor0Index,
    minthrottle,
    vbatref,
    motorOutput: [motorMin, motorMax],
    dataStart: stream.offset,
  }
}

/**
 * Build field definitions for a frame type that has all four header entries
 * (name, signed, predictor, encoding). Used for I-frames and S-frames.
 */
function buildFieldDefs(headerMap: Map<string, string>, frameType: string): FieldDef[] {
  const names = splitHeader(headerMap.get(`Field ${frameType} name`))
  const signed = splitHeader(headerMap.get(`Field ${frameType} signed`))
  const predictors = splitHeader(headerMap.get(`Field ${frameType} predictor`))
  const encoders = splitHeader(headerMap.get(`Field ${frameType} encoding`))

  if (names.length === 0) return []

  const defs: FieldDef[] = []
  for (let i = 0; i < names.length; i++) {
    // Translate legacy field names (gyroData → gyroADC)
    let name = names[i]
    const gyroMatch = name.match(/^gyroData(.+)$/)
    if (gyroMatch) {
      name = `gyroADC${gyroMatch[1]}`
    }

    defs.push({
      name,
      signed: (parseInt(signed[i]) || 0) !== 0,
      predictor: (parseInt(predictors[i]) || 0) as PredictorType,
      encoder: (parseInt(encoders[i]) || 0) as EncoderType,
      index: i,
    })
  }

  return defs
}

function splitHeader(value: string | undefined): string[] {
  if (!value) return []
  return value.split(',').map(s => s.trim())
}
