/**
 * Web Serial API type augmentation.
 * TypeScript doesn't include these by default.
 * See https://wicg.github.io/serial/
 */

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[]
}

interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialOpenOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface WebSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  getInfo(): SerialPortInfo
  open(options: SerialOpenOptions): Promise<void>
  close(): Promise<void>
  addEventListener(type: 'disconnect', listener: () => void): void
  removeEventListener(type: 'disconnect', listener: () => void): void
}

interface WebSerial {
  getPorts(): Promise<WebSerialPort[]>
  requestPort(options?: SerialPortRequestOptions): Promise<WebSerialPort>
  addEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
}

declare global {
  interface Navigator {
    serial?: WebSerial
  }
}

export type { WebSerialPort, WebSerial, SerialOpenOptions, SerialPortInfo }
