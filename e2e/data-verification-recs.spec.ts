import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'
import { extractIssues, VALID_CLI_PARAMS } from './data-verification-helpers'

test.describe('Data Verification — Recommendations & CLI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('summary issue counts match actual severity distribution', async ({ page }) => {
    // Read summary counts from severity chips (format: "{count} High", "{count} Med", "{count} Low")
    const summary = page.getByTestId('analysis-summary')

    const highText = await summary.getByText(/\d+ High/).textContent()
    const mediumText = await summary.getByText(/\d+ Med/).textContent()
    const lowText = await summary.getByText(/\d+ Low/).textContent()

    const parsedHigh = parseInt(highText!.trim())
    const parsedMedium = parseInt(mediumText!.trim())
    const parsedLow = parseInt(lowText!.trim())

    // Then switch to Issues tab to count actual issues
    const issues = await extractIssues(page)
    const highCount = issues.filter(i => i.severity === 'HIGH').length
    const mediumCount = issues.filter(i => i.severity === 'MEDIUM').length
    const lowCount = issues.filter(i => i.severity === 'LOW').length

    expect(parsedHigh).toBe(highCount)
    expect(parsedMedium).toBe(mediumCount)
    expect(parsedLow).toBe(lowCount)
  })

  test('each severity group contains only matching issues', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    for (const sev of ['high', 'medium', 'low'] as const) {
      const group = page.getByTestId(`severity-group-${sev}`)
      if (await group.count() === 0) continue

      const badges = group.locator('[data-issue-id]').locator('span').filter({
        hasText: /^(HIGH|MEDIUM|LOW)$/,
      })
      const count = await badges.count()
      for (let i = 0; i < count; i++) {
        const text = await badges.nth(i).textContent()
        expect(text!.trim()).toBe(sev.toUpperCase())
      }
    }
  })

  test('CLI commands reference only valid Betaflight parameters', async ({ page }) => {
    const cli = page.getByTestId('cli-commands-section')
    await cli.getByText('Preview').click()
    const pre = cli.locator('pre')
    const cliText = await pre.textContent()

    // Extract all "set X = Y" lines
    const setLines = cliText!.split('\n').filter(l => l.trim().startsWith('set '))
    expect(setLines.length).toBeGreaterThan(0)

    for (const line of setLines) {
      const match = line.match(/^set\s+(\S+)\s*=/)
      expect(match).not.toBeNull()
      const param = match![1]
      expect(VALID_CLI_PARAMS.has(param)).toBe(true)
    }
  })

  test('CLI commands end with save', async ({ page }) => {
    const cli = page.getByTestId('cli-commands-section')
    await cli.getByText('Preview').click()
    const cliText = await cli.locator('pre').textContent()
    const lines = cliText!.trim().split('\n').filter(l => l.trim().length > 0)
    expect(lines[lines.length - 1].trim()).toBe('save')
  })

  test('all "Fix:" links point to visible recommendations', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const fixLinks = page.locator('[data-issue-id]').locator('button').filter({ hasText: /^Fix:/ })
    const linkCount = await fixLinks.count()
    if (linkCount === 0) return

    // Switch to Fixes tab to get recommendation titles
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Fixes/ }).click()
    const recSection = page.getByTestId('recommendations-section')
    const recCards = recSection.locator('[data-rec-id]')
    const recTitles: string[] = []
    const recCount = await recCards.count()
    for (let i = 0; i < recCount; i++) {
      const title = await recCards.nth(i).locator('h4').first().textContent()
      recTitles.push(title!.trim())
    }

    // Switch back to Issues tab to read links
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    for (let i = 0; i < linkCount; i++) {
      const linkText = await fixLinks.nth(i).textContent()
      const recTitle = linkText!.replace('Fix:', '').trim()
      expect(recTitles).toContain(recTitle)
    }
  })

  test('top priorities match actual recommendation titles', async ({ page }) => {
    const priorities = page.getByTestId('top-priorities')
    const items = priorities.locator('li')
    const priorityCount = await items.count()
    expect(priorityCount).toBeGreaterThan(0)

    const priorityTexts: string[] = []
    for (let i = 0; i < priorityCount; i++) {
      priorityTexts.push((await items.nth(i).textContent())!.trim())
    }

    // Switch to Fixes tab to get recommendation titles
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Fixes/ }).click()
    const recSection = page.getByTestId('recommendations-section')
    const recCards = recSection.locator('[data-rec-id]')
    const recTitles: string[] = []
    const recCount = await recCards.count()
    for (let i = 0; i < recCount; i++) {
      recTitles.push((await recCards.nth(i).locator('h4').first().textContent())!.trim())
    }

    for (const priority of priorityTexts) {
      expect(recTitles).toContain(priority)
    }
  })

  test('recommendation priorities are in descending order', async ({ page }) => {
    // Switch to Fixes tab
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Fixes/ }).click()
    const recSection = page.getByTestId('recommendations-section')
    const recCards = recSection.locator('[data-rec-id]')
    const count = await recCards.count()
    expect(count).toBeGreaterThan(1)

    const priorities: number[] = []
    for (let i = 0; i < count; i++) {
      const badge = recCards.nth(i).getByText(/Priority:/)
      const text = await badge.textContent()
      priorities.push(parseInt(text!.replace('Priority:', '').trim()))
    }

    // Should be non-increasing (descending or equal)
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeLessThanOrEqual(priorities[i - 1])
    }
  })
})
