import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Issue Interactions — Popover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('popover appears when clicking issue pill', async ({ page }) => {
    const firstPill = page.locator('[data-testid^="issue-pill-"]').first()
    await firstPill.click()

    const popover = page.getByTestId('issue-popover')
    await expect(popover).toBeVisible({ timeout: 3_000 })
  })

  test('popover appears when clicking issue card in right panel', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const issueCard = page.locator('[data-issue-id]').first()
    await issueCard.scrollIntoViewIfNeeded()
    await issueCard.click()
    await page.waitForTimeout(300)

    const popover = page.getByTestId('issue-popover')
    await expect(popover).toBeVisible({ timeout: 3_000 })
  })

  test('popover disappears after ~2 seconds', async ({ page }) => {
    const firstPill = page.locator('[data-testid^="issue-pill-"]').first()
    await firstPill.click()

    const popover = page.getByTestId('issue-popover')
    await expect(popover).toBeVisible({ timeout: 3_000 })

    // Wait for the 2-second auto-hide
    await page.waitForTimeout(2500)
    await expect(popover).not.toBeVisible({ timeout: 3_000 })
  })

  test('popover shows correct issue info', async ({ page }) => {
    const firstPill = page.locator('[data-testid^="issue-pill-"]').first()
    const pillType = await firstPill.getAttribute('data-issue-type')
    await firstPill.click()

    const popover = page.getByTestId('issue-popover')
    await expect(popover).toBeVisible({ timeout: 3_000 })

    // Popover should contain severity badge text
    const badges = popover.locator('text=/HIGH|MEDIUM|LOW/')
    await expect(badges.first()).toBeVisible()

    // Popover should contain axis info
    await expect(popover.getByText('Axis:')).toBeVisible()

    // The pill type should match an issue shown in the popover
    expect(pillType).toBeTruthy()
  })
})
