import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Chart', () => {
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

  test('axis buttons switch active axis', async ({ page }) => {
    const rollBtn = page.getByTestId('axis-button-roll')
    const pitchBtn = page.getByTestId('axis-button-pitch')

    // Roll active by default
    await expect(rollBtn).toHaveAttribute('data-active', 'true')
    await expect(pitchBtn).not.toHaveAttribute('data-active')

    // Click Pitch
    await pitchBtn.click()
    await expect(pitchBtn).toHaveAttribute('data-active', 'true')
    await expect(rollBtn).not.toHaveAttribute('data-active')
  })

  test('toggling Gyro off decreases line count', async ({ page }) => {
    const container = page.getByTestId('chart-container')
    const linesBefore = await container.locator('.recharts-line').count()

    await page.getByTestId('toggle-gyro').uncheck()
    await page.waitForTimeout(300)
    const linesAfter = await container.locator('.recharts-line').count()
    expect(linesAfter).toBeLessThan(linesBefore)
  })

  test('toggling D-term on increases line count', async ({ page }) => {
    const container = page.getByTestId('chart-container')
    const linesBefore = await container.locator('.recharts-line').count()

    await page.getByTestId('toggle-dterm').check()
    await page.waitForTimeout(300)
    const linesAfter = await container.locator('.recharts-line').count()
    expect(linesAfter).toBeGreaterThan(linesBefore)
  })

  test('scroll-wheel zoom changes range slider', async ({ page }) => {
    const container = page.getByTestId('chart-container')

    // Zoom in via scroll wheel
    await container.hover()
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(500)

    // Reset button should be visible and clicking it restores full range
    const resetBtn = page.getByTestId('zoom-reset-button')
    await expect(resetBtn).toBeVisible()
  })

  test('reset zoom restores full view', async ({ page }) => {
    const container = page.getByTestId('chart-container')

    // Zoom in first via scroll wheel
    await container.hover()
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(500)

    // Reset
    await page.getByTestId('zoom-reset-button').click()
    await page.waitForTimeout(500)

    // Verify the zoom info shows 1.0x
    const zoomControls = page.locator('text=/1\\.0x/')
    await expect(zoomControls).toBeVisible()
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
