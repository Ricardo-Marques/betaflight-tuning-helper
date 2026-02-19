import { makeAutoObservable, runInAction } from 'mobx'
import { createSerialConnection } from '../serial/SerialPort'
import type { SerialConnection } from '../serial/SerialPort'
import {
  readDataflashSummary,
  downloadDataflash,
  eraseDataflash,
} from '../serial/DataflashReader'
import { drainSerialBuffer, sendMspCommand, MSP_API_VERSION } from '../serial/MspProtocol'
import type { FlashLogEntry } from '../serial/DataflashReader'
import type { LogStore } from './LogStore'

export type FlashDownloadStatus =
  | 'idle'
  | 'connecting'
  | 'reading_summary'
  | 'downloading'
  | 'pick_log'
  | 'complete'
  | 'erasing'
  | 'erase_complete'
  | 'error'

export class FlashDownloadStore {
  status: FlashDownloadStatus = 'idle'
  errorMessage: string = ''
  eraseMessage: string = ''

  flashTotalSize: number = 0
  flashUsedSize: number = 0

  bytesDownloaded: number = 0
  speedBytesPerSec: number = 0
  estimatedSecondsRemaining: number = 0

  /** Grows during download as log headers are found. */
  logs: FlashLogEntry[] = []
  selectedLogIndex: number = -1

  private connection: SerialConnection | null = null
  private abortController: AbortController | null = null
  private flashBuffer: Uint8Array | null = null
  private onError: ((message: string) => void) | null = null

  constructor() {
    makeAutoObservable<this, 'connection' | 'abortController' | 'flashBuffer' | 'onError'>(this, {
      connection: false,
      abortController: false,
      flashBuffer: false,
      onError: false,
    })
  }

  setErrorHandler(handler: (message: string) => void): void {
    this.onError = handler
  }

  get downloadPercent(): number {
    if (this.flashUsedSize === 0) return 0
    return Math.min(100, (this.bytesDownloaded / this.flashUsedSize) * 100)
  }

  get isBusy(): boolean {
    return (
      this.status === 'connecting' ||
      this.status === 'reading_summary' ||
      this.status === 'downloading' ||
      this.status === 'erasing'
    )
  }

  get isDownloadComplete(): boolean {
    return this.status === 'pick_log'
  }

  /**
   * Whether a log at the given index can be selected right now.
   * Requires: the log exists, its size is known (> 0), and its data
   * range is within the already-downloaded buffer.
   */
  canSelectLog = (index: number): boolean => {
    const log = this.logs[index]
    if (!log || log.size === 0) return false
    return (log.startOffset + log.size) <= this.bytesDownloaded
  }

  /**
   * Open serial port (raw binary — no CLI mode), read dataflash summary,
   * and start downloading.
   */
  connect = async (): Promise<void> => {
    if (this.isBusy) return

    this.reset()
    this.status = 'connecting'

    try {
      const conn = createSerialConnection()
      conn.onDisconnect = () => {
        runInAction(() => {
          this.connection = null
          if (this.status !== 'idle' && this.status !== 'complete' && this.status !== 'error') {
            this.status = 'error'
            this.errorMessage = 'FC disconnected unexpectedly'
          }
        })
      }

      await conn.open()
      this.connection = conn

      // Drain any buffered data (e.g., FC banner or leftover CLI output after boot)
      await drainSerialBuffer(conn)

      // Handshake: send a lightweight command to confirm the FC is in MSP mode
      // and clear any remaining boot noise. This is what Betaflight Configurator does.
      await sendMspCommand(conn, MSP_API_VERSION)

      runInAction(() => { this.status = 'reading_summary' })
      const summary = await readDataflashSummary(conn)

      if (!summary.supported) {
        await this.closeConnection()
        runInAction(() => {
          this.status = 'error'
          this.errorMessage =
            'This FC doesn\'t have onboard flash memory. ' +
            'If it uses an SD card, remove the card and open the .bbl file directly.'
        })
        return
      }

      if (!summary.ready) {
        await this.closeConnection()
        runInAction(() => {
          this.status = 'error'
          this.errorMessage = 'Flash chip detected but not ready. Try disconnecting and reconnecting the FC.'
        })
        return
      }

      if (summary.usedSize === 0) {
        await this.closeConnection()
        runInAction(() => {
          this.status = 'error'
          this.errorMessage = 'No blackbox data on flash. Record a flight first.'
        })
        return
      }

      runInAction(() => {
        this.flashTotalSize = summary.totalSize
        this.flashUsedSize = summary.usedSize
      })

      await this.startDownload()
    } catch (err) {
      await this.closeConnection()
      runInAction(() => {
        // User cancelled the port picker — stay silent
        if (err instanceof DOMException && err.name === 'NotFoundError') {
          this.status = 'idle'
          return
        }
        this.status = 'error'
        this.errorMessage = describeFlashError(err)
        this.onError?.(this.errorMessage)
      })
    }
  }

  /**
   * Download flash data, scanning for log boundaries as chunks arrive.
   */
  startDownload = async (): Promise<void> => {
    if (!this.connection || !this.connection.isOpen) {
      this.status = 'error'
      this.errorMessage = 'Connection lost. Click Retry to reconnect.'
      return
    }

    this.status = 'downloading'
    this.bytesDownloaded = 0
    this.speedBytesPerSec = 0
    this.estimatedSecondsRemaining = 0
    this.logs = []
    this.abortController = new AbortController()

    // Pre-allocate the buffer so selectAndParse can read partially-downloaded data
    this.flashBuffer = new Uint8Array(this.flashUsedSize)

    try {
      const buffer = await downloadDataflash(
        this.connection,
        this.flashUsedSize,
        {
          onProgress: (progress) => {
            runInAction(() => {
              this.bytesDownloaded = progress.bytesDownloaded
              this.speedBytesPerSec = progress.speedBytesPerSec
              this.estimatedSecondsRemaining = progress.estimatedSecondsRemaining
            })
          },
          onLogFound: (log) => {
            runInAction(() => {
              // Update the previous log's size now that we know where this one starts
              if (this.logs.length > 0) {
                const prev = this.logs[this.logs.length - 1]
                prev.size = log.startOffset - prev.startOffset
              }
              this.logs = [...this.logs, log]
            })
          },
        },
        this.abortController.signal,
        this.flashBuffer,
      )

      await this.closeConnection()

      runInAction(() => {
        this.flashBuffer = buffer
        this.bytesDownloaded = buffer.length

        // Finalize last log's size
        if (this.logs.length > 0) {
          const last = this.logs[this.logs.length - 1]
          last.size = buffer.length - last.startOffset
          this.logs = [...this.logs] // trigger reactivity
        }

        if (this.logs.length === 0) {
          this.status = 'error'
          this.errorMessage = 'No blackbox logs found on flash. The data may be corrupted.'
        } else {
          this.status = 'pick_log'
        }
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        runInAction(() => { this.status = 'idle' })
        await this.closeConnection()
        return
      }

      await this.closeConnection()
      runInAction(() => {
        this.status = 'error'
        this.errorMessage = describeFlashError(err)
      })
    } finally {
      this.abortController = null
    }
  }

  /**
   * Select a log and parse it via LogStore.
   * Can be called during download if the log's data is already buffered.
   */
  selectAndParse = (logIndex: number, logStore: LogStore): void => {
    const log = this.logs[logIndex]
    if (!log) return

    // If called during download, stop it — we have what we need
    this.abortController?.abort()

    this.selectedLogIndex = logIndex

    const buf = this.flashBuffer
    if (!buf) return

    const endOffset = log.size > 0
      ? log.startOffset + log.size
      : Math.min(buf.length, this.bytesDownloaded)

    const logData = buf.slice(log.startOffset, endOffset)
    const file = new File([logData], `flash_log_${log.index}.bbl`, { type: 'application/octet-stream' })

    logStore.uploadFile(file)
    this.status = 'complete'
  }

  cancelDownload = (): void => {
    this.abortController?.abort()
  }

  /**
   * Connect to FC and erase all blackbox data from onboard flash.
   */
  eraseFlash = async (): Promise<void> => {
    if (this.isBusy) return

    this.reset()
    this.status = 'connecting'

    try {
      const conn = createSerialConnection()
      conn.onDisconnect = () => {
        runInAction(() => {
          this.connection = null
          if (this.status === 'erasing') {
            this.status = 'error'
            this.errorMessage = 'FC disconnected during erase'
          }
        })
      }

      await conn.open()
      this.connection = conn

      await drainSerialBuffer(conn)
      await sendMspCommand(conn, MSP_API_VERSION)

      this.abortController = new AbortController()

      runInAction(() => { this.status = 'erasing' })

      await eraseDataflash(
        conn,
        (message) => {
          runInAction(() => { this.eraseMessage = message })
        },
        this.abortController.signal,
      )

      await this.closeConnection()
      runInAction(() => { this.status = 'erase_complete' })
    } catch (err) {
      await this.closeConnection()
      runInAction(() => {
        if (err instanceof DOMException && err.name === 'NotFoundError') {
          this.status = 'idle'
          return
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          this.status = 'idle'
          return
        }
        this.status = 'error'
        this.errorMessage = describeFlashError(err)
        this.onError?.(this.errorMessage)
      })
    } finally {
      this.abortController = null
    }
  }

  reset = (): void => {
    this.abortController?.abort()
    // Close connection synchronously (fire-and-forget) to prevent "port already open" on retry
    if (this.connection) {
      this.connection.close().catch(() => { /* already closed */ })
      this.connection = null
    }
    this.status = 'idle'
    this.errorMessage = ''
    this.eraseMessage = ''
    this.flashTotalSize = 0
    this.flashUsedSize = 0
    this.bytesDownloaded = 0
    this.speedBytesPerSec = 0
    this.estimatedSecondsRemaining = 0
    this.logs = []
    this.selectedLogIndex = -1
    this.flashBuffer = null
  }

  disconnect = async (): Promise<void> => {
    this.cancelDownload()
    await this.closeConnection()
    this.reset()
  }

  private async closeConnection(): Promise<void> {
    if (this.connection) {
      try { await this.connection.close() } catch { /* already closed */ }
      this.connection = null
    }
  }
}

function describeFlashError(err: unknown): string {
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
