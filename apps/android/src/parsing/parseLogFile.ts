/**
 * Log file parsing for React Native.
 *
 * This is a direct port of src/workers/logParser.worker.ts — the parsing
 * logic is identical, but instead of a Web Worker + postMessage protocol,
 * it's a plain async function with a progress callback.
 *
 * The same BBL parser (src/domain/blackbox/) and text parser are used unchanged.
 * `setImmediate` yields are inserted between frame batches to keep the JS event
 * loop responsive. On Hermes, the JS thread is separate from the UI thread,
 * so native rendering stays smooth regardless.
 */
import * as FileSystem from 'expo-file-system'
import { parseBblBuffer } from '@bf-tuner/domain/blackbox/index'
import type { LogFrame, LogMetadata } from '@bf-tuner/domain/types/LogFrame'

export interface DomainRanges {
  signal: Record<'roll' | 'pitch' | 'yaw', [number, number]>
  pid: Record<'roll' | 'pitch' | 'yaw', [number, number]>
  motor: [number, number]
}

export interface ParseResult {
  frames: LogFrame[]
  metadata: LogMetadata
  domains: DomainRanges
}

export type ProgressCallback = (progress: number, message: string) => void

/**
 * Determine file type from extension.
 */
function getFileType(uri: string): 'bbl' | 'txt' | 'csv' | null {
  const lower = uri.toLowerCase()
  if (lower.endsWith('.bbl') || lower.endsWith('.bfl')) return 'bbl'
  if (lower.endsWith('.txt')) return 'txt'
  if (lower.endsWith('.csv')) return 'csv'
  return null
}

/**
 * Parse a blackbox log file from a device URI.
 * Supports .bbl/.bfl (binary) and .txt/.csv (text export) formats.
 */
export async function parseLogFile(uri: string, onProgress: ProgressCallback): Promise<ParseResult> {
  const fileType = getFileType(uri)
  if (!fileType) {
    throw new Error('Unsupported file type. Please select a .bbl, .bfl, .txt, or .csv file.')
  }

  if (fileType === 'bbl') {
    return parseBblFile(uri, onProgress)
  } else {
    return parseTxtFile(uri, onProgress)
  }
}

// ─── BBL Binary Parser ────────────────────────────────────────────────────────

async function parseBblFile(uri: string, onProgress: ProgressCallback): Promise<ParseResult> {
  onProgress(0, 'Reading binary file...')

  // Read file as base64 then convert to Uint8Array
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const data = base64ToUint8Array(base64)

  const estimatedFrames = Math.floor(data.length / 150)
  const ceiling = getParseProgressCeiling(estimatedFrames)

  const { frames, metadata } = parseBblBuffer(data, (progress, message) => {
    onProgress(Math.floor((progress * ceiling) / 100), message)
  })

  const domains = computeDomains(frames)
  onProgress(100, 'Done')
  return { frames, metadata, domains }
}

// ─── Text / CSV Parser ────────────────────────────────────────────────────────

async function parseTxtFile(uri: string, onProgress: ProgressCallback): Promise<ParseResult> {
  onProgress(0, 'Reading file...')

  const text = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  const lines = text.split('\n')

  onProgress(10, 'Parsing header...')

  let headerEndIndex = 0
  const headerMap = new Map<string, string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('H ')) {
      const parts = line.substring(2).split(':')
      if (parts.length >= 2) {
        headerMap.set(parts[0].trim(), parts.slice(1).join(':').trim())
      }
    } else if (line.startsWith('F ')) {
      headerEndIndex = i
      break
    } else if (line.startsWith('"')) {
      const parts = line.split(',')
      if (parts.length >= 2) {
        const key = parts[0].replace(/"/g, '').trim()
        const value = parts.slice(1).join(',').replace(/"/g, '').trim()
        if (key === 'loopIteration') {
          headerEndIndex = i
          break
        }
        headerMap.set(key, value)
      }
    }
  }

  const metadata = extractMetadata(headerMap, lines, headerEndIndex)

  onProgress(20, 'Parsing field definitions...')

  const fieldLine = lines[headerEndIndex]
  const fieldNames = fieldLine.startsWith('F ')
    ? fieldLine.substring(2).split(',').map(f => f.trim())
    : fieldLine.split(',').map(f => f.replace(/"/g, '').trim())

  const fieldIndex = new Map<string, number>()
  fieldNames.forEach((name, idx) => fieldIndex.set(name, idx))

  const timeIdx = fieldIndex.get('time') ?? -1
  const loopIterationIdx = fieldIndex.get('loopIteration') ?? -1
  const gyroRollIdx = fieldIndex.get('gyroADC[0]') ?? -1
  const gyroPitchIdx = fieldIndex.get('gyroADC[1]') ?? -1
  const gyroYawIdx = fieldIndex.get('gyroADC[2]') ?? -1

  const setpointRollIdx =
    fieldIndex.get('setpoint[0]') ?? fieldIndex.get('rcCommand[0]') ?? fieldIndex.get('axisError[0]') ?? -1
  const setpointPitchIdx =
    fieldIndex.get('setpoint[1]') ?? fieldIndex.get('rcCommand[1]') ?? fieldIndex.get('axisError[1]') ?? -1
  const setpointYawIdx =
    fieldIndex.get('setpoint[2]') ?? fieldIndex.get('rcCommand[2]') ?? fieldIndex.get('axisError[2]') ?? -1

  const pidPRollIdx = fieldIndex.get('axisP[0]') ?? -1
  const pidPPitchIdx = fieldIndex.get('axisP[1]') ?? -1
  const pidPYawIdx = fieldIndex.get('axisP[2]') ?? -1
  const pidIRollIdx = fieldIndex.get('axisI[0]') ?? -1
  const pidIPitchIdx = fieldIndex.get('axisI[1]') ?? -1
  const pidIYawIdx = fieldIndex.get('axisI[2]') ?? -1
  const pidDRollIdx = fieldIndex.get('axisD[0]') ?? -1
  const pidDPitchIdx = fieldIndex.get('axisD[1]') ?? -1
  const pidDYawIdx = fieldIndex.get('axisD[2]') ?? -1
  const pidSumRollIdx = fieldIndex.get('axisSum[0]') ?? -1
  const pidSumPitchIdx = fieldIndex.get('axisSum[1]') ?? -1
  const pidSumYawIdx = fieldIndex.get('axisSum[2]') ?? -1
  const ffRollIdx = fieldIndex.get('axisF[0]') ?? -1
  const ffPitchIdx = fieldIndex.get('axisF[1]') ?? -1
  const ffYawIdx = fieldIndex.get('axisF[2]') ?? -1
  const hasFF = ffRollIdx >= 0

  const motor1Idx = fieldIndex.get('motor[0]') ?? -1
  const motor2Idx = fieldIndex.get('motor[1]') ?? -1
  const motor3Idx = fieldIndex.get('motor[2]') ?? -1
  const motor4Idx = fieldIndex.get('motor[3]') ?? -1

  const rcCommandRollIdx = fieldIndex.get('rcCommand[0]') ?? -1
  const rcCommandPitchIdx = fieldIndex.get('rcCommand[1]') ?? -1
  const rcCommandYawIdx = fieldIndex.get('rcCommand[2]') ?? -1
  const rcCommandThrottleIdx = fieldIndex.get('rcCommand[3]') ?? -1
  const throttleIdx = fieldIndex.get('throttle') ?? rcCommandThrottleIdx

  const hasTime = timeIdx >= 0 || loopIterationIdx >= 0
  const hasGyro = gyroRollIdx >= 0
  if (!hasTime || !hasGyro) {
    throw new Error(
      "This doesn't appear to be a Betaflight blackbox log. Expected fields like 'time', 'gyroADC[0]' were not found."
    )
  }

  const estimatedFrames = lines.length - headerEndIndex - 1
  const ceiling = getParseProgressCeiling(estimatedFrames)

  onProgress(30, 'Parsing frames...')

  const frames: LogFrame[] = []
  const dataStartIndex = headerEndIndex + 1

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('H') || line.startsWith('E') || line.startsWith('"')) continue

    const values = line.split(',').map(v => {
      const cleaned = v.replace(/"/g, '').trim()
      return cleaned === 'NaN' ? NaN : parseFloat(cleaned)
    })

    if (values.length < fieldNames.length) continue

    const frame: LogFrame = {
      time: timeIdx >= 0 ? values[timeIdx] : i * 125,
      loopIteration: loopIterationIdx >= 0 ? values[loopIterationIdx] : i,
      gyroADC: {
        roll: gyroRollIdx >= 0 ? values[gyroRollIdx] : 0,
        pitch: gyroPitchIdx >= 0 ? values[gyroPitchIdx] : 0,
        yaw: gyroYawIdx >= 0 ? values[gyroYawIdx] : 0,
      },
      setpoint: {
        roll: setpointRollIdx >= 0 ? values[setpointRollIdx] : 0,
        pitch: setpointPitchIdx >= 0 ? values[setpointPitchIdx] : 0,
        yaw: setpointYawIdx >= 0 ? values[setpointYawIdx] : 0,
      },
      pidP: {
        roll: pidPRollIdx >= 0 ? values[pidPRollIdx] : 0,
        pitch: pidPPitchIdx >= 0 ? values[pidPPitchIdx] : 0,
        yaw: pidPYawIdx >= 0 ? values[pidPYawIdx] : 0,
      },
      pidI: {
        roll: pidIRollIdx >= 0 ? values[pidIRollIdx] : 0,
        pitch: pidIPitchIdx >= 0 ? values[pidIPitchIdx] : 0,
        yaw: pidIYawIdx >= 0 ? values[pidIYawIdx] : 0,
      },
      pidD: {
        roll: pidDRollIdx >= 0 ? values[pidDRollIdx] : 0,
        pitch: pidDPitchIdx >= 0 ? values[pidDPitchIdx] : 0,
        yaw: pidDYawIdx >= 0 ? values[pidDYawIdx] : 0,
      },
      pidSum: {
        roll: pidSumRollIdx >= 0 ? values[pidSumRollIdx] : values[pidPRollIdx] + values[pidIRollIdx] + values[pidDRollIdx] || 0,
        pitch: pidSumPitchIdx >= 0 ? values[pidSumPitchIdx] : values[pidPPitchIdx] + values[pidIPitchIdx] + values[pidDPitchIdx] || 0,
        yaw: pidSumYawIdx >= 0 ? values[pidSumYawIdx] : values[pidPYawIdx] + values[pidIYawIdx] + values[pidDYawIdx] || 0,
      },
      motor: [
        motor1Idx >= 0 ? values[motor1Idx] : 1000,
        motor2Idx >= 0 ? values[motor2Idx] : 1000,
        motor3Idx >= 0 ? values[motor3Idx] : 1000,
        motor4Idx >= 0 ? values[motor4Idx] : 1000,
      ],
      rcCommand: {
        roll: rcCommandRollIdx >= 0 ? values[rcCommandRollIdx] : 0,
        pitch: rcCommandPitchIdx >= 0 ? values[rcCommandPitchIdx] : 0,
        yaw: rcCommandYawIdx >= 0 ? values[rcCommandYawIdx] : 0,
        throttle: rcCommandThrottleIdx >= 0 ? values[rcCommandThrottleIdx] : 1000,
      },
      throttle: throttleIdx >= 0 ? values[throttleIdx] : 1000,
    }

    if (hasFF) {
      frame.feedforward = {
        roll: values[ffRollIdx],
        pitch: ffPitchIdx >= 0 ? values[ffPitchIdx] : 0,
        yaw: ffYawIdx >= 0 ? values[ffYawIdx] : 0,
      }
    }

    frames.push(frame)

    // Yield every 5000 frames to keep the JS event loop responsive
    if (i % 5000 === 0) {
      const progress = 30 + Math.floor(((i - dataStartIndex) / (lines.length - dataStartIndex)) * (ceiling - 30))
      onProgress(progress, `Parsed ${frames.length} frames...`)
      await yieldToEventLoop()
    }
  }

  if (frames.length === 0) {
    throw new Error('No data frames found in file. The file may be empty or corrupted.')
  }

  metadata.frameCount = frames.length

  if (frames.length > 0) {
    const timeOffset = frames[0].time
    for (const frame of frames) {
      frame.time -= timeOffset
    }
    metadata.duration = (frames[frames.length - 1].time - frames[0].time) / 1_000_000
  }

  const domains = computeDomains(frames)
  onProgress(100, 'Done')
  return { frames, metadata, domains }
}

// ─── Shared Utilities ─────────────────────────────────────────────────────────

function extractMetadata(
  headerMap: Map<string, string>,
  lines: string[],
  headerEndIndex: number
): LogMetadata {
  const firmwareType = headerMap.get('Firmware type') ?? headerMap.get('firmwareType') ?? 'Betaflight'
  const firmwareVersion =
    headerMap.get('Firmware revision') ?? headerMap.get('firmwareVersion') ?? headerMap.get('firmware') ?? 'Unknown'
  const looptimeStr = headerMap.get('looptime') ?? '125'
  const looptime = parseInt(looptimeStr) || 125
  const craftName = headerMap.get('Craft name') ?? 'Unknown'
  const debugMode = headerMap.get('Debug mode') ?? headerMap.get('debug_mode') ?? undefined
  const frameIntervalPDenom = parseInt(headerMap.get('frameIntervalPDenom') ?? '1') || 1
  const effectiveLooptime = looptime * frameIntervalPDenom

  const fieldLine = lines[headerEndIndex] ?? ''
  const fieldNames = fieldLine.startsWith('F ')
    ? fieldLine.substring(2).split(',').map(f => f.trim())
    : fieldLine.split(',').map(f => f.replace(/"/g, '').trim())

  const motorCount = fieldNames.filter(f => f.startsWith('motor[')).length

  return {
    firmwareVersion,
    firmwareType,
    looptime: 1_000_000 / effectiveLooptime,
    gyroRate: 1_000_000 / looptime,
    motorCount: motorCount || 4,
    fieldNames,
    debugMode,
    craftName,
    frameCount: 0,
    duration: 0,
  }
}

function getParseProgressCeiling(estimatedFrames: number): number {
  if (estimatedFrames > 100_000) return 80
  if (estimatedFrames > 50_000) return 85
  if (estimatedFrames > 20_000) return 90
  return 95
}

/** Exported alias so FlashDownloadStore can call it directly after parseBblBuffer. */
export function computeDomainsFromFrames(frames: LogFrame[]): DomainRanges {
  return computeDomains(frames)
}

function computeDomains(frames: LogFrame[]): DomainRanges {
  const axes = ['roll', 'pitch', 'yaw'] as const
  const sigMin = { roll: Infinity, pitch: Infinity, yaw: Infinity }
  const sigMax = { roll: -Infinity, pitch: -Infinity, yaw: -Infinity }
  const pidMin = { roll: Infinity, pitch: Infinity, yaw: Infinity }
  const pidMax = { roll: -Infinity, pitch: -Infinity, yaw: -Infinity }
  let motorMin = Infinity
  let motorMax = -Infinity

  for (const frame of frames) {
    for (const axis of axes) {
      const g = frame.gyroADC[axis]
      const s = frame.setpoint[axis]
      if (g < sigMin[axis]) sigMin[axis] = g
      if (g > sigMax[axis]) sigMax[axis] = g
      if (s < sigMin[axis]) sigMin[axis] = s
      if (s > sigMax[axis]) sigMax[axis] = s

      const p = frame.pidP[axis]
      const iVal = frame.pidI[axis]
      const d = frame.pidD[axis]
      const sum = frame.pidSum[axis]
      let lo = Math.min(p, iVal, d, sum)
      let hi = Math.max(p, iVal, d, sum)
      if (frame.feedforward) {
        const ff = frame.feedforward[axis]
        if (ff < lo) lo = ff
        if (ff > hi) hi = ff
      }
      if (lo < pidMin[axis]) pidMin[axis] = lo
      if (hi > pidMax[axis]) pidMax[axis] = hi
    }

    for (const m of frame.motor) {
      if (m < motorMin) motorMin = m
      if (m > motorMax) motorMax = m
    }
    const t = frame.throttle
    if (t < motorMin) motorMin = t
    if (t > motorMax) motorMax = t
  }

  const signal = {} as Record<'roll' | 'pitch' | 'yaw', [number, number]>
  const pid = {} as Record<'roll' | 'pitch' | 'yaw', [number, number]>

  for (const axis of axes) {
    const sigRange = sigMax[axis] - sigMin[axis]
    const sigMargin = sigRange * 0.02
    signal[axis] = [sigMin[axis] - sigMargin, sigMax[axis] + sigMargin]

    const pidRange = pidMax[axis] - pidMin[axis]
    const pidMargin = pidRange * 0.02
    pid[axis] = [pidMin[axis] - pidMargin, pidMax[axis] + pidMargin]
  }

  const motorRange = motorMax - motorMin
  const motorMargin = motorRange * 0.05

  return { signal, pid, motor: [motorMin - motorMargin, motorMax + motorMargin] }
}

/** Yield to the event loop to keep the UI responsive during heavy parsing. */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>(resolve => setImmediate(resolve))
}

/** Convert base64 string to Uint8Array without using atob (not available in Hermes). */
function base64ToUint8Array(base64: string): Uint8Array {
  // React Native's Buffer is available via the buffer polyfill in the Hermes runtime
  // expo-file-system returns base64 which we convert to bytes here
  const binaryString = global.atob ? global.atob(base64) : Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
