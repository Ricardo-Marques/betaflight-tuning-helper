/**
 * BblParser — top-level orchestrator for parsing BBL binary files.
 *
 * Flow: find log → parse headers → decode frames → map to LogFrame → zero-base time
 */
import type { LogFrame, LogMetadata } from '../types/LogFrame.ts'
import { findLogStart, parseHeaders } from './HeaderParser.ts'
import { decodeFrames } from './FrameDecoder.ts'
import { toLogFrame, toLogMetadata, buildFieldIndex } from './frameMapping.ts'

export interface ParseBblResult {
  frames: LogFrame[]
  metadata: LogMetadata
}

/**
 * Parse a BBL binary buffer into frames and metadata.
 *
 * @param buffer Raw file contents as Uint8Array
 * @param onProgress Optional progress callback (0-100)
 */
export function parseBblBuffer(
  buffer: Uint8Array,
  onProgress?: (progress: number, message: string) => void,
): ParseBblResult {
  const report = (pct: number, msg: string) => {
    if (onProgress) onProgress(pct, msg)
  }

  // Step 1: Find log start
  report(5, 'Searching for log start...')
  const logStart = findLogStart(buffer, 0)
  if (logStart < 0) {
    throw new Error('No valid Blackbox log found in file. Expected "H Product:Blackbox" header marker.')
  }

  // Step 2: Parse headers
  report(10, 'Parsing headers...')
  const headers = parseHeaders(buffer, logStart)

  if (headers.iFieldDefs.length === 0) {
    throw new Error('No field definitions found in log headers. The file may be corrupted.')
  }

  // Step 3: Decode frames
  report(15, 'Decoding frames...')
  const { mainFrames, errorCount } = decodeFrames(buffer, headers, (pct) => {
    report(15 + Math.floor(pct * 0.7), `Decoding frames...`)
  })

  if (mainFrames.length === 0) {
    throw new Error(
      'No data frames could be decoded from the log.' +
      (errorCount > 0 ? ` (${errorCount} frames had decode errors)` : '')
    )
  }

  // Step 4: Map to LogFrame
  report(88, 'Mapping frames...')
  const fieldIndex = buildFieldIndex(headers)
  const frames: LogFrame[] = []

  for (let i = 0; i < mainFrames.length; i++) {
    frames.push(toLogFrame(mainFrames[i], fieldIndex, i))
  }

  // Step 5: Zero-base timestamps
  report(92, 'Normalizing timestamps...')
  if (frames.length > 0) {
    const timeOffset = frames[0].time
    for (const frame of frames) {
      frame.time -= timeOffset
    }
  }

  // Step 6: Build metadata
  const durationSeconds = frames.length > 0
    ? frames[frames.length - 1].time / 1_000_000
    : 0

  const metadata = toLogMetadata(headers, frames.length, durationSeconds)

  if (errorCount > 0) {
    console.warn(`BBL parser: ${errorCount} frames had decode errors and were skipped`)
  }

  report(100, 'Complete!')

  return { frames, metadata }
}
