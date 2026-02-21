/**
 * FlashDownloadStore for the Android app.
 *
 * Near-identical to the web FlashDownloadStore. Key differences:
 * - Uses createAndroidSerialConnection() instead of createSerialConnection()
 * - selectAndParse() uses logStore.loadParsedFrames() via parseLogFile on the raw buffer
 *   instead of constructing a File object (React Native's File API differs)
 * - No DOMException handling (Android throws regular Errors)
 */
import { makeAutoObservable, runInAction } from 'mobx'
import type { SerialConnection } from '@bf-tuner/serial-protocol/SerialPort'
import {
  readDataflashSummary,
  downloadDataflash,
  eraseDataflash,
} from '@bf-tuner/serial-protocol/DataflashReader'
import {
  drainSerialBuffer,
  sendMspCommand,
  MSP_API_VERSION,
} from '@bf-tuner/serial-protocol/MspProtocol'
import type { FlashLogEntry } from '@bf-tuner/serial-protocol/DataflashReader'
import { createAndroidSerialConnection } from '../serial/AndroidUsbSerial'
import type { LogStore } from './LogStore'
import { parseBblBuffer } from '@bf-tuner/domain/blackbox/index'
import { computeDomainsFromFrames } from '../parsing/parseLogFile'

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

  logs: FlashLogEntry[] = []
  selectedLogIndex: number = -1

  private connection: SerialConnection | null = null
  private abortController: AbortController | null = null
  private flashBuffer: Uint8Array | null = null
  private logStore: LogStore

  constructor(logStore: LogStore) {
    this.logStore = logStore
    makeAutoObservable<this, 'connection' | 'abortController' | 'flashBuffer' | 'logStore'>(this, {
      connection: false,
      abortController: false,
      flashBuffer: false,
      logStore: false,
    })
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

  canSelectLog = (index: number): boolean => {
    const log = this.logs[index]
    if (!log || log.size === 0) return false
    return (log.startOffset + log.size) <= this.bytesDownloaded
  }

  connect = async (deviceId?: number): Promise<void> => {
    if (this.isBusy) return

    this.reset()
    runInAction(() => { this.status = 'connecting' })

    try {
      const conn = createAndroidSerialConnection(deviceId)
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

      await drainSerialBuffer(conn)
      await sendMspCommand(conn, MSP_API_VERSION)

      runInAction(() => { this.status = 'reading_summary' })
      const summary = await readDataflashSummary(conn)

      if (!summary.supported) {
        await this.closeConnection()
        runInAction(() => {
          this.status = 'error'
          this.errorMessage =
            "This FC doesn't have onboard flash memory. If it uses an SD card, remove the card and open the .bbl file directly."
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
        this.status = 'error'
        this.errorMessage = describeFlashError(err)
      })
    }
  }

  startDownload = async (): Promise<void> => {
    if (!this.connection?.isOpen) {
      runInAction(() => {
        this.status = 'error'
        this.errorMessage = 'Connection lost. Tap Retry to reconnect.'
      })
      return
    }

    runInAction(() => {
      this.status = 'downloading'
      this.bytesDownloaded = 0
      this.speedBytesPerSec = 0
      this.estimatedSecondsRemaining = 0
      this.logs = []
    })

    this.abortController = new AbortController()
    this.flashBuffer = new Uint8Array(this.flashUsedSize)

    try {
      const buffer = await downloadDataflash(
        this.connection!,
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
        if (this.logs.length > 0) {
          const last = this.logs[this.logs.length - 1]
          last.size = buffer.length - last.startOffset
          this.logs = [...this.logs]
        }
        this.status = this.logs.length === 0 ? 'error' : 'pick_log'
        if (this.logs.length === 0) {
          this.errorMessage = 'No blackbox logs found on flash. The data may be corrupted.'
        }
      })
    } catch (err) {
      const isAbort = err instanceof Error && err.message.includes('abort')
      await this.closeConnection()
      runInAction(() => {
        this.status = isAbort ? 'idle' : 'error'
        if (!isAbort) this.errorMessage = describeFlashError(err)
      })
    } finally {
      this.abortController = null
    }
  }

  /**
   * Parse a downloaded log and hand it off to LogStore.
   * Unlike the web app, we parse the Uint8Array directly (no File constructor).
   */
  selectAndParse = (logIndex: number): void => {
    const log = this.logs[logIndex]
    if (!log) return

    this.abortController?.abort()
    this.selectedLogIndex = logIndex

    const buf = this.flashBuffer
    if (!buf) return

    const endOffset = log.size > 0
      ? log.startOffset + log.size
      : Math.min(buf.length, this.bytesDownloaded)

    const logData = buf.slice(log.startOffset, endOffset)

    try {
      const { frames, metadata } = parseBblBuffer(logData, () => {})
      const domains = computeDomainsFromFrames(frames)
      this.logStore.loadParsedFrames(frames, metadata, domains)
      runInAction(() => { this.status = 'complete' })
    } catch (err) {
      runInAction(() => {
        this.status = 'error'
        this.errorMessage = err instanceof Error ? err.message : 'Failed to parse log'
      })
    }
  }

  cancelDownload = (): void => {
    this.abortController?.abort()
  }

  eraseFlash = async (deviceId?: number): Promise<void> => {
    if (this.isBusy) return

    this.reset()
    runInAction(() => { this.status = 'connecting' })

    try {
      const conn = createAndroidSerialConnection(deviceId)
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
      const isAbort = err instanceof Error && err.message.includes('abort')
      runInAction(() => {
        this.status = isAbort ? 'idle' : 'error'
        if (!isAbort) this.errorMessage = describeFlashError(err)
      })
    } finally {
      this.abortController = null
    }
  }

  reset = (): void => {
    this.abortController?.abort()
    if (this.connection) {
      this.connection.close().catch(() => {})
      this.connection = null
    }
    runInAction(() => {
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
    })
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
  if (err instanceof Error) {
    if (err.message.includes('Timeout')) return "FC not responding. Make sure it's connected via OTG cable."
    return err.message
  }
  return 'An unknown error occurred'
}
