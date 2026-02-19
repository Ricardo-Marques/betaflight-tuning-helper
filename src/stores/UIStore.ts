import { makeAutoObservable } from 'mobx'
import { Axis } from '../domain/types/Analysis'

export type RightPanelTab = 'summary' | 'issues' | 'fixes'

/**
 * Store for UI state (axis selection, zoom, toggles, etc.)
 */
export const MIN_PANEL_WIDTH = 300
export const MAX_PANEL_WIDTH = 600
const DEFAULT_PANEL_WIDTH = 352 // ~22rem
const COLLAPSE_THRESHOLD = 80

export type ToastType = 'error' | 'success' | 'info'

export class UIStore {
  toastMessage: string = ''
  toastType: ToastType = 'error'
  toastVisible: boolean = false

  selectedAxis: Axis = 'roll'
  zoomStart: number = 0
  zoomEnd: number = 100
  showGyro: boolean = true
  showSetpoint: boolean = true
  showPidSum: boolean = false
  showPidP: boolean = false
  showPidI: boolean = false
  showPidD: boolean = false
  showMotors: boolean = true
  showThrottle: boolean = false
  showIssues: boolean = true

  leftPanelOpen: boolean = true
  rightPanelOpen: boolean = true
  leftPanelWidth: number = DEFAULT_PANEL_WIDTH
  rightPanelWidth: number = DEFAULT_PANEL_WIDTH
  activeRightTab: RightPanelTab = 'summary'
  changelogOpen: boolean = false
  settingsImportOpen: boolean = false
  settingsReviewOpen: boolean = false
  serialProgressOpen: boolean = false
  serialProgressMode: 'read' | 'write' = 'read'
  deferredCliAction: 'preview' | 'copy' | 'acceptTune' | null = null

  axisHighlight: Axis | null = null
  axisHighlightKey: number = 0

  private _animationFrameId: number | null = null
  private _axisHighlightTimer: ReturnType<typeof setTimeout> | null = null
  private _toastTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    makeAutoObservable<this, '_animationFrameId' | '_axisHighlightTimer' | '_toastTimer'>(this, {
      _animationFrameId: false,
      _axisHighlightTimer: false,
      _toastTimer: false,
    })
  }

  setAxis = (axis: Axis): void => {
    this.selectedAxis = axis
  }

  flashAxisHighlight = (axis: Axis): void => {
    if (this._axisHighlightTimer) clearTimeout(this._axisHighlightTimer)
    this.axisHighlight = axis
    this.axisHighlightKey++
    this._axisHighlightTimer = setTimeout(() => {
      this.axisHighlight = null
      this._axisHighlightTimer = null
    }, 1600)
  }

  setZoom = (start: number, end: number): void => {
    this.zoomStart = Math.max(0, Math.min(100, start))
    this.zoomEnd = Math.max(0, Math.min(100, end))

    if (this.zoomStart >= this.zoomEnd) {
      this.zoomEnd = this.zoomStart + 1
    }
  }

  toggleGyro = (): void => {
    this.showGyro = !this.showGyro
  }

  toggleSetpoint = (): void => {
    this.showSetpoint = !this.showSetpoint
  }

  togglePidSum = (): void => {
    this.showPidSum = !this.showPidSum
  }

  togglePidP = (): void => {
    this.showPidP = !this.showPidP
  }

  togglePidI = (): void => {
    this.showPidI = !this.showPidI
  }

  togglePidD = (): void => {
    this.showPidD = !this.showPidD
  }

  toggleMotors = (): void => {
    this.showMotors = !this.showMotors
  }

  toggleThrottle = (): void => {
    this.showThrottle = !this.showThrottle
  }

  toggleIssues = (): void => {
    this.showIssues = !this.showIssues
  }

  toggleLeftPanel = (): void => {
    this.leftPanelOpen = !this.leftPanelOpen
  }

  toggleRightPanel = (): void => {
    this.rightPanelOpen = !this.rightPanelOpen
  }

  setLeftPanelWidth = (px: number): void => {
    if (px < COLLAPSE_THRESHOLD) {
      this.leftPanelOpen = false
      return
    }
    this.leftPanelOpen = true
    this.leftPanelWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, px))
  }

  setRightPanelWidth = (px: number): void => {
    if (px < COLLAPSE_THRESHOLD) {
      this.rightPanelOpen = false
      return
    }
    this.rightPanelOpen = true
    this.rightPanelWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, px))
  }

  setActiveRightTab = (tab: RightPanelTab): void => {
    this.activeRightTab = tab
  }

  openChangelog = (): void => {
    this.changelogOpen = true
  }

  closeChangelog = (): void => {
    this.changelogOpen = false
  }

  openSettingsImport = (): void => {
    this.settingsImportOpen = true
  }

  closeSettingsImport = (): void => {
    this.settingsImportOpen = false
  }

  openSettingsReview = (deferredAction?: 'preview' | 'copy' | 'acceptTune'): void => {
    this.deferredCliAction = deferredAction ?? null
    this.settingsReviewOpen = true
  }

  closeSettingsReview = (): void => {
    this.settingsReviewOpen = false
  }

  openSerialProgress = (mode: 'read' | 'write'): void => {
    this.serialProgressMode = mode
    this.serialProgressOpen = true
  }

  closeSerialProgress = (): void => {
    this.serialProgressOpen = false
  }

  showToast = (message: string, type: ToastType = 'error', durationMs = 5000): void => {
    if (this._toastTimer) clearTimeout(this._toastTimer)
    this.toastMessage = message
    this.toastType = type
    this.toastVisible = true
    this._toastTimer = setTimeout(() => {
      this.dismissToast()
    }, durationMs)
  }

  dismissToast = (): void => {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer)
      this._toastTimer = null
    }
    this.toastVisible = false
  }

  clearDeferredAction = (): void => {
    this.deferredCliAction = null
  }

  animateZoom = (targetStart: number, targetEnd: number, duration: number = 300): void => {
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId)
      this._animationFrameId = null
    }

    const fromStart = this.zoomStart
    const fromEnd = this.zoomEnd
    const startTime = performance.now()

    const step = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)

      this.setZoom(
        fromStart + (targetStart - fromStart) * eased,
        fromEnd + (targetEnd - fromEnd) * eased
      )

      if (t < 1) {
        this._animationFrameId = requestAnimationFrame(step)
      } else {
        this._animationFrameId = null
      }
    }

    this._animationFrameId = requestAnimationFrame(step)
  }

  reset = (): void => {
    this.selectedAxis = 'roll'
    this.zoomStart = 0
    this.zoomEnd = 100
    this.showGyro = true
    this.showSetpoint = true
    this.showPidSum = false
    this.showPidP = false
    this.showPidI = false
    this.showPidD = false
    this.showMotors = true
    this.showThrottle = false
    this.showIssues = true
    this.leftPanelWidth = DEFAULT_PANEL_WIDTH
    this.rightPanelWidth = DEFAULT_PANEL_WIDTH
    this.activeRightTab = 'summary'
    this.axisHighlight = null
  }
}
