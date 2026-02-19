/**
 * FrameDecoder - core decode loop for BBL binary frames.
 *
 * Processes fields one-by-one (not in pre-computed groups), matching the reference
 * implementation in blackbox-log-viewer. Multi-field encoders consume a fixed number
 * of subsequent fields regardless of their declared encoding.
 *
 * Key behaviors:
 * - INC predictor reads NO data from stream
 * - Predictors are applied immediately per field (not batched)
 * - After I-frame, both history slots point to the I-frame
 * - TAG8_8SVB groups dynamically by scanning consecutive same-encoding fields
 */
import { ByteStream } from './ByteStream.ts'
import { BitStream } from './BitStream.ts'
import {
  type BblHeaders,
  type FieldDef,
  type PredictorContext,
  EncoderType,
  PredictorType,
  FRAME_TYPE,
  VALID_FRAME_BYTES,
} from './types.ts'
import { applyPredictor } from './predictors.ts'
import { decodeTag8_8SVB } from './decoders/Tag8_8SVB.ts'
import { decodeTag2_3S32 } from './decoders/Tag2_3S32.ts'
import { Tag8_4S16Decoder } from './decoders/Tag8_4S16.ts'
import { decodeTag2_3SVariable } from './decoders/Tag2_3SVariable.ts'
import { decodeEliasDeltaUnsigned, decodeEliasDeltaSigned } from './decoders/EliasDelta.ts'
import { decodeEliasGammaSigned } from './decoders/EliasGamma.ts'

export interface DecodedFrame {
  values: number[]
  type: 'I' | 'P' | 'S'
}

export interface DecodeResult {
  mainFrames: DecodedFrame[]
  slowFrames: DecodedFrame[]
  errorCount: number
}

/**
 * Decode all frames from the data section of a BBL log.
 */
export function decodeFrames(
  data: Uint8Array,
  headers: BblHeaders,
  onProgress?: (progress: number) => void,
): DecodeResult {
  const stream = new ByteStream(data, headers.dataStart)
  const mainFrames: DecodedFrame[] = []
  const slowFrames: DecodedFrame[] = []
  let errorCount = 0

  const fieldCount = headers.iFieldDefs.length

  // Prediction history - after I-frame both slots point to I-frame values
  let previous = new Array<number>(fieldCount).fill(0)
  let previousPrevious = new Array<number>(fieldCount).fill(0)
  let hasPrevious = false

  const tag8_4s16 = new Tag8_4S16Decoder()

  const totalBytes = stream.end - headers.dataStart
  let lastProgressReport = 0

  while (!stream.eof) {
    // Progress reporting
    if (onProgress) {
      const bytesRead = stream.offset - headers.dataStart
      const progress = Math.floor((bytesRead / totalBytes) * 100)
      if (progress >= lastProgressReport + 5) {
        lastProgressReport = progress
        onProgress(progress)
      }
    }

    const startPos = stream.offset
    const frameTypeByte = stream.peekByte()
    if (frameTypeByte === -1) break

    try {
      switch (frameTypeByte) {
        case FRAME_TYPE.INTRA: {
          stream.readByte()

          const ctx: PredictorContext = {
            previous: hasPrevious ? previous : [],
            previousPrevious: hasPrevious ? previousPrevious : [],
            current: new Array(fieldCount).fill(0),
            motor0Index: headers.motor0Index,
            minthrottle: headers.minthrottle,
            vbatref: headers.vbatref,
            motorOutput: headers.motorOutput,
          }

          const values = decodeAndApplyFields(
            stream, headers.iFieldDefs, fieldCount, ctx, tag8_4s16, 0,
          )

          // After I-frame: both history slots point to this I-frame
          previous = values.slice()
          previousPrevious = values.slice()
          hasPrevious = true

          mainFrames.push({ values, type: 'I' })
          break
        }

        case FRAME_TYPE.INTER: {
          stream.readByte()

          if (!hasPrevious) {
            // Can't decode P-frame without a preceding I-frame - skip
            scanToNextFrame(stream)
            break
          }

          const ctx: PredictorContext = {
            previous,
            previousPrevious,
            current: new Array(fieldCount).fill(0),
            motor0Index: headers.motor0Index,
            minthrottle: headers.minthrottle,
            vbatref: headers.vbatref,
            motorOutput: headers.motorOutput,
          }

          const values = decodeAndApplyFields(
            stream, headers.pFieldDefs, fieldCount, ctx, tag8_4s16, 0,
          )

          // After P-frame: normal history rotation
          previousPrevious = previous.slice()
          previous = values.slice()

          mainFrames.push({ values, type: 'P' })
          break
        }

        case FRAME_TYPE.SLOW: {
          stream.readByte()
          const sFieldCount = headers.sFieldDefs.length
          if (sFieldCount > 0) {
            const ctx: PredictorContext = {
              previous: [],
              previousPrevious: [],
              current: new Array(sFieldCount).fill(0),
              motor0Index: -1,
              minthrottle: headers.minthrottle,
              vbatref: headers.vbatref,
              motorOutput: headers.motorOutput,
            }
            const values = decodeAndApplyFields(
              stream, headers.sFieldDefs, sFieldCount, ctx, tag8_4s16, 0,
            )
            slowFrames.push({ values, type: 'S' })
          }
          break
        }

        case FRAME_TYPE.EVENT: {
          stream.readByte()
          skipEventFrame(stream)
          break
        }

        case FRAME_TYPE.GPS:
        case FRAME_TYPE.GPS_HOME: {
          stream.readByte()
          scanToNextFrame(stream)
          break
        }

        default: {
          stream.readByte()
          scanToNextFrame(stream)
          errorCount++
        }
      }
    } catch {
      errorCount++
      stream.offset = startPos + 1
      scanToNextFrame(stream)
    }
  }

  return { mainFrames, slowFrames, errorCount }
}

/**
 * Decode fields one-by-one, applying predictors immediately.
 * This matches the reference's parseFrame() function.
 */
function decodeAndApplyFields(
  stream: ByteStream,
  fieldDefs: FieldDef[],
  fieldCount: number,
  ctx: PredictorContext,
  tag8_4s16: Tag8_4S16Decoder,
  skippedFrames: number,
): number[] {
  const current = ctx.current
  const tempValues = new Array<number>(8) // reusable buffer for multi-field decoders

  let i = 0
  while (i < fieldCount) {
    const def = fieldDefs[i]

    // INC predictor: no data is read from stream
    if (def.predictor === PredictorType.INCREMENT) {
      current[i] = skippedFrames + 1
      if (ctx.previous.length > 0) {
        current[i] += ctx.previous[i] ?? 0
      }
      i++
      continue
    }

    switch (def.encoder) {
      case EncoderType.SIGNED_VB: {
        const residual = stream.readSignedVB()
        current[i] = applyPredictor(def.predictor, i, residual, ctx)
        i++
        break
      }

      case EncoderType.UNSIGNED_VB: {
        const residual = stream.readUnsignedVB()
        current[i] = applyPredictor(def.predictor, i, residual, ctx)
        i++
        break
      }

      case EncoderType.NEG_14BIT: {
        const residual = stream.readNeg14Bit()
        current[i] = applyPredictor(def.predictor, i, residual, ctx)
        i++
        break
      }

      case EncoderType.ELIAS_DELTA_UNSIGNED: {
        const bits = new BitStream(stream)
        const residual = decodeEliasDeltaUnsigned(bits)
        bits.byteAlign()
        current[i] = applyPredictor(def.predictor, i, residual, ctx)
        i++
        break
      }

      case EncoderType.ELIAS_DELTA_SIGNED: {
        const bits = new BitStream(stream)
        const residual = decodeEliasDeltaSigned(bits)
        bits.byteAlign()
        current[i] = applyPredictor(def.predictor, i, residual, ctx)
        i++
        break
      }

      case EncoderType.ELIAS_GAMMA_SIGNED: {
        const bits = new BitStream(stream)
        const residual = decodeEliasGammaSigned(bits)
        bits.byteAlign()
        current[i] = applyPredictor(def.predictor, i, residual, ctx)
        i++
        break
      }

      case EncoderType.TAG8_8SVB: {
        // Dynamic grouping: scan consecutive TAG8_8SVB fields
        let groupCount = 1
        for (let j = i + 1; j < i + 8 && j < fieldCount; j++) {
          if (fieldDefs[j].encoder !== EncoderType.TAG8_8SVB) break
          groupCount++
        }

        decodeTag8_8SVB(stream, groupCount, tempValues, 0)

        for (let j = 0; j < groupCount; j++) {
          current[i + j] = applyPredictor(fieldDefs[i + j].predictor, i + j, tempValues[j], ctx)
        }
        i += groupCount
        break
      }

      case EncoderType.TAG2_3S32: {
        // Always consumes exactly 3 fields
        decodeTag2_3S32(stream, tempValues, 0)
        const count = Math.min(3, fieldCount - i)
        for (let j = 0; j < count; j++) {
          current[i + j] = applyPredictor(fieldDefs[i + j].predictor, i + j, tempValues[j], ctx)
        }
        i += 3
        break
      }

      case EncoderType.TAG8_4S16: {
        // Always consumes exactly 4 fields
        tag8_4s16.decode(stream, tempValues, 0)
        const count = Math.min(4, fieldCount - i)
        for (let j = 0; j < count; j++) {
          current[i + j] = applyPredictor(fieldDefs[i + j].predictor, i + j, tempValues[j], ctx)
        }
        i += 4
        break
      }

      case EncoderType.TAG2_3S_VARIABLE: {
        // Always consumes exactly 3 fields
        decodeTag2_3SVariable(stream, tempValues, 0)
        const count = Math.min(3, fieldCount - i)
        for (let j = 0; j < count; j++) {
          current[i + j] = applyPredictor(fieldDefs[i + j].predictor, i + j, tempValues[j], ctx)
        }
        i += 3
        break
      }

      case EncoderType.NULL: {
        // No data read, value is 0 + prediction
        current[i] = applyPredictor(def.predictor, i, 0, ctx)
        i++
        break
      }

      default: {
        // Unknown encoding - treat as zero
        current[i] = 0
        i++
      }
    }
  }

  return current
}

/**
 * Skip an event frame by reading its type-specific payload.
 */
function skipEventFrame(stream: ByteStream): void {
  if (stream.eof) return

  const eventType = stream.readByte()

  switch (eventType) {
    case 0xFF: {
      // LOG_END: check for "End of log\0" string
      const endMsg = 'End of log\0'
      const bytes = stream.readBytes(endMsg.length)
      let isEnd = true
      for (let i = 0; i < endMsg.length && i < bytes.length; i++) {
        if (bytes[i] !== endMsg.charCodeAt(i)) { isEnd = false; break }
      }
      if (!isEnd) {
        // False positive - not a real log end, scan forward
        scanToNextFrame(stream)
      }
      // If it is a real log end, stop at current position
      break
    }
    case 14: // LOGGING_RESUME
      stream.readUnsignedVB() // logIteration
      stream.readUnsignedVB() // currentTime
      break
    case 0: // SYNC_BEEP
      stream.readUnsignedVB() // time
      break
    case 30: // FLIGHT_MODE
      stream.readUnsignedVB() // newFlags
      stream.readUnsignedVB() // lastFlags
      break
    case 15: // DISARM
      stream.readUnsignedVB() // reason
      break
    default:
      // Unknown event - scan to next frame
      scanToNextFrame(stream)
      break
  }
}

/**
 * Scan forward until the next valid frame type byte.
 */
function scanToNextFrame(stream: ByteStream): void {
  while (!stream.eof) {
    const b = stream.peekByte()
    if (b !== -1 && VALID_FRAME_BYTES.has(b)) {
      return
    }
    stream.readByte()
  }
}
