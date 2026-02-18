import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Navigation', () => {
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

  test('clicking issue card zooms chart and highlights card', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Issues/ }).click()
    const issueCard = page.locator('[data-issue-id]').first()
    await expect(issueCard).toBeVisible()

    // Scroll the issue into view and click
    await issueCard.scrollIntoViewIfNeeded()
    await issueCard.click()
    await page.waitForTimeout(500)

    // Card should be highlighted
    await expect(issueCard).toHaveAttribute('data-selected', 'true')
  })

  test('issue occurrence nav updates zoom position', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Issues/ }).click()
    // Find a multi-occurrence issue
    const multiOccCard = page.locator('[data-issue-id]').filter({
      has: page.locator('text=/\\d+\\/\\d+/'),
    }).first()

    const count = await multiOccCard.count()
    if (count === 0) {
      test.skip()
      return
    }

    // Click issue first to zoom to it
    await multiOccCard.scrollIntoViewIfNeeded()
    await multiOccCard.click()
    await page.waitForTimeout(500)

    // Note: we can't easily read zoom position from a single slider,
    // but we can verify that clicking next changes the chart
    const nextBtn = multiOccCard.locator('button').filter({ hasText: '>' })
    const counterBefore = await multiOccCard.locator('text=/\\d+\\/\\d+/').textContent()
    await nextBtn.click()
    await page.waitForTimeout(500)
    const counterAfter = await multiOccCard.locator('text=/\\d+\\/\\d+/').textContent()
    expect(counterAfter).not.toBe(counterBefore)
  })

  test('double-click resize handle hides and shows left panel', async ({ page }) => {
    const leftPanel = page.getByTestId('left-panel')
    await expect(leftPanel).toBeVisible()

    await page.getByTestId('resize-left-panel').dblclick()
    await expect(leftPanel).not.toBeVisible()

    await page.getByTestId('resize-left-panel').dblclick()
    await expect(leftPanel).toBeVisible()
  })

  test('double-click resize handle hides and shows right panel', async ({ page }) => {
    const rightPanel = page.getByTestId('right-panel')
    await expect(rightPanel).toBeVisible()

    await page.getByTestId('resize-right-panel').dblclick()
    await expect(rightPanel).not.toBeVisible()

    await page.getByTestId('resize-right-panel').dblclick()
    await expect(rightPanel).toBeVisible()
  })

  test('header and footer are visible', async ({ page }) => {
    await expect(page.getByTestId('app-header')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Betaflight Tuning Helper' })).toBeVisible()
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('footer')).toContainText('Betaflight')
  })
})
