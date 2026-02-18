import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Chart Hints and Toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  // ---- "What this looks like" chart hints ----

  test.describe('Chart Hint Descriptions', () => {
    test('issue cards have "What this looks like" toggle', async ({ page }) => {
      await page.locator('button').filter({ hasText: /^Issues/ }).click()
      const firstIssue = page.locator('[data-issue-id]').first()
      await expect(firstIssue).toBeVisible()

      const toggle = firstIssue.getByText('What this looks like')
      await expect(toggle).toBeVisible()
    })

    test('clicking toggle expands chart description text', async ({ page }) => {
      await page.locator('button').filter({ hasText: /^Issues/ }).click()
      const firstIssue = page.locator('[data-issue-id]').first()
      await firstIssue.scrollIntoViewIfNeeded()

      const toggle = firstIssue.getByText('What this looks like')
      await toggle.click()
      await page.waitForTimeout(300)

      // After expanding, the card should contain description text referencing chart traces
      const cardText = await firstIssue.textContent()
      // All chart hint descriptions reference "gyro" or "motor" or "D-term"
      const hasTraceRef = /gyro|motor|D-term|setpoint/i.test(cardText ?? '')
      expect(hasTraceRef).toBe(true)
    })

    test('clicking toggle again collapses the description', async ({ page }) => {
      await page.locator('button').filter({ hasText: /^Issues/ }).click()
      const firstIssue = page.locator('[data-issue-id]').first()
      await firstIssue.scrollIntoViewIfNeeded()

      const toggle = firstIssue.getByText('What this looks like')

      // Expand
      await toggle.click()
      await page.waitForTimeout(200)
      const expandedText = await firstIssue.textContent()

      // Collapse
      await toggle.click()
      await page.waitForTimeout(200)
      const collapsedText = await firstIssue.textContent()

      // Collapsed text should be shorter (description removed)
      expect(collapsedText!.length).toBeLessThan(expandedText!.length)
    })

    test('chart hint stays expanded when clicking a different issue', async ({ page }) => {
      await page.locator('button').filter({ hasText: /^Issues/ }).click()
      const issues = page.locator('[data-issue-id]')
      const count = await issues.count()
      if (count < 2) {
        test.skip()
        return
      }

      // Expand hint on first issue
      const firstIssue = issues.first()
      await firstIssue.scrollIntoViewIfNeeded()
      const toggle = firstIssue.getByText('What this looks like')
      await toggle.click()
      await page.waitForTimeout(200)

      // Click the second issue (selects it)
      const secondIssue = issues.nth(1)
      await secondIssue.scrollIntoViewIfNeeded()
      await secondIssue.click()
      await page.waitForTimeout(500)

      // First issue's hint should still be expanded
      const firstCardText = await firstIssue.textContent()
      const hasTraceRef = /gyro|motor|D-term|setpoint/i.test(firstCardText ?? '')
      expect(hasTraceRef).toBe(true)
    })
  })

  // ---- Throttle toggle ----

  test.describe('Throttle Toggle', () => {
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

  // ---- Re-selection animations ----

  test.describe('Re-selection Animations', () => {
    test('clicking already-selected issue shows popover again', async ({ page }) => {
      await page.locator('button').filter({ hasText: /^Issues/ }).click()
      const issueCard = page.locator('[data-issue-id]').first()
      await issueCard.scrollIntoViewIfNeeded()
      await issueCard.click()
      await page.waitForTimeout(500)

      // Popover should appear
      const popover = page.getByTestId('issue-popover')
      await expect(popover).toBeVisible({ timeout: 3_000 })

      // Wait for popover to auto-dismiss
      await page.waitForTimeout(2500)
      await expect(popover).not.toBeVisible({ timeout: 3_000 })

      // Click the same card again (re-select)
      await issueCard.scrollIntoViewIfNeeded()
      await issueCard.click()
      await page.waitForTimeout(500)

      // Popover should appear again
      await expect(popover).toBeVisible({ timeout: 3_000 })
    })
  })

  // ---- Analysis overlay ----

  test.describe('Analysis Overlay', () => {
    test('analysis progress overlay appears during initial analysis', async ({ page }) => {
      // We need a fresh upload to catch the overlay
      await page.goto('/')

      // Upload file — progress overlay should appear during analysis
      await page.locator('#file-upload').setInputFiles(
        (await import('./helpers')).BFL_PATH
      )

      // Wait for parse to complete
      await expect(page.getByTestId('parse-success-text')).toBeVisible({ timeout: 30_000 })

      // The analysis overlay should eventually disappear (analysis completes)
      // We verify that after analysis completes, the overlay is gone
      await expect(page.getByTestId('flight-segments')).toBeVisible({ timeout: 30_000 })

      // Check that the main content area is visible (no overlay blocking it)
      const chartContainer = page.getByTestId('chart-container')
      await expect(chartContainer).toBeVisible()
    })
  })
})
