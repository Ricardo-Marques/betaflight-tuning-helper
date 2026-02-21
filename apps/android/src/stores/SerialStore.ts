/**
 * SerialStore for the Android app.
 *
 * Identical logic to the web SerialStore except:
 * - Uses createAndroidSerialConnection() instead of createSerialConnection()
 * - No DOMException handling (Android throws regular Errors)
 * - No isSupported check (always true on Android with USB OTG)
 *
 * All CLI protocol logic (CliProtocol.ts) works unchanged.
 */
import { makeAutoObservable, runInAction } from 'mobx'
import type { SerialConnection } from '@bf-tuner/serial-protocol/SerialPort'
import {
  enterCliMode,
  exitCliMode,
  readSettings,
  writeSettings,
} from '@bf-tuner/serial-protocol/CliProtocol'
import { createAndroidSerialConnection, listUsbDevices, type UsbDeviceInfo } from '../serial/AndroidUsbSerial'

export type SerialStatus =
  | 'disconnected'
  | 'connecting'
  | 'entering_cli'
  | 'connected'
  | 'reading'
  | 'writing'
  | 'saving'
  | 'error'

export interface SettingsImportResult {
  parsedCount: number
}

/** Minimal interface for settings import — avoids importing SettingsStore */
interface SettingsConsumer {
  importFromCliOutput(text: string): SettingsImportResult
}

export class SerialStore {
  status: SerialStatus = 'disconnected'
  errorMessage: string = ''
  progress: number = 0
  currentCommand: string = ''
  lastReadCount: number = 0
  lastWriteCount: number = 0
  lastWriteErrors: string[] = []

  /** Currently available USB devices (updated when listing) */
  availableDevices: UsbDeviceInfo[] = []

  private connection: SerialConnection | null = null

  constructor() {
    makeAutoObservable<this, 'connection'>(this, {
      connection: false,
    })
  }

  get isConnected(): boolean {
    return this.status === 'connected'
  }

  get isBusy(): boolean {
    return (
      this.status === 'connecting' ||
      this.status === 'entering_cli' ||
      this.status === 'reading' ||
      this.status === 'writing' ||
      this.status === 'saving'
    )
  }

  /** Refresh the list of connected USB devices. */
  listDevices = async (): Promise<void> => {
    const devices = await listUsbDevices()
    runInAction(() => { this.availableDevices = devices })
  }

  /** Connect to a specific USB device and enter Betaflight CLI mode. */
  connect = async (deviceId?: number): Promise<void> => {
    if (this.isBusy || this.isConnected) return

    runInAction(() => {
      this.status = 'connecting'
      this.progress = 0
      this.errorMessage = ''
    })

    try {
      const conn = createAndroidSerialConnection(deviceId)
      conn.onDisconnect = () => {
        runInAction(() => {
          this.connection = null
          if (this.status === 'saving') {
            this.status = 'disconnected'
          } else if (this.status !== 'disconnected') {
            this.status = 'disconnected'
            this.errorMessage = 'FC disconnected unexpectedly'
          }
        })
      }

      await conn.open()
      this.connection = conn

      runInAction(() => { this.status = 'entering_cli' })
      await enterCliMode(conn)

      runInAction(() => { this.status = 'connected' })
    } catch (err) {
      runInAction(() => {
        this.connection = null
        this.status = 'error'
        this.errorMessage = describeError(err)
      })
    }
  }

  disconnect = async (): Promise<void> => {
    if (this.connection) {
      try { await exitCliMode(this.connection) } catch { /* ignore */ }
      try { await this.connection.close() } catch { /* ignore */ }
      this.connection = null
    }
    runInAction(() => {
      this.status = 'disconnected'
      this.errorMessage = ''
    })
  }

  readFromFC = async (
    getScript: string,
    settingsConsumer: SettingsConsumer
  ): Promise<boolean> => {
    if (!this.connection?.isOpen) {
      runInAction(() => {
        this.status = 'error'
        this.errorMessage = 'Connection lost. Unplug and re-plug the FC, then try again.'
      })
      return false
    }

    runInAction(() => {
      this.status = 'reading'
      this.progress = 0
      this.currentCommand = ''
      this.lastReadCount = 0
    })

    try {
      const output = await readSettings(
        this.connection,
        getScript,
        (progress, command) => {
          runInAction(() => {
            this.progress = progress
            this.currentCommand = command
          })
        }
      )

      const result = settingsConsumer.importFromCliOutput(output)

      runInAction(() => {
        this.lastReadCount = result.parsedCount
        this.progress = 100
        this.currentCommand = ''
        this.status = 'connected'
      })
      return true
    } catch (err) {
      runInAction(() => {
        this.status = 'error'
        this.errorMessage = describeError(err)
      })
      return false
    }
  }

  writeToFC = async (cliCommands: string): Promise<boolean> => {
    if (!this.connection?.isOpen) {
      runInAction(() => {
        this.status = 'error'
        this.errorMessage = 'Connection lost. Unplug and re-plug the FC, then try again.'
      })
      return false
    }

    runInAction(() => {
      this.status = 'writing'
      this.progress = 0
      this.currentCommand = ''
      this.lastWriteCount = 0
      this.lastWriteErrors = []
    })

    try {
      const result = await writeSettings(
        this.connection,
        cliCommands,
        (progress, command) => {
          runInAction(() => {
            this.progress = progress
            this.currentCommand = command
            if (command === 'save') this.status = 'saving'
          })
        }
      )

      runInAction(() => {
        this.lastWriteCount = result.commandsSent
        this.lastWriteErrors = result.errors
        this.progress = 100
        this.currentCommand = ''
        if (this.status === 'saving') this.status = 'disconnected'
      })
      return true
    } catch (err) {
      runInAction(() => {
        this.status = 'error'
        this.errorMessage = describeError(err)
      })
      return false
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes('Timeout')) {
      return "FC not responding. Make sure it's powered on and connected via OTG cable."
    }
    if (err.message.includes('permission')) {
      return 'USB permission denied. Please allow access when prompted.'
    }
    return err.message
  }
  return 'An unknown error occurred'
}
