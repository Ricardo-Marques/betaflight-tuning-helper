import { makeObservable, observable, action } from 'mobx'
import { Axis } from '../domain/types/Analysis'

/**
 * Store for UI state (axis selection, zoom, toggles, etc.)
 */
export class UIStore {
  // Observable state
  selectedAxis: Axis = 'roll'
  zoomStart: number = 0
  zoomEnd: number = 100 // Percentage
  showGyro: boolean = true
  showSetpoint: boolean = true
  showPidSum: boolean = false
  showPidP: boolean = false
  showPidI: boolean = false
  showPidD: boolean = false
  showMotors: boolean = true
  showThrottle: boolean = true

  // UI panels
  leftPanelOpen: boolean = true
  rightPanelOpen: boolean = true

  constructor() {
    makeObservable(this, {
      selectedAxis: observable,
      zoomStart: observable,
      zoomEnd: observable,
      showGyro: observable,
      showSetpoint: observable,
      showPidSum: observable,
      showPidP: observable,
      showPidI: observable,
      showPidD: observable,
      showMotors: observable,
      showThrottle: observable,
      leftPanelOpen: observable,
      rightPanelOpen: observable,
      setAxis: action,
      setZoom: action,
      toggleGyro: action,
      toggleSetpoint: action,
      togglePidSum: action,
      togglePidP: action,
      togglePidI: action,
      togglePidD: action,
      toggleMotors: action,
      toggleThrottle: action,
      toggleLeftPanel: action,
      toggleRightPanel: action,
      reset: action,
    })
  }

  /**
   * Set selected axis
   */
  setAxis = (axis: Axis): void => {
    this.selectedAxis = axis
  }

  /**
   * Set zoom range (percentages 0-100)
   */
  setZoom = (start: number, end: number): void => {
    this.zoomStart = Math.max(0, Math.min(100, start))
    this.zoomEnd = Math.max(0, Math.min(100, end))

    // Ensure start < end
    if (this.zoomStart >= this.zoomEnd) {
      this.zoomEnd = this.zoomStart + 1
    }
  }

  /**
   * Toggle gyro visibility
   */
  toggleGyro = (): void => {
    this.showGyro = !this.showGyro
  }

  /**
   * Toggle setpoint visibility
   */
  toggleSetpoint = (): void => {
    this.showSetpoint = !this.showSetpoint
  }

  /**
   * Toggle PID sum visibility
   */
  togglePidSum = (): void => {
    this.showPidSum = !this.showPidSum
  }

  /**
   * Toggle PID P visibility
   */
  togglePidP = (): void => {
    this.showPidP = !this.showPidP
  }

  /**
   * Toggle PID I visibility
   */
  togglePidI = (): void => {
    this.showPidI = !this.showPidI
  }

  /**
   * Toggle PID D visibility
   */
  togglePidD = (): void => {
    this.showPidD = !this.showPidD
  }

  /**
   * Toggle motors visibility
   */
  toggleMotors = (): void => {
    this.showMotors = !this.showMotors
  }

  /**
   * Toggle throttle visibility
   */
  toggleThrottle = (): void => {
    this.showThrottle = !this.showThrottle
  }

  /**
   * Toggle left panel
   */
  toggleLeftPanel = (): void => {
    this.leftPanelOpen = !this.leftPanelOpen
  }

  /**
   * Toggle right panel
   */
  toggleRightPanel = (): void => {
    this.rightPanelOpen = !this.rightPanelOpen
  }

  /**
   * Reset to defaults
   */
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
  }
}
