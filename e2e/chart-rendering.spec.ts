import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Chart — Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('SVG renders inside chart container', async ({ page }) => {
    const svg = page.getByTestId('chart-container').locator('svg.recharts-surface').first()
    await expect(svg).toBeVisible()
  })

  test('chart lines are present', async ({ page }) => {
    const lines = page.getByTestId('chart-container').locator('.recharts-line')
    const count = await lines.count()
    // gyro + setpoint + 4 motors = 6 lines by default
    expect(count).toBeGreaterThanOrEqual(6)
  })

  test('issue markers are present on chart', async ({ page }) => {
    const refLines = page.getByTestId('chart-container').locator('.recharts-reference-line')
    const count = await refLines.count()
    expect(count).toBeGreaterThan(0)
  })

  test('Y-axis ticks stay constant when switching axes', async ({ page }) => {
    const container = page.getByTestId('chart-container')
    const yAxis = container.locator('.recharts-yAxis').first()

    // Record tick text on Roll (default axis)
    const rollTicks = await yAxis.locator('.recharts-cartesian-axis-tick-value').allTextContents()
    expect(rollTicks.length).toBeGreaterThan(0)

    // Switch to Pitch
    await page.getByTestId('axis-button-pitch').click()
    await page.waitForTimeout(300)

    const pitchTicks = await yAxis.locator('.recharts-cartesian-axis-tick-value').allTextContents()
    expect(pitchTicks).toEqual(rollTicks)

    // Switch to Yaw
    await page.getByTestId('axis-button-yaw').click()
    await page.waitForTimeout(300)

    const yawTicks = await yAxis.locator('.recharts-cartesian-axis-tick-value').allTextContents()
    expect(yawTicks).toEqual(rollTicks)
  })

  test('scroll-wheel zooms chart', async ({ page }) => {
    const container = page.getByTestId('chart-container')

    // Should start at 1.0x
    await expect(page.locator('text=/1\\.0x/')).toBeVisible()

    // Scroll up (zoom in)
    await container.hover()
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(500)

    // After scrolling, zoom level should have changed from 1.0x
    await expect(page.locator('text=/1\\.0x/')).not.toBeVisible()
  })
})
