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
    await expect(rollBtn).toHaveClass(/bg-blue-600/)
    await expect(pitchBtn).not.toHaveClass(/bg-blue-600/)

    // Click Pitch
    await pitchBtn.click()
    await expect(pitchBtn).toHaveClass(/bg-blue-600/)
    await expect(rollBtn).not.toHaveClass(/bg-blue-600/)
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

  test('zoom start slider updates label', async ({ page }) => {
    // First reduce duration so start slider has room to move
    await page.getByTestId('zoom-duration-slider').fill('50')
    await page.waitForTimeout(300)

    const slider = page.getByTestId('zoom-start-slider')
    const label = page.locator('text=/Start:/')

    const before = await label.textContent()
    await slider.fill('20')
    await page.waitForTimeout(300)
    const after = await label.textContent()
    expect(after).not.toBe(before)
  })

  test('zoom duration slider updates label', async ({ page }) => {
    const slider = page.getByTestId('zoom-duration-slider')
    const label = page.locator('text=/Window:/')

    const before = await label.textContent()
    await slider.fill('30')
    await page.waitForTimeout(300)
    const after = await label.textContent()
    expect(after).not.toBe(before)
  })

  test('reset zoom returns sliders to defaults', async ({ page }) => {
    // Zoom in first
    await page.getByTestId('zoom-duration-slider').fill('30')
    await page.waitForTimeout(300)

    // Reset
    await page.getByTestId('zoom-reset-button').click()
    await page.waitForTimeout(500)

    const startVal = await page.getByTestId('zoom-start-slider').inputValue()
    const durVal = await page.getByTestId('zoom-duration-slider').inputValue()
    expect(parseFloat(startVal)).toBe(0)
    expect(parseFloat(durVal)).toBe(100)
  })

  test('issue markers are present on chart', async ({ page }) => {
    const refLines = page.getByTestId('chart-container').locator('.recharts-reference-line')
    const count = await refLines.count()
    expect(count).toBeGreaterThan(0)
  })

  test('scroll-wheel zooms chart', async ({ page }) => {
    const container = page.getByTestId('chart-container')
    const durBefore = parseFloat(await page.getByTestId('zoom-duration-slider').inputValue())

    // Scroll up (zoom in)
    await container.hover()
    await page.mouse.wheel(0, -300)
    await page.waitForTimeout(500)

    const durAfter = parseFloat(await page.getByTestId('zoom-duration-slider').inputValue())
    expect(durAfter).toBeLessThan(durBefore)
  })
})
