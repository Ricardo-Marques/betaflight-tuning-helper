/**
 * MSP (MultiWii Serial Protocol) v2 implementation.
 * Pure protocol logic — no React/MobX dependencies.
 *
 * MSP v2 frame format (request):
 *   $X< [flag:1] [command:2 LE] [payloadSize:2 LE] [payload:N] [crc8:1]
 *
 * MSP v2 frame format (response — success):
 *   $X> [flag:1] [command:2 LE] [payloadSize:2 LE] [payload:N] [crc8:1]
 *
 * MSP v2 frame format (response — error):
 *   $X! [flag:1] [command:2 LE] [payloadSize:2 LE] [payload:N] [crc8:1]
 */
import type { SerialConnection } from './SerialPort'

/* ---- MSP command constants (decimal, per Betaflight msp_protocol.h) ---- */

export const MSP_API_VERSION = 1
export const MSP_DATAFLASH_SUMMARY = 70
export const MSP_DATAFLASH_READ = 71
export const MSP_DATAFLASH_ERASE = 72

/* ---- Types ---- */

export interface MspResponse {
  command: number
  payload: Uint8Array
  isError: boolean
}

export interface DataflashSummary {
  /** Bit 1 of flags — FC has onboard flash hardware */
  supported: boolean
  /** Bit 0 of flags — flash is initialized and ready for I/O */
  ready: boolean
  sectors: number
  totalSize: number
  usedSize: number
}

/* ---- CRC8 DVB-S2 ---- */

export function crc8DvbS2(data: Uint8Array, start = 0, end = data.length): number {
  let crc = 0
  for (let i = start; i < end; i++) {
    crc ^= data[i]
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0xD5) & 0xFF
      } else {
        crc = (crc << 1) & 0xFF
      }
    }
  }
  return crc
}

/** MSP v1 XOR checksum: payloadSize ^ command ^ each payload byte */
function mspV1Checksum(payloadSize: number, command: number, payload: Uint8Array): number {
  let crc = payloadSize ^ command
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload[i]
  }
  return crc & 0xFF
}

/* ---- Encode / Parse ---- */

/**
 * Build an MSP v2 request frame: $X< [flag] [cmd LE16] [size LE16] [payload] [crc8]
 */
export function encodeMspV2Request(command: number, payload?: Uint8Array): Uint8Array {
  const payloadLen = payload?.length ?? 0
  const frame = new Uint8Array(9 + payloadLen)
  frame[0] = 0x24 // $
  frame[1] = 0x58 // X
  frame[2] = 0x3C // <
  frame[3] = 0x00 // flag
  frame[4] = command & 0xFF
  frame[5] = (command >> 8) & 0xFF
  frame[6] = payloadLen & 0xFF
  frame[7] = (payloadLen >> 8) & 0xFF

  if (payload) {
    frame.set(payload, 8)
  }

  frame[8 + payloadLen] = crc8DvbS2(frame, 3, 8 + payloadLen)

  return frame
}

const MSP_RESPONSE_OK = 0x3E  // >
const MSP_RESPONSE_ERR = 0x21 // !

/**
 * Try to parse an MSP response from a buffer, starting at `searchFrom`.
 * Skips past false preambles whose checksums don't match.
 * Returns the parsed response and how many bytes were consumed, or null
 * if no complete valid frame was found.
 */
export function parseMspResponse(
  buffer: Uint8Array,
  searchFrom = 0,
): { response: MspResponse; consumed: number } | null {
  let pos = searchFrom

  while (pos <= buffer.length - 6) { // minimum valid frame: 3 preamble + 1 size + 1 cmd + 1 crc
    // Scan for next preamble
    let preambleIdx = -1
    let isV2 = false
    let isError = false

    for (let i = pos; i <= buffer.length - 3; i++) {
      if (buffer[i] !== 0x24) continue // $

      const proto = buffer[i + 1]
      const dir = buffer[i + 2]

      if (proto === 0x58 && (dir === MSP_RESPONSE_OK || dir === MSP_RESPONSE_ERR)) {
        preambleIdx = i; isV2 = true; isError = dir === MSP_RESPONSE_ERR; break
      }
      if (proto === 0x4D && (dir === MSP_RESPONSE_OK || dir === MSP_RESPONSE_ERR)) {
        preambleIdx = i; isV2 = false; isError = dir === MSP_RESPONSE_ERR; break
      }
    }

    if (preambleIdx === -1) return null

    if (isV2) {
      const headerEnd = preambleIdx + 8
      if (buffer.length < headerEnd) return null // incomplete — wait for more data

      const payloadSize = buffer[preambleIdx + 6] | (buffer[preambleIdx + 7] << 8)

      // Sanity: reject absurdly large payloads (max 8KB for dataflash reads)
      if (payloadSize > 8192) {
        pos = preambleIdx + 1
        continue
      }

      const frameEnd = headerEnd + payloadSize + 1
      if (buffer.length < frameEnd) return null // incomplete — wait for more data

      const expectedCrc = crc8DvbS2(buffer, preambleIdx + 3, frameEnd - 1)
      if (buffer[frameEnd - 1] !== expectedCrc) {
        // CRC mismatch — false preamble. Skip past it and keep scanning.
        pos = preambleIdx + 1
        continue
      }

      const command = buffer[preambleIdx + 4] | (buffer[preambleIdx + 5] << 8)
      const payload = buffer.slice(headerEnd, headerEnd + payloadSize)
      return { response: { command, payload, isError }, consumed: frameEnd }

    } else {
      // MSP v1: preamble(3) + payloadSize(1) + cmd(1) + payload(N) + checksum(1)
      if (buffer.length < preambleIdx + 5) return null // incomplete
      const payloadSize = buffer[preambleIdx + 3]

      if (payloadSize > 255) {
        pos = preambleIdx + 1
        continue
      }

      const frameEnd = preambleIdx + 5 + payloadSize + 1
      if (buffer.length < frameEnd) return null // incomplete

      const command = buffer[preambleIdx + 4]
      const payload = buffer.slice(preambleIdx + 5, preambleIdx + 5 + payloadSize)

      // Validate v1 XOR checksum
      const expectedChecksum = mspV1Checksum(payloadSize, command, payload)
      if (buffer[frameEnd - 1] !== expectedChecksum) {
        pos = preambleIdx + 1
        continue
      }

      return { response: { command, payload, isError }, consumed: frameEnd }
    }
  }

  return null
}

/**
 * Scan through a buffer looking for a valid MSP response with the given command ID.
 * Skips past valid frames for other commands and false preambles.
 */
function findResponseForCommand(buffer: Uint8Array, command: number): MspResponse | null {
  let offset = 0
  while (offset < buffer.length) {
    const result = parseMspResponse(buffer, offset)
    if (!result) return null
    if (result.response.command === command) return result.response
    offset = result.consumed
  }
  return null
}

/* ---- Send / Receive ---- */

const DEFAULT_TIMEOUT = 5000

/**
 * Send an MSP command and wait for a response with the matching command ID.
 * Ignores stale frames from boot noise or other commands.
 */
export async function sendMspCommand(
  connection: SerialConnection,
  command: number,
  payload?: Uint8Array,
  timeout = DEFAULT_TIMEOUT,
): Promise<MspResponse> {
  const frame = encodeMspV2Request(command, payload)
  await connection.writeBytes(frame)

  const raw = await connection.readBytesUntil(
    (buf) => findResponseForCommand(buf, command) !== null,
    timeout,
  )

  const response = findResponseForCommand(raw, command)
  if (!response) {
    throw new Error(`No valid MSP response for command ${command}`)
  }

  if (response.isError) {
    throw new Error(`FC rejected MSP command ${command} (unsupported or failed)`)
  }

  return response
}

/**
 * Drain any buffered data from the serial port (e.g., FC banner after port opens).
 * Reads for a short period and discards everything.
 */
export async function drainSerialBuffer(connection: SerialConnection): Promise<void> {
  await connection.readBytesUntil(() => false, 500)
}

/* ---- Dataflash helpers ---- */

/**
 * Parse a DATAFLASH_SUMMARY response payload into structured data.
 */
export function parseDataflashSummary(payload: Uint8Array): DataflashSummary {
  if (payload.length < 13) {
    throw new Error('Invalid DATAFLASH_SUMMARY response: payload too short')
  }

  const flags = payload[0]
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  return {
    supported: (flags & 0x02) !== 0,
    ready: (flags & 0x01) !== 0,
    sectors: view.getUint32(1, true),
    totalSize: view.getUint32(5, true),
    usedSize: view.getUint32(9, true),
  }
}
