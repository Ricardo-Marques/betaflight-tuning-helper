import { AnalysisWindow, DetectedIssue, Recommendation } from './Analysis'
import { LogFrame } from './LogFrame'

/**
 * Extensible tuning rule interface for detection and recommendation
 */
export interface TuningRule {
  id: string
  name: string
  description: string

  /**
   * Determines if this rule applies to the given window
   */
  condition: (window: AnalysisWindow, frames: LogFrame[]) => boolean

  /**
   * Detects issues in the window
   */
  detect: (window: AnalysisWindow, frames: LogFrame[]) => DetectedIssue[]

  /**
   * Generates recommendations for detected issues
   */
  recommend: (issues: DetectedIssue[], frames: LogFrame[]) => Recommendation[]

  /**
   * Base confidence for this rule (0-1)
   */
  baseConfidence: number

  /**
   * Issue types this rule can detect and recommend for
   */
  issueTypes: string[]

  /**
   * Axes this rule applies to
   */
  applicableAxes: ('roll' | 'pitch' | 'yaw')[]
}

/**
 * Rule engine context passed to rules
 */
export interface RuleContext {
  /** All frames in the log */
  frames: LogFrame[]

  /** Metadata about the log */
  metadata: any

  /** Analysis window being evaluated */
  window: AnalysisWindow

  /** Previously detected issues (for cross-rule awareness) */
  existingIssues: DetectedIssue[]
}
