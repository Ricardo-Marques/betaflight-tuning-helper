import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Navigation — Segments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('flight segments appear with multiple buttons', async ({ page }) => {
    const segments = page.getByTestId('flight-segments')
    await expect(segments).toBeVisible()
    const buttons = segments.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(1)
  })

  test('segment shows phase name', async ({ page }) => {
    const firstSegment = page.locator('[data-testid^="segment-"]').first()
    const text = await firstSegment.textContent()
    const phases = ['arm', 'takeoff', 'cruise', 'acro', 'hover', 'landing', 'disarm', 'idle', 'recovery', 'flip', 'freestyle']
    const hasPhase = phases.some(p => text!.toLowerCase().includes(p))
    expect(hasPhase).toBe(true)
  })

  test('clicking segment zooms chart', async ({ page }) => {
    // Should start at 1.0x (full view)
    await expect(page.locator('text=/1\\.0x/')).toBeVisible()

    const segment = page.locator('[data-testid^="segment-"]').first()
    await segment.scrollIntoViewIfNeeded()
    await segment.click()
    await page.waitForTimeout(500)

    // After clicking a segment, zoom should have changed from 1.0x
    await expect(page.locator('text=/1\\.0x/')).not.toBeVisible()
  })

  test('clicked segment has selected state', async ({ page }) => {
    const segment = page.locator('[data-testid^="segment-"]').first()
    await segment.scrollIntoViewIfNeeded()
    await segment.click()
    await expect(segment).toHaveAttribute('data-selected', 'true')
  })

  test('header and footer are visible', async ({ page }) => {
    await expect(page.getByTestId('app-header')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Betaflight Tuning Helper' })).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText('Betaflight')
  })
})
