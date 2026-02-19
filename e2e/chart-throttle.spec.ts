import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Chart — Throttle Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('throttle checkbox exists and is unchecked by default', async ({ page }) => {
    const toggle = page.getByTestId('toggle-throttle')
    await expect(toggle).toBeVisible()
    await expect(toggle).not.toBeChecked()
  })

  test('enabling throttle adds a line to the chart', async ({ page }) => {
    const container = page.getByTestId('chart-container')
    const linesBefore = await container.locator('.recharts-line').count()

    await page.getByTestId('toggle-throttle').check()
    await page.waitForTimeout(300)

    const linesAfter = await container.locator('.recharts-line').count()
    expect(linesAfter).toBeGreaterThan(linesBefore)
  })

  test('disabling throttle removes the line', async ({ page }) => {
    // Enable first
    await page.getByTestId('toggle-throttle').check()
    await page.waitForTimeout(300)
    const container = page.getByTestId('chart-container')
    const linesEnabled = await container.locator('.recharts-line').count()

    // Disable
    await page.getByTestId('toggle-throttle').uncheck()
    await page.waitForTimeout(300)
    const linesDisabled = await container.locator('.recharts-line').count()

    expect(linesDisabled).toBeLessThan(linesEnabled)
  })
})
