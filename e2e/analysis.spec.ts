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
    expect(['EXCELLENT', 'GOOD', 'NEEDSWORK', 'POOR']).toContain(text?.trim())
  })

  test('summary shows issue counts', async ({ page }) => {
    const summary = page.getByTestId('analysis-summary')
    await expect(summary.getByText('Critical Issues:')).toBeVisible()
    await expect(summary.getByText('Major Issues:')).toBeVisible()
    await expect(summary.getByText('Minor Issues:')).toBeVisible()
  })

  test('issues grouped by severity in order', async ({ page }) => {
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

    // Click next
    const nextBtn = multiOccCard.locator('button').filter({ hasText: '>' })
    await nextBtn.click()
    const newText = await counter.textContent()
    expect(newText).toMatch(/^2\/\d+$/)
  })

  test('issue cards have linked recommendations', async ({ page }) => {
    const seeLinks = page.locator('[data-issue-id]').locator('text=/^See:/')
    const count = await seeLinks.count()
    expect(count).toBeGreaterThan(0)
  })

  test('recommendation card has priority, confidence, changes, and rationale', async ({ page }) => {
    const section = page.getByTestId('recommendations-section')
    await expect(section).toBeVisible()

    const firstRec = section.locator('[data-rec-id]').first()
    await expect(firstRec).toBeVisible()
    await expect(firstRec.getByText(/Priority:/)).toBeVisible()
    await expect(firstRec.getByText(/confidence/)).toBeVisible()
    await expect(firstRec.getByText('Recommended Changes:')).toBeVisible()
    await expect(firstRec.getByText('Why this helps')).toBeVisible()
  })

  test('"Why this helps" expands to show rationale', async ({ page }) => {
    const section = page.getByTestId('recommendations-section')
    const firstRec = section.locator('[data-rec-id]').first()

    const details = firstRec.locator('details').first()
    const summary = details.locator('summary')
    await expect(summary).toHaveText('Why this helps')

    // Initially closed — content not visible
    const content = details.locator('p')
    await expect(content).not.toBeVisible()

    // Click to expand
    await summary.click()
    await expect(content).toBeVisible()
  })

  test('CLI commands section with copy button and preview', async ({ page }) => {
    const cli = page.getByTestId('cli-commands-section')
    await expect(cli).toBeVisible()

    const copyBtn = page.getByTestId('copy-cli-button')
    await expect(copyBtn).toBeVisible()

    // Expand preview
    const details = cli.locator('details')
    await details.locator('summary').click()
    const pre = cli.locator('pre')
    await expect(pre).toBeVisible()
    const commands = await pre.textContent()
    expect(commands).toContain('set')
    expect(commands).toContain('save')
  })
})
