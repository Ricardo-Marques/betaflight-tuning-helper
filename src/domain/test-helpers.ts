import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { parseBblBuffer, ParseBblResult } from './blackbox/BblParser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function loadTestBflLog(): ParseBblResult {
  const bflPath = resolve(__dirname, '../../test-logs/shortLog.BFL')
  const buffer = new Uint8Array(readFileSync(bflPath))
  return parseBblBuffer(buffer)
}

export function loadTestBflBuffer(): Uint8Array {
  const bflPath = resolve(__dirname, '../../test-logs/shortLog.BFL')
  return new Uint8Array(readFileSync(bflPath))
}
