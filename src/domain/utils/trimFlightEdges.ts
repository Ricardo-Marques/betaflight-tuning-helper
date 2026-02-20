import type { LogFrame, LogMetadata } from '../types/LogFrame'

const MAX_TRIM_SECONDS = 1
const MIN_DURATION_FOR_TRIM = 3

interface TrimResult {
  frames: LogFrame[]
  metadata: LogMetadata
  trimmedStartSeconds: number
  trimmedEndSeconds: number
}

/**
 * Trims the first and last ~1 second of flight data to remove
 * takeoff spin-up and landing transients that pollute analysis.
 *
 * - Flights < 3s: no trim
 * - Flights 3–4s: proportional trim (0s at 3s, 1s at 4s)
 * - Flights >= 4s: full 1s trim from each side
 */
export function trimFlightEdges(frames: LogFrame[], metadata: LogMetadata): TrimResult {
  if (frames.length === 0 || metadata.duration < MIN_DURATION_FOR_TRIM) {
    return { frames, metadata, trimmedStartSeconds: 0, trimmedEndSeconds: 0 }
  }

  // Scale trim for short flights (3–4s): linear from 0 to MAX_TRIM_SECONDS
  const trimSeconds = metadata.duration < MIN_DURATION_FOR_TRIM + 1
    ? (metadata.duration - MIN_DURATION_FOR_TRIM) * MAX_TRIM_SECONDS
    : MAX_TRIM_SECONDS

  const firstTime = frames[0].time
  const lastTime = frames[frames.length - 1].time
  const trimUs = trimSeconds * 1_000_000

  const trimStart = firstTime + trimUs
  const trimEnd = lastTime - trimUs

  const trimmed = frames.filter(f => f.time >= trimStart && f.time <= trimEnd)

  // Defensive: if filtering produces no frames, return originals
  if (trimmed.length === 0) {
    return { frames, metadata, trimmedStartSeconds: 0, trimmedEndSeconds: 0 }
  }

  // Re-zero-base timestamps
  const timeOffset = trimmed[0].time
  const rebasedFrames = trimmed.map(f => ({ ...f, time: f.time - timeOffset }))

  const lastRebasedTime = rebasedFrames[rebasedFrames.length - 1].time
  const newDuration = lastRebasedTime / 1_000_000

  const updatedMetadata: LogMetadata = {
    ...metadata,
    duration: newDuration,
    frameCount: rebasedFrames.length,
  }

  return {
    frames: rebasedFrames,
    metadata: updatedMetadata,
    trimmedStartSeconds: trimSeconds,
    trimmedEndSeconds: trimSeconds,
  }
}
