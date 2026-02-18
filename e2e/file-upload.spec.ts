import { test, expect } from '@playwright/test'
import { uploadAndAnalyze, BFL_PATH, CSV_PATH } from './helpers'

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('shows idle state on load', async ({ page }) => {
    await expect(page.getByTestId('file-dropzone')).toBeVisible()
    await expect(page.getByText('Select File')).toBeVisible()
  })

  test('parses BFL file and shows metadata', async ({ page }) => {
    await page.locator('#file-upload').setInputFiles(BFL_PATH)
    await expect(page.getByTestId('parse-progress-bar').or(page.getByTestId('parse-success-text'))).toBeVisible({ timeout: 30_000 })
    const metadata = page.getByTestId('parse-success-text')
    await expect(metadata).toBeVisible({ timeout: 30_000 })
    await expect(metadata.getByText('Duration:')).toBeVisible()
    await expect(metadata.getByText('Loop Rate:')).toBeVisible()
  })

  test('parses CSV file and shows success', async ({ page }) => {
    test.setTimeout(45_000)
    await page.locator('#file-upload').setInputFiles(CSV_PATH)
    await expect(page.getByTestId('parse-success-text')).toBeVisible({ timeout: 40_000 })
  })

  test('reset returns to idle state', async ({ page }) => {
    await uploadAndAnalyze(page)
    await page.getByTestId('upload-different-file').click()
    await expect(page.getByTestId('file-dropzone')).toBeVisible()
    await expect(page.getByText('Select File')).toBeVisible()
  })

  test('auto-analysis triggers after BFL parse', async ({ page }) => {
    await uploadAndAnalyze(page)
    await expect(page.getByTestId('flight-segments')).toBeVisible()
  })

  test('log info section displays after parse', async ({ page }) => {
    await uploadAndAnalyze(page)
    const logInfo = page.getByTestId('log-info')
    await expect(logInfo).toBeVisible()
    await expect(logInfo.getByText('Firmware:')).toBeVisible()
    await expect(logInfo.getByText('Motors:')).toBeVisible()
  })

  test('BFL and CSV produce same loop rate', async ({ page }) => {
    test.setTimeout(60_000)
    // Load BFL
    await uploadAndAnalyze(page)
    const bflLoopRate = await page.getByTestId('parse-success-text').getByText('Loop Rate:').textContent()

    // Reset
    await page.getByTestId('upload-different-file').click()
    await expect(page.getByText('Select File')).toBeVisible()

    // Load CSV
    await page.locator('#file-upload').setInputFiles(CSV_PATH)
    await expect(page.getByTestId('parse-success-text')).toBeVisible({ timeout: 40_000 })
    const csvLoopRate = await page.getByTestId('parse-success-text').getByText('Loop Rate:').textContent()

    expect(bflLoopRate).toBe(csvLoopRate)
  })
})
