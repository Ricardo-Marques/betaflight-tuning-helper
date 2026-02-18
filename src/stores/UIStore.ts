import { makeAutoObservable } from 'mobx'
import { Axis } from '../domain/types/Analysis'

export type RightPanelTab = 'summary' | 'issues' | 'fixes'

/**
 * Store for UI state (axis selection, zoom, toggles, etc.)
 */
export class UIStore {
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
  showThrottle: boolean = true
  showIssues: boolean = true

  leftPanelOpen: boolean = true
  rightPanelOpen: boolean = true
  activeRightTab: RightPanelTab = 'summary'

  private _animationFrameId: number | null = null

  constructor() {
    makeAutoObservable<this, '_animationFrameId'>(this, { _animationFrameId: false })
  }

  setAxis = (axis: Axis): void => {
    this.selectedAxis = axis
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

  setActiveRightTab = (tab: RightPanelTab): void => {
    this.activeRightTab = tab
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
    this.showThrottle = true
    this.showIssues = true
    this.activeRightTab = 'summary'
  }
}
