/**
 * Android USB OTG serial connection.
 * Implements the same SerialConnection interface as the web app's Web Serial implementation,
 * so all protocol code (CliProtocol, MspProtocol, DataflashReader) works unchanged.
 *
 * Uses react-native-usb-serialport-for-android v0.5.x which wraps usb-serial-for-android.
 * Supports CP210x, CH340/CH341, FTDI, CDC ACM — all common FC USB chips.
 *
 * Key API differences from the web's Web Serial API:
 * - send() takes a HEX string, not Uint8Array
 * - received data arrives as HEX string via onReceived() event
 * - open() returns a UsbSerial object (not a stream)
 */
import type { SerialConnection } from '@bf-tuner/serial-protocol/SerialPort'
import {
  UsbSerialManager,
  Parity,
  type UsbSerial,
  type Device,
} from 'react-native-usb-serialport-for-android'

const DEFAULT_BAUD_RATE = 115200
const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

export interface UsbDeviceInfo {
  deviceId: number
  productName: string
  vendorId: number
  productId: number
}

function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export async function listUsbDevices(): Promise<UsbDeviceInfo[]> {
  const devices: Device[] = await UsbSerialManager.list()
  return devices.map(d => ({
    deviceId: d.deviceId,
    productName: `USB Device (VID:${d.vendorId.toString(16).padStart(4, '0')} PID:${d.productId.toString(16).padStart(4, '0')})`,
    vendorId: d.vendorId,
    productId: d.productId,
  }))
}

export function createAndroidSerialConnection(deviceId?: number): SerialConnection {
  let port: UsbSerial | null = null
  let open = false

  let readBuffer = new Uint8Array(0)
  let pendingReadResolve: ((data: Uint8Array) => void) | null = null
  let pendingReadPredicate: ((buf: Uint8Array) => boolean) | null = null

  const appendToBuffer = (newData: Uint8Array): void => {
    const merged = new Uint8Array(readBuffer.length + newData.length)
    merged.set(readBuffer, 0)
    merged.set(newData, readBuffer.length)
    readBuffer = merged

    if (pendingReadPredicate && pendingReadResolve && pendingReadPredicate(readBuffer)) {
      const result = readBuffer
      readBuffer = new Uint8Array(0)
      pendingReadPredicate = null
      const resolve = pendingReadResolve
      pendingReadResolve = null
      resolve(result)
    }
  }

  const connection: SerialConnection = {
    onDisconnect: null,

    get isOpen(): boolean {
      return open
    },

    async open(baudRate = DEFAULT_BAUD_RATE): Promise<void> {
      let targetDeviceId = deviceId

      if (targetDeviceId == null) {
        const devices = await UsbSerialManager.list()
        if (devices.length === 0) {
          throw new Error('No USB devices found. Connect a flight controller via OTG cable.')
        }
        targetDeviceId = devices[0].deviceId
      }

      const alreadyGranted = await UsbSerialManager.tryRequestPermission(targetDeviceId)
      if (!alreadyGranted) {
        const hasIt = await UsbSerialManager.hasPermission(targetDeviceId)
        if (!hasIt) {
          throw new Error('USB permission denied. Please allow access when prompted.')
        }
      }

      port = await UsbSerialManager.open(targetDeviceId, {
        baudRate,
        parity: Parity.None,
        dataBits: 8,
        stopBits: 1,
      })

      port.onReceived((event) => {
        if (!event.data) return
        appendToBuffer(fromHex(event.data))
      })

      open = true
    },

    async close(): Promise<void> {
      open = false
      pendingReadResolve = null
      pendingReadPredicate = null
      readBuffer = new Uint8Array(0)

      if (port) {
        try { await port.close() } catch { /* already closed */ }
        port = null
      }

      connection.onDisconnect?.()
    },

    async write(data: string): Promise<void> {
      if (!port) throw new Error('USB serial port is not open')
      await port.send(toHex(TEXT_ENCODER.encode(data)))
    },

    async writeBytes(data: Uint8Array): Promise<void> {
      if (!port) throw new Error('USB serial port is not open')
      await port.send(toHex(data))
    },

    async readUntilPrompt(prompt: string, timeoutMs: number): Promise<string> {
      const bytes = await connection.readBytesUntil((buffer) => {
        const text = TEXT_DECODER.decode(buffer)
        return text.trimEnd().endsWith(prompt)
      }, timeoutMs)
      return TEXT_DECODER.decode(bytes)
    },

    async readBytesUntil(shouldStop: (buffer: Uint8Array) => boolean, timeoutMs: number): Promise<Uint8Array> {
      if (!port) throw new Error('USB serial port is not open')

      if (readBuffer.length > 0 && shouldStop(readBuffer)) {
        const result = readBuffer
        readBuffer = new Uint8Array(0)
        return result
      }

      return new Promise<Uint8Array>((resolve) => {
        const timer = setTimeout(() => {
          pendingReadResolve = null
          pendingReadPredicate = null
          const partial = readBuffer
          readBuffer = new Uint8Array(0)
          resolve(partial)
        }, timeoutMs)

        pendingReadResolve = (data) => {
          clearTimeout(timer)
          resolve(data)
        }
        pendingReadPredicate = shouldStop
      })
    },
  }

  return connection
}
