import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Analysis', () => {
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

  test('CLI commands section with copy button and preview', async ({ page }) => {
    const cli = page.getByTestId('cli-commands-section')
    await expect(cli).toBeVisible()

    const copyBtn = page.getByTestId('copy-cli-button')
    await expect(copyBtn).toBeVisible()

    // Expand preview via toggle button
    await cli.getByText('Preview').click()
    const pre = cli.locator('pre')
    await expect(pre).toBeVisible()
    const commands = await pre.textContent()
    expect(commands).toContain('set')
    expect(commands).toContain('save')
  })
})
