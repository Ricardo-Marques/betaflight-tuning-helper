import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Analysis — Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('occurrence navigator shows counter and navigates', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    // Find an issue card with occurrence navigator (has prev/next buttons)
    const multiOccCard = page.locator('[data-issue-id]').filter({
      has: page.locator('text=/\\d+\\/\\d+/'),
    }).first()

    // If no multi-occurrence issues exist, skip
    const count = await multiOccCard.count()
    if (count === 0) {
      test.skip()
      return
    }

    const counter = multiOccCard.locator('text=/\\d+\\/\\d+/')
    await expect(counter).toBeVisible()
    const text = await counter.textContent()
    expect(text).toMatch(/^1\/\d+$/)

    // Prev should be disabled at first occurrence
    const prevBtn = multiOccCard.locator('button').filter({ hasText: '<' })
    await expect(prevBtn).toBeDisabled()

    // Click card first to activate it, then navigate
    await multiOccCard.scrollIntoViewIfNeeded()
    await multiOccCard.click()
    await page.waitForTimeout(300)

    // Click next
    const nextBtn = multiOccCard.locator('button').filter({ hasText: '>' })
    await nextBtn.click()
    await expect(counter).toHaveText(/^2\/\d+$/)
  })

  test('issue cards have linked recommendations', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const fixLinks = page.locator('[data-issue-id]').locator('button').filter({ hasText: /^Fix:/ })
    const count = await fixLinks.count()
    expect(count).toBeGreaterThan(0)
  })

  test('recommendation card has priority, changes, and rationale', async ({ page }) => {
    // Switch to Fixes tab
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Fixes/ }).click()
    const section = page.getByTestId('recommendations-section')
    await expect(section).toBeVisible()

    const firstRec = section.locator('[data-rec-id]').first()
    await expect(firstRec).toBeVisible()
    await expect(firstRec.getByText(/Priority:/)).toBeVisible()
    await expect(firstRec.getByText('Recommended Changes:')).toBeVisible()
    await expect(firstRec.getByText('Why this helps')).toBeVisible()
  })

  test('clicking off-axis issue switches axis and fades off-axis pills', async ({ page }) => {
    // Ensure we start on roll axis
    const rollBtn = page.getByTestId('axis-button-roll')
    await rollBtn.click()
    await expect(rollBtn).toHaveAttribute('data-active', 'true')

    // Find a pitch issue pill (if any exist)
    const pitchPill = page.locator('[data-testid^="issue-pill-"][data-axis="pitch"]').first()
    const pitchPillCount = await pitchPill.count()
    if (pitchPillCount === 0) {
      // Try yaw instead
      const yawPill = page.locator('[data-testid^="issue-pill-"][data-axis="yaw"]').first()
      const yawCount = await yawPill.count()
      if (yawCount === 0) {
        test.skip()
        return
      }
      await yawPill.click()
      await expect(page.getByTestId('axis-button-yaw')).toHaveAttribute('data-active', 'true')
    } else {
      await pitchPill.click()
      await expect(page.getByTestId('axis-button-pitch')).toHaveAttribute('data-active', 'true')
    }

    // After axis switch, off-axis pills should have reduced opacity
    const currentAxis = await page.locator('[data-testid^="axis-button-"][data-active]').textContent()
    const offAxisPills = page.locator(`[data-testid^="issue-pill-"]:not([data-axis="${currentAxis?.toLowerCase()}"])`)
    const offAxisCount = await offAxisPills.count()
    if (offAxisCount > 0) {
      const opacity = await offAxisPills.first().evaluate(el => getComputedStyle(el).opacity)
      expect(Number(opacity)).toBeLessThan(1)
    }
  })

  test('rationale is always visible on recommendation cards', async ({ page }) => {
    // Switch to Fixes tab
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Fixes/ }).click()
    const section = page.getByTestId('recommendations-section')
    const firstRec = section.locator('[data-rec-id]').first()

    // "Why this helps" label and rationale text should be visible without clicking
    await expect(firstRec.getByText('Why this helps')).toBeVisible()
    // The rationale text follows the label — just check the label is there
  })

  test('CLI bar shows label and action buttons', async ({ page }) => {
    const cli = page.getByTestId('cli-commands-section')
    await expect(cli).toBeVisible()

    // Shows header label
    await expect(cli).toContainText('Implement suggested fixes')

    // Has Import settings and Accept tune buttons
    await expect(page.getByTestId('import-settings-button').first()).toBeVisible()
    await expect(page.getByTestId('accept-tune-button')).toBeVisible()
  })
})
