import { LogFrame, LogMetadata } from '../domain/types/LogFrame'
import { Parser, getWasm, ParserEventKind, type LogFile } from 'blackbox-log'

/**
 * Web Worker for parsing Betaflight blackbox logs
 * Supports both .bbl (binary) and .txt (CSV) formats
 */

interface ParseProgressMessage {
  type: 'progress'
  progress: number
  message: string
}

interface ParseCompleteMessage {
  type: 'complete'
  frames: LogFrame[]
  metadata: LogMetadata
}

interface ParseErrorMessage {
  type: 'error'
  error: string
}

// Union of all worker message types
export type WorkerMessage = ParseProgressMessage | ParseCompleteMessage | ParseErrorMessage

self.onmessage = async (e: MessageEvent) => {
  const { file, fileType } = e.data

  try {
    if (fileType === 'txt' || fileType === 'csv') {
      await parseTxtLog(file)
    } else if (fileType === 'bbl') {
      await parseBblLog(file)
    } else {
      throw new Error('Unsupported file type')
    }
  } catch (error) {
    const errorMessage: ParseErrorMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    self.postMessage(errorMessage)
  }
}

/**
 * Parse text-based Betaflight blackbox log (CSV format)
 */
async function parseTxtLog(file: File): Promise<void> {
  postProgress(0, 'Reading file...')

  const text = await file.text()
  const lines = text.split('\n')

  postProgress(10, 'Parsing header...')

  // Parse header
  let headerEndIndex = 0
  const headerMap = new Map<string, string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('H ')) {
      // Betaflight native format: Header line with "H " prefix
      const parts = line.substring(2).split(':')
      if (parts.length >= 2) {
        headerMap.set(parts[0].trim(), parts.slice(1).join(':').trim())
      }
    } else if (line.startsWith('F ')) {
      // Betaflight native format: Field name line with "F " prefix
      headerEndIndex = i
      break
    } else if (line.startsWith('"')) {
      // CSV format: Quoted key-value pairs for header
      const parts = line.split(',')
      if (parts.length >= 2) {
        const key = parts[0].replace(/"/g, '').trim()
        const value = parts.slice(1).join(',').replace(/"/g, '').trim()

        // Check if this is the field names line (contains "loopIteration")
        if (key === 'loopIteration') {
          headerEndIndex = i
          break
        }

        headerMap.set(key, value)
      }
    }
  }

  // Extract metadata from header
  const metadata = extractMetadata(headerMap, lines, headerEndIndex)

  postProgress(20, 'Parsing field definitions...')

  // Parse field names
  const fieldLine = lines[headerEndIndex]
  const fieldNames = fieldLine.startsWith('F ')
    ? fieldLine.substring(2).split(',').map(f => f.trim())
    : fieldLine.split(',').map(f => f.replace(/"/g, '').trim())

  // Build field index map
  const fieldIndex = new Map<string, number>()
  fieldNames.forEach((name, idx) => {
    fieldIndex.set(name, idx)
  })

  // Debug: Log all field names to help diagnose missing fields
  console.log('📋 Available log fields:', fieldNames)

  // Debug: Check for setpoint fields specifically
  const setpointFields = fieldNames.filter(f =>
    f.toLowerCase().includes('setpoint') ||
    f.toLowerCase().includes('rccommand') ||
    f.toLowerCase().includes('command')
  )
  console.log('🎯 Setpoint-related fields found:', setpointFields.length > 0 ? setpointFields : 'NONE - This is the problem!')

  // Required fields
  const timeIdx = fieldIndex.get('time') ?? -1
  const loopIterationIdx = fieldIndex.get('loopIteration') ?? -1

  // Gyro indices
  const gyroRollIdx = fieldIndex.get('gyroADC[0]') ?? -1
  const gyroPitchIdx = fieldIndex.get('gyroADC[1]') ?? -1
  const gyroYawIdx = fieldIndex.get('gyroADC[2]') ?? -1

  // Setpoint indices - try multiple field name variations
  const setpointRollIdx =
    fieldIndex.get('setpoint[0]') ??
    fieldIndex.get('rcCommand[0]') ??
    fieldIndex.get('axisError[0]') ??
    -1
  const setpointPitchIdx =
    fieldIndex.get('setpoint[1]') ??
    fieldIndex.get('rcCommand[1]') ??
    fieldIndex.get('axisError[1]') ??
    -1
  const setpointYawIdx =
    fieldIndex.get('setpoint[2]') ??
    fieldIndex.get('rcCommand[2]') ??
    fieldIndex.get('axisError[2]') ??
    -1

  console.log('🔍 Setpoint field indices:', {
    roll: setpointRollIdx,
    pitch: setpointPitchIdx,
    yaw: setpointYawIdx,
    status: setpointRollIdx >= 0 ? '✅ FOUND' : '❌ NOT FOUND'
  })

  // PID indices
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

  // Motor indices
  const motor1Idx = fieldIndex.get('motor[0]') ?? -1
  const motor2Idx = fieldIndex.get('motor[1]') ?? -1
  const motor3Idx = fieldIndex.get('motor[2]') ?? -1
  const motor4Idx = fieldIndex.get('motor[3]') ?? -1

  // RC command indices
  const rcCommandRollIdx = fieldIndex.get('rcCommand[0]') ?? -1
  const rcCommandPitchIdx = fieldIndex.get('rcCommand[1]') ?? -1
  const rcCommandYawIdx = fieldIndex.get('rcCommand[2]') ?? -1
  const rcCommandThrottleIdx = fieldIndex.get('rcCommand[3]') ?? -1

  // Throttle
  const throttleIdx = fieldIndex.get('throttle') ?? rcCommandThrottleIdx

  // Validate essential fields exist
  const hasTime = timeIdx >= 0 || loopIterationIdx >= 0
  const hasGyro = gyroRollIdx >= 0
  if (!hasTime || !hasGyro) {
    throw new Error(
      "This doesn't appear to be a Betaflight blackbox log. Expected fields like 'time', 'gyroADC[0]' were not found. Please upload a .bbl file from your flight controller or a .txt/.csv export from Blackbox Explorer."
    )
  }

  postProgress(30, 'Parsing frames...')

  // Parse data frames
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
      time: timeIdx >= 0 ? values[timeIdx] : i * 125, // Default 125µs per frame (8kHz)
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
        roll: pidSumRollIdx >= 0 ? values[pidSumRollIdx] : 0,
        pitch: pidSumPitchIdx >= 0 ? values[pidSumPitchIdx] : 0,
        yaw: pidSumYawIdx >= 0 ? values[pidSumYawIdx] : 0,
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

    frames.push(frame)

    // Progress update
    if (i % 1000 === 0) {
      const progress = 30 + Math.floor(((i - dataStartIndex) / (lines.length - dataStartIndex)) * 60)
      postProgress(progress, `Parsed ${frames.length} frames...`)
    }
  }

  // Validate parsed frames
  if (frames.length === 0) {
    throw new Error(
      'No data frames found in file. The file may be empty or corrupted.'
    )
  }

  if (frames.length < 100) {
    console.warn(`Only ${frames.length} frames found — log may be too short for meaningful analysis.`)
  }

  // Update metadata with actual frame count and duration
  metadata.frameCount = frames.length

  // Detect and normalize time units
  const timeMultiplier = detectTimeUnit(frames, metadata.looptime)

  // Normalize all frame times to microseconds
  if (timeMultiplier !== 1) {
    console.log(`Detected time unit: ${timeMultiplier === 1000 ? 'milliseconds' : timeMultiplier === 1000000 ? 'seconds' : 'microseconds'} (multiplier: ${timeMultiplier})`)
    for (const frame of frames) {
      frame.time *= timeMultiplier
    }
  }

  // Zero-base timestamps so chart starts at 0
  if (frames.length > 0) {
    const timeOffset = frames[0].time
    for (const frame of frames) {
      frame.time -= timeOffset
    }
  }

  if (frames.length > 0) {
    metadata.duration = frames[frames.length - 1].time / 1_000_000 // Already zero-based
  }

  postProgress(95, 'Finalizing...')

  const completeMessage: ParseCompleteMessage = {
    type: 'complete',
    frames,
    metadata,
  }

  postProgress(100, 'Complete!')
  self.postMessage(completeMessage)
}

/**
 * Parse binary Betaflight blackbox log (.bbl / .bfl)
 * Uses the blackbox-log WASM package for decoding.
 */
async function parseBblLog(file: File): Promise<void> {
  postProgress(0, 'Reading binary file...')
  const buffer = await file.arrayBuffer()

  postProgress(5, 'Initializing BBL parser...')
  let logFile: LogFile | null = null

  try {
    const parser = await Parser.init(await getWasm())

    postProgress(10, 'Loading log file...')
    logFile = parser.loadFile(buffer)
    const logCount = logFile.logCount

    if (logCount === 0) {
      throw new Error('No valid logs found in BBL file')
    }

    if (logCount > 1) {
      console.log(`BBL file contains ${logCount} logs. Parsing first log only.`)
    }

    postProgress(15, 'Parsing headers...')
    const headers = logFile.parseHeaders(0)
    if (!headers) {
      throw new Error('Failed to parse log headers')
    }

    // Collect available field names from frame definition
    const fieldNames: string[] = []
    for (const [name] of headers.mainFrameDef) {
      fieldNames.push(name)
    }

    // Extract looptime from unknown headers (raw header values)
    const unknownHeaders = headers.unknown
    const looptimeStr = unknownHeaders?.get('looptime') ?? '125'
    const looptime = parseInt(looptimeStr) || 125
    const frameIntervalPDenom = parseInt(unknownHeaders?.get('frameIntervalPDenom') ?? '1') || 1
    const effectiveLooptime = looptime * frameIntervalPDenom

    // Build metadata
    const metadata: LogMetadata = {
      firmwareVersion: headers.firmwareVersion?.toString() ?? 'Unknown',
      firmwareType: headers.firmwareKind ?? 'Betaflight',
      looptime: 1000000 / effectiveLooptime,
      gyroRate: 1000000 / looptime,
      motorCount: fieldNames.filter(f => f.startsWith('motor[')).length || 4,
      fieldNames,
      craftName: headers.craftName ?? undefined,
      debugMode: headers.debugMode ?? undefined,
      frameCount: 0,
      duration: 0,
    }

    // Parse frames
    postProgress(20, 'Decoding frames...')
    const dataParser = headers.getDataParser()
    const frames: LogFrame[] = []

    for (const event of dataParser) {
      if (event.kind === ParserEventKind.MainFrame) {
        const fields = event.data.fields
        const time = event.data.time * 1_000_000 // seconds → microseconds

        frames.push({
          time,
          loopIteration: fields.get('loopIteration') ?? frames.length,

          gyroADC: {
            roll:  fields.get('gyroADC[0]') ?? 0,
            pitch: fields.get('gyroADC[1]') ?? 0,
            yaw:   fields.get('gyroADC[2]') ?? 0,
          },

          setpoint: {
            roll:  fields.get('setpoint[0]') ?? 0,
            pitch: fields.get('setpoint[1]') ?? 0,
            yaw:   fields.get('setpoint[2]') ?? 0,
          },

          pidP: {
            roll:  fields.get('axisP[0]') ?? 0,
            pitch: fields.get('axisP[1]') ?? 0,
            yaw:   fields.get('axisP[2]') ?? 0,
          },

          pidI: {
            roll:  fields.get('axisI[0]') ?? 0,
            pitch: fields.get('axisI[1]') ?? 0,
            yaw:   fields.get('axisI[2]') ?? 0,
          },

          pidD: {
            roll:  fields.get('axisD[0]') ?? 0,
            pitch: fields.get('axisD[1]') ?? 0,
            yaw:   fields.get('axisD[2]') ?? 0,
          },

          pidSum: {
            roll:  (fields.get('axisP[0]') ?? 0) + (fields.get('axisI[0]') ?? 0) + (fields.get('axisD[0]') ?? 0),
            pitch: (fields.get('axisP[1]') ?? 0) + (fields.get('axisI[1]') ?? 0) + (fields.get('axisD[1]') ?? 0),
            yaw:   (fields.get('axisP[2]') ?? 0) + (fields.get('axisI[2]') ?? 0) + (fields.get('axisD[2]') ?? 0),
          },

          motor: [
            fields.get('motor[0]') ?? 1000,
            fields.get('motor[1]') ?? 1000,
            fields.get('motor[2]') ?? 1000,
            fields.get('motor[3]') ?? 1000,
          ],

          rcCommand: {
            roll:     fields.get('rcCommand[0]') ?? 0,
            pitch:    fields.get('rcCommand[1]') ?? 0,
            yaw:      fields.get('rcCommand[2]') ?? 0,
            throttle: fields.get('rcCommand[3]') ?? 1000,
          },

          throttle: fields.get('rcCommand[3]') ?? 1000,
        })

        if (frames.length % 5000 === 0) {
          const stats = dataParser.stats()
          const progress = 20 + Math.floor(stats.progress * 70)
          postProgress(progress, `Decoded ${frames.length} frames...`)
        }
      }
    }

    dataParser.free()

    if (frames.length === 0) {
      throw new Error('No frames found in BBL log')
    }

    // Zero-base timestamps (BBL contains absolute time since FC power-on)
    const timeOffset = frames[0].time
    for (const frame of frames) {
      frame.time -= timeOffset
    }

    // Finalize metadata
    metadata.frameCount = frames.length
    metadata.duration = frames[frames.length - 1].time / 1_000_000

    postProgress(95, 'Finalizing...')

    const completeMessage: ParseCompleteMessage = {
      type: 'complete',
      frames,
      metadata,
    }

    postProgress(100, 'Complete!')
    self.postMessage(completeMessage)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // The blackbox-log WASM library doesn't support newer Betaflight versions (4.5+).
    // Detect this and provide a helpful workaround message.
    if (/not supported/i.test(msg)) {
      throw new Error(
        msg +
        '. As a workaround, open the .bbl file in Betaflight Blackbox Explorer, ' +
        'export it as CSV, then upload the .csv file here instead.'
      )
    }
    if (error instanceof Error) throw error
    throw new Error('Failed to parse BBL file: ' + msg)
  } finally {
    logFile?.free()
  }
}

/**
 * Extract metadata from header
 */
function extractMetadata(
  headerMap: Map<string, string>,
  lines: string[],
  headerEndIndex: number
): LogMetadata {
  // Handle both Betaflight native format and CSV export format
  const firmwareType = headerMap.get('Firmware type') ?? headerMap.get('firmwareType') ?? 'Betaflight'
  const firmwareVersion = headerMap.get('Firmware revision') ?? headerMap.get('firmwareVersion') ?? headerMap.get('firmware') ?? 'Unknown'
  const looptimeStr = headerMap.get('looptime') ?? '125'
  const looptime = parseInt(looptimeStr) || 125 // microseconds

  const craftName = headerMap.get('Craft name') ?? headerMap.get('Craft name') ?? 'Unknown'
  const debugMode = headerMap.get('Debug mode') ?? headerMap.get('debug_mode') ?? undefined

  // Account for frame interval denominator (e.g., frameIntervalPDenom=2 means every other PID frame is logged)
  const frameIntervalPDenom = parseInt(headerMap.get('frameIntervalPDenom') ?? '1') || 1
  const effectiveLooptime = looptime * frameIntervalPDenom // Actual µs between logged frames

  // Field names
  const fieldLine = lines[headerEndIndex] ?? ''
  const fieldNames = fieldLine.startsWith('F ')
    ? fieldLine.substring(2).split(',').map(f => f.trim())
    : fieldLine.split(',').map(f => f.replace(/"/g, '').trim())

  // Count motors
  const motorCount = fieldNames.filter(f => f.startsWith('motor[')).length

  return {
    firmwareVersion,
    firmwareType,
    looptime: 1000000 / effectiveLooptime, // Convert to effective logging rate in Hz
    gyroRate: 1000000 / looptime, // Gyro still runs at PID loop rate
    motorCount: motorCount || 4,
    fieldNames,
    debugMode,
    craftName,
    frameCount: 0, // Will be updated after parsing
    duration: 0, // Will be updated after parsing
  }
}

/**
 * Detect time units from actual time values
 * Returns multiplier to convert to microseconds
 */
function detectTimeUnit(frames: LogFrame[], looptime: number): number {
  if (frames.length < 2) return 1000 // Default to milliseconds

  const timeDiff = frames[frames.length - 1].time - frames[0].time
  const expectedFrames = frames.length

  // Expected time per frame in microseconds (from looptime which is in Hz)
  const looptimeMicroseconds = 1000000 / looptime
  const expectedDiffMicroseconds = expectedFrames * looptimeMicroseconds

  // Check which multiplier gets us closest to expected
  const ratioIfMicroseconds = timeDiff / expectedDiffMicroseconds
  const ratioIfMilliseconds = (timeDiff * 1000) / expectedDiffMicroseconds
  const ratioIfSeconds = (timeDiff * 1000000) / expectedDiffMicroseconds

  // Return multiplier that gets us closest to 1.0 ratio
  if (Math.abs(ratioIfMicroseconds - 1) < 0.5) return 1 // Already microseconds
  if (Math.abs(ratioIfMilliseconds - 1) < 0.5) return 1000 // Milliseconds
  if (Math.abs(ratioIfSeconds - 1) < 0.5) return 1000000 // Seconds

  // Default to milliseconds for custom logs
  console.warn(`Time unit detection ambiguous. Defaulting to milliseconds.`)
  return 1000
}

/**
 * Post progress update
 */
function postProgress(progress: number, message: string): void {
  const progressMessage: ParseProgressMessage = {
    type: 'progress',
    progress,
    message,
  }
  self.postMessage(progressMessage)
}

export {}
