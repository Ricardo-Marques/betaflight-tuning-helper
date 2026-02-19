import { makeAutoObservable } from 'mobx'
import { parseBetaflightOutput, ParsedSettings } from '../domain/utils/BetaflightSettingsParser'
import { getCliName } from '../domain/utils/CliExport'
import { BetaflightParameter, Axis } from '../domain/types/Analysis'

const STORAGE_KEY_VALUES = 'bf-imported-settings'
const STORAGE_KEY_CLI_TEXT = 'bf-imported-cli-text'
const STORAGE_KEY_PENDING = 'bf-pending-settings'

/**
 * Store for user-imported Betaflight settings.
 * Maps CLI parameter names (e.g. "p_roll") to their numeric values.
 * Persists to localStorage so settings survive page reloads.
 *
 * Imported settings go through a pending → accepted flow:
 * - importFromCliOutput() populates pendingValues (not yet active)
 * - acceptPending() promotes pending into importedValues/baselineValues
 * - dismissPending() discards pending without affecting baseline
 */
export class SettingsStore {
  importedValues: Map<string, number> = new Map()
  /** Snapshot of importedValues before any tune was accepted - used for CLI generation */
  baselineValues: Map<string, number> = new Map()
  lastParseResult: ParsedSettings | null = null
  lastCliText: string = ''

  /** Settings awaiting user acceptance */
  pendingValues: Map<string, number> = new Map()
  pendingCliText: string = ''
  pendingParseResult: ParsedSettings | null = null

  constructor() {
    this.loadFromStorage()
    this.baselineValues = new Map(this.importedValues)
    makeAutoObservable(this)
  }

  /** Number of imported (accepted) values */
  get importedCount(): number {
    return this.importedValues.size
  }

  /** Whether any settings have been accepted */
  get hasImportedSettings(): boolean {
    return this.importedValues.size > 0
  }

  /** Whether there are settings awaiting review */
  get hasPendingSettings(): boolean {
    return this.pendingValues.size > 0
  }

  /** Number of pending settings */
  get pendingCount(): number {
    return this.pendingValues.size
  }

  /**
   * Parse CLI output and store as pending (not yet active).
   * Returns the parse result for display in the UI.
   */
  importFromCliOutput(text: string): ParsedSettings {
    const result = parseBetaflightOutput(text)
    for (const [key, value] of result.values) {
      this.pendingValues.set(key, value)
    }
    this.pendingParseResult = result
    this.pendingCliText = text
    this.savePendingToStorage()
    return result
  }

  /** Promote pending settings into accepted importedValues/baselineValues */
  acceptPending(): void {
    for (const [key, value] of this.pendingValues) {
      this.importedValues.set(key, value)
    }
    this.baselineValues = new Map(this.importedValues)
    this.lastParseResult = this.pendingParseResult
    this.lastCliText = this.pendingCliText || this.generateCliTextFromValues()
    this.pendingValues = new Map()
    this.pendingCliText = ''
    this.pendingParseResult = null
    this.saveToStorage()
    this.clearPendingStorage()
  }

  /** Discard pending settings without affecting baseline */
  dismissPending(): void {
    this.pendingValues = new Map()
    this.pendingCliText = ''
    this.pendingParseResult = null
    this.clearPendingStorage()
  }

  /**
   * Merge resolved recommendation values into imported settings.
   * Used by "Accept Tune" to treat recommended values as the new baseline.
   * Updates lastCliText so the import modal reflects the new values.
   */
  acceptResolvedValues(resolved: Map<string, number>): void {
    for (const [key, value] of resolved) {
      this.importedValues.set(key, value)
    }
    this.lastCliText = this.generateCliTextFromValues()
    this.saveToStorage()
  }

  /**
   * Look up an imported value by BetaflightParameter name and optional axis.
   * Translates from the app's parameter names to CLI names.
   */
  getValue(parameter: BetaflightParameter, axis?: Axis): number | undefined {
    const cliName = getCliName(parameter, axis)
    return this.importedValues.get(cliName)
  }

  reset(): void {
    this.importedValues = new Map()
    this.baselineValues = new Map()
    this.lastParseResult = null
    this.lastCliText = ''
    this.pendingValues = new Map()
    this.pendingCliText = ''
    this.pendingParseResult = null
    this.clearStorage()
    this.clearPendingStorage()
  }

  private generateCliTextFromValues(): string {
    const lines: string[] = []
    for (const [key, value] of this.importedValues) {
      lines.push(`set ${key} = ${value}`)
    }
    return lines.join('\n')
  }

  private saveToStorage(): void {
    try {
      const entries = Array.from(this.importedValues.entries())
      localStorage.setItem(STORAGE_KEY_VALUES, JSON.stringify(entries))
      if (this.lastCliText) {
        localStorage.setItem(STORAGE_KEY_CLI_TEXT, this.lastCliText)
      }
    } catch {
      // Storage unavailable (private browsing, quota exceeded)
    }
  }

  private savePendingToStorage(): void {
    try {
      const entries = Array.from(this.pendingValues.entries())
      localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(entries))
    } catch {
      // Storage unavailable
    }
  }

  private loadFromStorage(): void {
    try {
      // Previously accepted settings come back as pending for re-review each session
      const raw = localStorage.getItem(STORAGE_KEY_VALUES)
      if (raw) {
        const entries: [string, number][] = JSON.parse(raw)
        for (const [key, value] of entries) {
          this.pendingValues.set(key, value)
        }
      }
      this.pendingCliText = localStorage.getItem(STORAGE_KEY_CLI_TEXT) ?? ''

      // Merge any previously pending (never-accepted) settings on top
      const pendingRaw = localStorage.getItem(STORAGE_KEY_PENDING)
      if (pendingRaw) {
        const entries: [string, number][] = JSON.parse(pendingRaw)
        for (const [key, value] of entries) {
          this.pendingValues.set(key, value)
        }
      }
    } catch {
      // Corrupted or unavailable
    }
  }

  private clearStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY_VALUES)
      localStorage.removeItem(STORAGE_KEY_CLI_TEXT)
    } catch {
      // Storage unavailable
    }
  }

  private clearPendingStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY_PENDING)
    } catch {
      // Storage unavailable
    }
  }
}
