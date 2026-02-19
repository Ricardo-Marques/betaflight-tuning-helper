import { makeAutoObservable } from 'mobx'
import { parseBetaflightOutput, ParsedSettings } from '../domain/utils/BetaflightSettingsParser'
import { getCliName } from '../domain/utils/CliExport'
import { BetaflightParameter, Axis } from '../domain/types/Analysis'

const STORAGE_KEY_VALUES = 'bf-imported-settings'
const STORAGE_KEY_CLI_TEXT = 'bf-imported-cli-text'

/**
 * Store for user-imported Betaflight settings.
 * Maps CLI parameter names (e.g. "p_roll") to their numeric values.
 * Persists to localStorage so settings survive page reloads.
 */
export class SettingsStore {
  importedValues: Map<string, number> = new Map()
  /** Snapshot of importedValues before any tune was accepted - used for CLI generation */
  baselineValues: Map<string, number> = new Map()
  lastParseResult: ParsedSettings | null = null
  lastCliText: string = ''

  constructor() {
    this.loadFromStorage()
    this.baselineValues = new Map(this.importedValues)
    makeAutoObservable(this)
  }

  /** Number of imported values */
  get importedCount(): number {
    return this.importedValues.size
  }

  /** Whether any settings have been imported */
  get hasImportedSettings(): boolean {
    return this.importedValues.size > 0
  }

  /**
   * Parse CLI output and merge into imported values.
   * Returns the parse result for display in the UI.
   */
  importFromCliOutput(text: string): ParsedSettings {
    const result = parseBetaflightOutput(text)
    for (const [key, value] of result.values) {
      this.importedValues.set(key, value)
    }
    this.baselineValues = new Map(this.importedValues)
    this.lastParseResult = result
    this.lastCliText = text
    this.saveToStorage()
    return result
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
    this.clearStorage()
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

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VALUES)
      if (raw) {
        const entries: [string, number][] = JSON.parse(raw)
        this.importedValues = new Map(entries)
      }
      this.lastCliText = localStorage.getItem(STORAGE_KEY_CLI_TEXT) ?? ''
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
}
