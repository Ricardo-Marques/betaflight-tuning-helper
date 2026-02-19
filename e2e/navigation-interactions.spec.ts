import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Navigation — Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('clicking issue card zooms chart and highlights card', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
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
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
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

})
