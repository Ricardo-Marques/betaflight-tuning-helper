import { makeAutoObservable, runInAction } from 'mobx'
import { createSerialConnection, isSerialSupported } from '../serial/SerialPort'
import type { SerialConnection } from '../serial/SerialPort'
import {
  enterCliMode,
  exitCliMode,
  readSettings,
  writeSettings,
} from '../serial/CliProtocol'
import type { SettingsStore } from './SettingsStore'

export type SerialStatus =
  | 'disconnected'
  | 'connecting'
  | 'entering_cli'
  | 'connected'
  | 'reading'
  | 'writing'
  | 'saving'
  | 'error'

export class SerialStore {
  status: SerialStatus = 'disconnected'
  errorMessage: string = ''
  progress: number = 0
  currentCommand: string = ''
  lastReadCount: number = 0
  lastWriteCount: number = 0
  lastWriteErrors: string[] = []

  private connection: SerialConnection | null = null
  private onError: ((message: string) => void) | null = null

  constructor() {
    makeAutoObservable<this, 'connection' | 'onError'>(this, {
      connection: false,
      onError: false,
    })
  }

  /** Register a callback for surfacing errors as toasts */
  setErrorHandler(handler: (message: string) => void): void {
    this.onError = handler
  }

  get isSupported(): boolean {
    return isSerialSupported()
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

  resetProgress = (): void => {
    this.progress = 0
    this.currentCommand = ''
    this.lastReadCount = 0
    this.lastWriteCount = 0
    this.lastWriteErrors = []
    this.errorMessage = ''
  }

  connect = async (): Promise<void> => {
    if (this.isBusy || this.isConnected) return

    this.status = 'connecting'
    this.resetProgress()

    try {
      const conn = createSerialConnection()
      conn.onDisconnect = () => {
        runInAction(() => {
          this.connection = null
          // If we were saving, the reboot disconnect is expected — show success
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
        // User cancelled the port picker — stay silent
        if (err instanceof DOMException && err.name === 'NotFoundError') {
          this.status = 'disconnected'
          return
        }
        this.status = 'error'
        this.errorMessage = describeError(err)
        this.onError?.(this.errorMessage)
      })
    }
  }

  disconnect = async (): Promise<void> => {
    if (this.connection) {
      await exitCliMode(this.connection)
      await this.connection.close()
      this.connection = null
    }
    this.status = 'disconnected'
    this.errorMessage = ''
  }

  readFromFC = async (
    getScript: string,
    settingsStore: SettingsStore,
  ): Promise<boolean> => {
    if (!this.connection || !this.connection.isOpen) {
      this.status = 'error'
      this.errorMessage = 'Not connected to FC'
      return false
    }

    this.status = 'reading'
    this.progress = 0
    this.currentCommand = ''
    this.lastReadCount = 0

    try {
      const output = await readSettings(
        this.connection,
        getScript,
        (progress, command) => {
          runInAction(() => {
            this.progress = progress
            this.currentCommand = command
          })
        },
      )

      const result = settingsStore.importFromCliOutput(output)

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
    if (!this.connection || !this.connection.isOpen) {
      this.status = 'error'
      this.errorMessage = 'Not connected to FC'
      return false
    }

    this.status = 'writing'
    this.progress = 0
    this.currentCommand = ''
    this.lastWriteCount = 0
    this.lastWriteErrors = []

    try {
      const result = await writeSettings(
        this.connection,
        cliCommands,
        (progress, command) => {
          runInAction(() => {
            this.progress = progress
            this.currentCommand = command
            if (command === 'save') {
              this.status = 'saving'
            }
          })
        },
      )

      runInAction(() => {
        this.lastWriteCount = result.commandsSent
        this.lastWriteErrors = result.errors
        this.progress = 100
        this.currentCommand = ''
        // After save, FC reboots. The disconnect handler will set status to 'disconnected'.
        // If for some reason it didn't disconnect yet, mark as disconnected.
        if (this.status === 'saving') {
          this.status = 'disconnected'
        }
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
  if (err instanceof DOMException) {
    if (err.name === 'NetworkError') {
      return 'Port in use. Close Betaflight Configurator and try again.'
    }
    if (err.name === 'SecurityError') {
      return 'Serial access denied. Check your browser permissions.'
    }
  }
  if (err instanceof Error) {
    if (err.message.includes('Timeout')) {
      return 'FC not responding. Make sure it\'s powered on and connected.'
    }
    return err.message
  }
  return 'An unknown error occurred'
}
