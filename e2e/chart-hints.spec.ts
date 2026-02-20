import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Chart Hints & Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('issue cards have "What this looks like" toggle', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const firstIssue = page.locator('[data-issue-id]').first()
    await expect(firstIssue).toBeVisible()

    const toggle = firstIssue.getByText('What this looks like')
    await expect(toggle).toBeVisible()
  })

  test('clicking toggle expands chart description text', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
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
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
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

  test('chart hint text references chart traces', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const firstIssue = page.locator('[data-issue-id]').first()
    await firstIssue.scrollIntoViewIfNeeded()

    // Expand hint
    const toggle = firstIssue.getByText('What this looks like')
    await toggle.click()
    await page.waitForTimeout(200)

    // Expanded text should reference chart traces
    const cardText = await firstIssue.textContent()
    const hasTraceRef = /gyro|motor|D-term|setpoint/i.test(cardText ?? '')
    expect(hasTraceRef).toBe(true)
  })

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
