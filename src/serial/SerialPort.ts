/**
 * Low-level Web Serial API wrapper.
 * No MobX, no React — pure async I/O.
 */
import type { WebSerialPort } from './types'

export interface SerialConnection {
  /** Open the serial port via browser picker at the given baud rate */
  open(baudRate?: number): Promise<void>
  /** Close the port and release all resources */
  close(): Promise<void>
  /** Write a string to the serial port */
  write(data: string): Promise<void>
  /** Read lines until the given prompt string appears, with timeout */
  readUntilPrompt(prompt: string, timeoutMs: number): Promise<string>
  /** Whether the port is currently open */
  readonly isOpen: boolean
  /** Callback for unexpected disconnections */
  onDisconnect: (() => void) | null
}

/** Feature detection for Web Serial API */
export function isSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

const DEFAULT_BAUD_RATE = 115200
const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

export function createSerialConnection(): SerialConnection {
  let port: WebSerialPort | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let open = false

  const handleDisconnect = (): void => {
    open = false
    connection.onDisconnect?.()
  }

  const connection: SerialConnection = {
    onDisconnect: null,

    get isOpen(): boolean {
      return open
    },

    async open(baudRate = DEFAULT_BAUD_RATE): Promise<void> {
      if (!navigator.serial) {
        throw new Error('Web Serial API is not supported in this browser')
      }
      port = await navigator.serial.requestPort()
      await port.open({ baudRate })
      port.addEventListener('disconnect', handleDisconnect)
      open = true
    },

    async close(): Promise<void> {
      if (reader) {
        try { await reader.cancel() } catch { /* already closed */ }
        reader = null
      }
      if (port) {
        port.removeEventListener('disconnect', handleDisconnect)
        try { await port.close() } catch { /* already closed */ }
        port = null
      }
      open = false
    },

    async write(data: string): Promise<void> {
      if (!port?.writable) {
        throw new Error('Serial port is not open')
      }
      const writer = port.writable.getWriter()
      try {
        await writer.write(TEXT_ENCODER.encode(data))
      } finally {
        writer.releaseLock()
      }
    },

    async readUntilPrompt(prompt: string, timeoutMs: number): Promise<string> {
      if (!port?.readable) {
        throw new Error('Serial port is not open')
      }

      // Acquire a fresh reader for each read operation
      reader = port.readable.getReader()
      let buffer = ''

      try {
        const deadline = Date.now() + timeoutMs

        while (Date.now() < deadline) {
          const remaining = deadline - Date.now()
          if (remaining <= 0) break

          const result = await Promise.race([
            reader.read(),
            new Promise<{ done: true; value: undefined }>(resolve =>
              setTimeout(() => resolve({ done: true, value: undefined }), remaining)
            ),
          ])

          if (result.done) break

          if (result.value) {
            buffer += TEXT_DECODER.decode(result.value, { stream: true })
          }

          // Check if the prompt appears at the end of the buffer (after trimming trailing whitespace)
          if (buffer.trimEnd().endsWith(prompt)) {
            return buffer
          }
        }

        // Timeout reached — return what we have
        if (buffer.trimEnd().endsWith(prompt)) {
          return buffer
        }
        throw new Error(`Timeout waiting for "${prompt}" prompt`)
      } finally {
        try { reader.releaseLock() } catch { /* already released */ }
        reader = null
      }
    },
  }

  return connection
}
