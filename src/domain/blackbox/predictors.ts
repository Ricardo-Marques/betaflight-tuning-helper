/**
 * Predictor functions — compute predicted value, which is added to the decoded residual.
 * Matches the reference: actual = applyPrediction(fieldIndex, predictor, residual, current, previous, previous2)
 */
import { PredictorType, type PredictorContext } from './types.ts'

/**
 * Apply a predictor to a decoded residual value.
 * Returns the final value: residual + prediction.
 */
export function applyPredictor(
  predictor: PredictorType,
  fieldIndex: number,
  residual: number,
  ctx: PredictorContext,
): number {
  switch (predictor) {
    case PredictorType.ZERO:
      return residual

    case PredictorType.PREVIOUS:
      return residual + (ctx.previous[fieldIndex] ?? 0)

    case PredictorType.STRAIGHT_LINE: {
      const prev = ctx.previous[fieldIndex] ?? 0
      // If no previousPrevious available, use previous (matches reference behavior)
      const prevPrev = ctx.previousPrevious[fieldIndex] ?? prev
      return residual + (2 * prev - prevPrev)
    }

    case PredictorType.AVERAGE_2: {
      const prev = ctx.previous[fieldIndex] ?? 0
      const prevPrev = ctx.previousPrevious[fieldIndex] ?? prev
      return residual + Math.trunc((prev + prevPrev) / 2)
    }

    case PredictorType.MINTHROTTLE:
      return residual + ctx.minthrottle

    case PredictorType.MOTOR_0:
      // Use motor[0] from current frame (already decoded since it appears before dependent fields)
      // motor0Index is looked up by name, not hardcoded to index 0
      return residual + (ctx.current[ctx.motor0Index] ?? 0)

    case PredictorType.INCREMENT:
      // INC predictor should never reach here — handled specially in FrameDecoder
      return residual

    case PredictorType.CONST_1500:
      return residual + 1500

    case PredictorType.VBATREF:
      return residual + ctx.vbatref

    case PredictorType.LAST_MAIN_FRAME_TIME:
      // Same as PREVIOUS for main frame time field
      return residual + (ctx.previous[fieldIndex] ?? 0)

    case PredictorType.MINMOTOR:
      return residual + ctx.motorOutput[0]

    default:
      return residual
  }
}
