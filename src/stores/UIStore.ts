import { makeAutoObservable, runInAction } from 'mobx'
import { Axis } from '../domain/types/Analysis'

export type ChartMode = 'time' | 'spectrum'
export type RightPanelTab = 'summary' | 'issues' | 'fixes'
export type MobileTab = 'upload' | 'chart' | 'tune'

/**
 * Store for UI state (axis selection, zoom, toggles, etc.)
 */
export const MIN_PANEL_WIDTH = 350
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
  showFeedforward: boolean = false
  showMotors: boolean = true
  showThrottle: boolean = false
  showIssues: boolean = true
  chartMode: ChartMode = 'time'
  spectrumZoomStart: number = 0
  spectrumZoomEnd: number = 100

  leftPanelOpen: boolean = true
  rightPanelOpen: boolean = true
  leftPanelWidth: number = DEFAULT_PANEL_WIDTH
  rightPanelWidth: number = DEFAULT_PANEL_WIDTH
  activeRightTab: RightPanelTab = 'summary'
  changelogOpen: boolean = false
  glossaryOpen: boolean = false
  glossaryTargetTerm: string | null = null
  settingsImportOpen: boolean = false
  settingsReviewOpen: boolean = false
  serialProgressOpen: boolean = false
  serialProgressMode: 'read' | 'write' = 'read'
  flashDownloadOpen: boolean = false
  flashEraseMode: boolean = false
  deferredCliAction: 'preview' | 'copy' | 'acceptTune' | null = null

  axisHighlight: Axis | null = null
  axisHighlightKey: number = 0

  isMobileLayout: boolean = false
  mobileActiveTab: MobileTab = 'upload'

  private _animationFrameId: number | null = null
  private _axisHighlightTimer: ReturnType<typeof setTimeout> | null = null
  private _toastTimer: ReturnType<typeof setTimeout> | null = null
  private _mediaQuery: MediaQueryList | null = null
  private _mediaHandler: ((e: MediaQueryListEvent) => void) | null = null

  constructor() {
    makeAutoObservable<this, '_animationFrameId' | '_axisHighlightTimer' | '_toastTimer' | '_mediaQuery' | '_mediaHandler'>(this, {
      _animationFrameId: false,
      _axisHighlightTimer: false,
      _toastTimer: false,
      _mediaQuery: false,
      _mediaHandler: false,
    })

    if (typeof window !== 'undefined') {
      this._mediaQuery = window.matchMedia('(max-width: 1599px)')
      this.isMobileLayout = this._mediaQuery.matches
      this._mediaHandler = (e: MediaQueryListEvent) => {
        runInAction(() => { this.isMobileLayout = e.matches })
      }
      this._mediaQuery.addEventListener('change', this._mediaHandler)
    }
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
      this.zoomEnd = this.zoomStart + 0.01
    }
  }

  setSpectrumZoom = (start: number, end: number): void => {
    this.spectrumZoomStart = Math.max(0, Math.min(100, start))
    this.spectrumZoomEnd = Math.max(0, Math.min(100, end))

    if (this.spectrumZoomStart >= this.spectrumZoomEnd) {
      this.spectrumZoomEnd = this.spectrumZoomStart + 0.01
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

  toggleFeedforward = (): void => {
    this.showFeedforward = !this.showFeedforward
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

  toggleChartMode = (): void => {
    this.chartMode = this.chartMode === 'time' ? 'spectrum' : 'time'
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

  setMobileActiveTab = (tab: MobileTab): void => {
    this.mobileActiveTab = tab
  }

  openChangelog = (): void => {
    this.changelogOpen = true
  }

  closeChangelog = (): void => {
    this.changelogOpen = false
  }

  openGlossary = (termId?: string): void => {
    this.glossaryTargetTerm = termId ?? null
    this.glossaryOpen = true
  }

  closeGlossary = (): void => {
    this.glossaryOpen = false
    this.glossaryTargetTerm = null
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

  openFlashDownload = (): void => {
    this.flashEraseMode = false
    this.flashDownloadOpen = true
  }

  openFlashErase = (): void => {
    this.flashEraseMode = true
    this.flashDownloadOpen = true
  }

  closeFlashDownload = (): void => {
    this.flashDownloadOpen = false
    this.flashEraseMode = false
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
    this.showFeedforward = false
    this.showMotors = true
    this.showThrottle = false
    this.showIssues = true
    this.chartMode = 'time'
    this.spectrumZoomStart = 0
    this.spectrumZoomEnd = 100
    this.leftPanelWidth = DEFAULT_PANEL_WIDTH
    this.rightPanelWidth = DEFAULT_PANEL_WIDTH
    this.activeRightTab = 'summary'
    this.mobileActiveTab = 'upload'
    this.axisHighlight = null
    this.glossaryOpen = false
    this.glossaryTargetTerm = null
  }
}
