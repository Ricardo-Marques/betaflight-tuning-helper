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

  test('zoom slider changes zoom level', async ({ page }) => {
    const slider = page.getByTestId('zoom-level-slider')
    const valueBefore = parseFloat(await slider.inputValue())
    expect(valueBefore).toBeCloseTo(1, 0) // starts at 1x

    await slider.fill('5')
    await page.waitForTimeout(300)
    const valueAfter = parseFloat(await slider.inputValue())
    expect(valueAfter).toBeCloseTo(5, 0)
  })

  test('reset zoom returns to 1x', async ({ page }) => {
    // Zoom in first
    await page.getByTestId('zoom-level-slider').fill('5')
    await page.waitForTimeout(300)

    // Reset
    await page.getByTestId('zoom-reset-button').click()
    await page.waitForTimeout(500)

    const val = parseFloat(await page.getByTestId('zoom-level-slider').inputValue())
    expect(val).toBeCloseTo(1, 0)
  })

  test('issue markers are present on chart', async ({ page }) => {
    const refLines = page.getByTestId('chart-container').locator('.recharts-reference-line')
    const count = await refLines.count()
    expect(count).toBeGreaterThan(0)
  })

  test('scroll-wheel zooms chart', async ({ page }) => {
    const container = page.getByTestId('chart-container')
    const valBefore = parseFloat(await page.getByTestId('zoom-level-slider').inputValue())

    // Scroll up (zoom in)
    await container.hover()
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(500)

    const valAfter = parseFloat(await page.getByTestId('zoom-level-slider').inputValue())
    expect(valAfter).toBeGreaterThan(valBefore)
  })
})
