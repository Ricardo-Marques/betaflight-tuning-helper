import { CLI_OPTIONS } from '../../lib/betaflight/cliOptions'

export interface ParsedSettings {
  values: Map<string, number>
  warnings: string[]
  parsedCount: number
}

/**
 * Lines that appear in `get` output but aren't key=value settings.
 * These are noise we skip silently.
 */
const NOISE_PATTERN = /^\s*(#|Allowed range:|Default value:|Array length:|Permitted values:)/i

/**
 * Matches both `get` output (`p_roll = 45`) and `dump`/`diff all` output (`set p_roll = 45`).
 * Also handles section headers like `# master`, `# profile`, etc.
 */
const SETTING_PATTERN = /^\s*(?:set\s+)?([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i

/**
 * Parse Betaflight CLI output (get, dump, or diff all) into numeric settings.
 * Non-numeric values (enums, strings, arrays) are silently skipped since
 * the app only needs numeric tuning parameters.
 */
export function parseBetaflightOutput(text: string): ParsedSettings {
  const values = new Map<string, number>()
  const warnings: string[] = []
  let parsedCount = 0

  const lines = text.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines, comments, and noise
    if (!trimmed || trimmed.startsWith('#') || NOISE_PATTERN.test(trimmed)) {
      continue
    }

    const match = trimmed.match(SETTING_PATTERN)
    if (!match) continue

    const name = match[1].toLowerCase()
    const rawValue = match[2].trim()

    // Try to parse as a number
    const num = Number(rawValue)
    if (isNaN(num)) continue // Skip enums, strings, arrays

    // Validate against CLI_OPTIONS range if available
    const option = CLI_OPTIONS[name]
    if (option && option.type === 'range') {
      if (num < option.min || num > option.max) {
        warnings.push(`${name} = ${num} is outside allowed range [${option.min}, ${option.max}]`)
        continue
      }
    }

    values.set(name, num)
    parsedCount++
  }

  return { values, warnings, parsedCount }
}
