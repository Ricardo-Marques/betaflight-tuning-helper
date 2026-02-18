import { Page, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const BFL_PATH = path.resolve(__dirname, '../testLogs/bflLog.BFL')
export const CSV_PATH = path.resolve(__dirname, '../testLogs/bflLog.BFL.csv')

export async function uploadAndAnalyze(page: Page, filePath = BFL_PATH) {
  await page.locator('#file-upload').setInputFiles(filePath)
  await expect(page.getByTestId('parse-success-text')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('flight-segments')).toBeVisible({ timeout: 30_000 })
}
