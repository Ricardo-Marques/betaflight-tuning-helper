import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Analysis — Summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('analysis summary is visible', async ({ page }) => {
    const summary = page.getByTestId('analysis-summary')
    await expect(summary).toBeVisible()
    await expect(summary.getByText('Analysis Summary')).toBeVisible()
    await expect(page.getByTestId('overall-health-badge')).toBeVisible()
  })

  test('health badge shows valid value', async ({ page }) => {
    const badge = page.getByTestId('overall-health-badge')
    const text = await badge.textContent()
    expect(['EXCELLENT', 'GOOD', 'NEEDS WORK', 'POOR']).toContain(text?.trim())
  })

  test('summary shows issue counts', async ({ page }) => {
    const summary = page.getByTestId('analysis-summary')
    await expect(summary.getByText(/\d+ High/)).toBeVisible()
    await expect(summary.getByText(/\d+ Med/)).toBeVisible()
    await expect(summary.getByText(/\d+ Low/)).toBeVisible()
  })

  test('issues grouped by severity in order', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const groups = page.locator('[data-testid^="severity-group-"]')
    const count = await groups.count()
    expect(count).toBeGreaterThan(0)

    // Verify order: high before medium before low
    const testIds: string[] = []
    for (let i = 0; i < count; i++) {
      const id = await groups.nth(i).getAttribute('data-testid')
      testIds.push(id!)
    }
    const order = ['severity-group-high', 'severity-group-medium', 'severity-group-low']
    const filtered = testIds.filter(id => order.includes(id))
    const expected = order.filter(id => filtered.includes(id))
    expect(filtered).toEqual(expected)
  })

  test('issue card has severity badge, axis, and confidence', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const firstIssue = page.locator('[data-issue-id]').first()
    await expect(firstIssue).toBeVisible()
    // Severity badge
    const badge = firstIssue.locator('span').filter({ hasText: /^(HIGH|MEDIUM|LOW)$/ })
    await expect(badge).toBeVisible()
    // Axis
    await expect(firstIssue.getByText('Axis:')).toBeVisible()
    // Confidence
    await expect(firstIssue.getByText('Confidence:')).toBeVisible()
  })
})
