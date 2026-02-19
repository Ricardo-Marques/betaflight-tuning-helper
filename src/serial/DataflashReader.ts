/**
 * Dataflash download and log enumeration.
 * Reads blackbox data from FC onboard flash via MSP, scanning for log
 * boundaries as chunks arrive so the user can pick a log before the
 * full download completes.
 */
import type { SerialConnection } from './SerialPort'
import {
  sendMspCommand,
  parseDataflashSummary,
  MSP_DATAFLASH_SUMMARY,
  MSP_DATAFLASH_READ,
  MSP_DATAFLASH_ERASE,
} from './MspProtocol'
import type { DataflashSummary } from './MspProtocol'
import { findLogStart, parseHeaders } from '../domain/blackbox/HeaderParser'

/* ---- Types ---- */

export interface FlashLogEntry {
  index: number
  startOffset: number
  /** Size in bytes. 0 while the log's end hasn't been found yet. */
  size: number
  craftName: string | undefined
  firmwareVersion: string | undefined
}

export interface DownloadProgress {
  bytesDownloaded: number
  totalBytes: number
  speedBytesPerSec: number
  estimatedSecondsRemaining: number
}

/* ---- Constants ---- */

const CHUNK_SIZE = 4096
const CHUNK_TIMEOUT = 5000
const MAX_CONSECUTIVE_FAILURES = 3
const SPEED_WINDOW_SIZE = 10

// "H Product:" marker length — overlap this many bytes when scanning across chunk boundaries
const LOG_MARKER_LENGTH = 10

/* ---- Dataflash summary ---- */

export async function readDataflashSummary(connection: SerialConnection): Promise<DataflashSummary> {
  const response = await sendMspCommand(connection, MSP_DATAFLASH_SUMMARY)
  return parseDataflashSummary(response.payload)
}

/* ---- Dataflash download with incremental log scanning ---- */

export interface DownloadCallbacks {
  onProgress?: (progress: DownloadProgress) => void
  /** Called each time a new log header is discovered during download. */
  onLogFound?: (log: FlashLogEntry) => void
}

/**
 * Download the used portion of dataflash in chunks.
 * Scans for "H Product:" log boundaries as data arrives and reports them
 * via `onLogFound` so the UI can show a growing log list.
 *
 * Returns the downloaded buffer. Respects AbortSignal for cancellation.
 */
export async function downloadDataflash(
  connection: SerialConnection,
  usedSize: number,
  callbacks?: DownloadCallbacks,
  signal?: AbortSignal,
  /** Pre-allocated buffer to write into. Allows the caller to access
   *  partially-downloaded data while the download is still running. */
  buffer?: Uint8Array,
): Promise<Uint8Array> {
  const result = buffer ?? new Uint8Array(usedSize)
  let offset = 0
  let consecutiveFailures = 0

  // Speed tracking
  const chunkTimes: { bytes: number; ms: number }[] = []
  let lastChunkTime = performance.now()

  // Incremental log scanning state
  let lastScanOffset = 0
  let logIndex = 1
  const foundLogOffsets = new Set<number>()

  while (offset < usedSize) {
    if (signal?.aborted) {
      throw new DOMException('Download cancelled', 'AbortError')
    }

    const remaining = usedSize - offset
    const requestSize = Math.min(CHUNK_SIZE, remaining)

    // Build request payload: address (uint32 LE) + length (uint16 LE)
    const requestPayload = new Uint8Array(6)
    const view = new DataView(requestPayload.buffer)
    view.setUint32(0, offset, true)
    view.setUint16(4, requestSize, true)

    try {
      const response = await sendMspCommand(
        connection,
        MSP_DATAFLASH_READ,
        requestPayload,
        CHUNK_TIMEOUT,
      )

      // Response: address (uint32 LE) + isCompressed (uint8) + compressedSize (uint16 LE) + data
      const isCompressed = response.payload[4]
      if (isCompressed) {
        throw new Error('Compressed dataflash not supported. Try erasing flash and re-recording.')
      }

      const dataStart = 7
      const data = response.payload.slice(dataStart)
      const dataLen = Math.min(data.length, remaining)

      if (dataLen === 0) {
        consecutiveFailures++
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw new Error(`Failed to read data at offset ${offset} after ${MAX_CONSECUTIVE_FAILURES} attempts`)
        }
        continue
      }

      result.set(data.subarray(0, dataLen), offset)
      offset += dataLen
      consecutiveFailures = 0

      // Check for all-0xFF padding (erased flash) — we've hit the end
      if (dataLen === CHUNK_SIZE) {
        let allFF = true
        for (let i = 0; i < dataLen; i++) {
          if (data[i] !== 0xFF) { allFF = false; break }
        }
        if (allFF) {
          return result.slice(0, offset - dataLen)
        }
      }

      // --- Scan new data for log headers ---
      // Overlap by marker length to catch markers that span chunk boundaries
      const scanFrom = Math.max(0, lastScanOffset - LOG_MARKER_LENGTH)
      let searchPos = scanFrom
      while (searchPos < offset) {
        const logStart = findLogStart(result, searchPos)
        if (logStart === -1 || logStart >= offset) break

        if (!foundLogOffsets.has(logStart)) {
          foundLogOffsets.add(logStart)

          let craftName: string | undefined
          let firmwareVersion: string | undefined
          try {
            const headers = parseHeaders(result, logStart)
            craftName = headers.headerMap.get('Craft name') || undefined
            firmwareVersion = headers.headerMap.get('Firmware revision') || undefined
          } catch {
            // Headers may be truncated if we haven't downloaded enough yet
          }

          const entry: FlashLogEntry = {
            index: logIndex,
            startOffset: logStart,
            size: 0, // filled in by the store once the next log start is known
            craftName,
            firmwareVersion,
          }
          logIndex++
          callbacks?.onLogFound?.(entry)
        }

        searchPos = logStart + 1
      }
      lastScanOffset = offset

      // --- Speed / progress ---
      const now = performance.now()
      chunkTimes.push({ bytes: dataLen, ms: now - lastChunkTime })
      lastChunkTime = now
      if (chunkTimes.length > SPEED_WINDOW_SIZE) chunkTimes.shift()

      const totalMs = chunkTimes.reduce((sum, c) => sum + c.ms, 0)
      const totalBytes = chunkTimes.reduce((sum, c) => sum + c.bytes, 0)
      const speedBytesPerSec = totalMs > 0 ? (totalBytes / totalMs) * 1000 : 0
      const bytesRemaining = usedSize - offset
      const estimatedSecondsRemaining = speedBytesPerSec > 0 ? bytesRemaining / speedBytesPerSec : 0

      callbacks?.onProgress?.({
        bytesDownloaded: offset,
        totalBytes: usedSize,
        speedBytesPerSec,
        estimatedSecondsRemaining,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err

      consecutiveFailures++
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw err
    }
  }

  // Trim trailing 0xFF padding
  let effectiveEnd = offset
  while (effectiveEnd > 0 && result[effectiveEnd - 1] === 0xFF) {
    effectiveEnd--
  }

  return effectiveEnd < offset ? result.slice(0, effectiveEnd) : result.slice(0, offset)
}

/* ---- Dataflash erase ---- */

const ERASE_POLL_INTERVAL = 1000
const ERASE_TIMEOUT = 120_000

/**
 * Erase all blackbox data from onboard flash.
 * Sends MSP_DATAFLASH_ERASE, then polls MSP_DATAFLASH_SUMMARY
 * until usedSize reaches 0 or timeout is exceeded.
 */
export async function eraseDataflash(
  connection: SerialConnection,
  onProgress?: (message: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  onProgress?.('Sending erase command...')
  await sendMspCommand(connection, MSP_DATAFLASH_ERASE)

  const startTime = Date.now()
  onProgress?.('Erasing flash...')

  while (Date.now() - startTime < ERASE_TIMEOUT) {
    if (signal?.aborted) {
      throw new DOMException('Erase cancelled', 'AbortError')
    }

    await new Promise(resolve => setTimeout(resolve, ERASE_POLL_INTERVAL))

    const summary = await readDataflashSummary(connection)
    if (summary.usedSize === 0) {
      return
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    onProgress?.(`Erasing flash... ${elapsed}s`)
  }

  throw new Error('Flash erase timed out. The FC may still be erasing — wait and try reconnecting.')
}

/* ---- Log enumeration (for post-download use) ---- */

/**
 * Find all blackbox logs in a fully-downloaded flash buffer.
 * Used as a fallback or to finalize log sizes after download.
 */
export function findAllLogs(data: Uint8Array): FlashLogEntry[] {
  const logs: FlashLogEntry[] = []
  let searchFrom = 0
  let index = 1

  while (searchFrom < data.length) {
    const logStart = findLogStart(data, searchFrom)
    if (logStart === -1) break

    let craftName: string | undefined
    let firmwareVersion: string | undefined
    try {
      const headers = parseHeaders(data, logStart)
      craftName = headers.headerMap.get('Craft name') || undefined
      firmwareVersion = headers.headerMap.get('Firmware revision') || undefined
    } catch {
      // Headers may be corrupted
    }

    logs.push({ index, startOffset: logStart, size: 0, craftName, firmwareVersion })
    index++
    searchFrom = logStart + 1
  }

  // Calculate sizes from gaps
  for (let i = 0; i < logs.length; i++) {
    logs[i].size = i < logs.length - 1
      ? logs[i + 1].startOffset - logs[i].startOffset
      : data.length - logs[i].startOffset
  }

  return logs
}
