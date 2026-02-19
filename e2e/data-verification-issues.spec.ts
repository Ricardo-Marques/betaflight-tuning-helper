import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'
import { extractIssues, VALID_CHART_LABELS } from './data-verification-helpers'

test.describe('Data Verification — Issues', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  test('at least 3 distinct issue types detected', async ({ page }) => {
    const issues = await extractIssues(page)
    const uniqueDescriptions = new Set(
      issues.map(i => i.description.replace(/\s*\(×\d+\)$/, ''))
    )
    expect(uniqueDescriptions.size).toBeGreaterThanOrEqual(3)
  })

  test('all issues have valid axes', async ({ page }) => {
    const issues = await extractIssues(page)
    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      expect(['roll', 'pitch', 'yaw']).toContain(issue.axis)
    }
  })

  test('all confidence values are in 0-100% range', async ({ page }) => {
    const issues = await extractIssues(page)
    for (const issue of issues) {
      expect(issue.confidence).toBeGreaterThanOrEqual(0)
      expect(issue.confidence).toBeLessThanOrEqual(100)
    }
  })

  test('metric values are within physical bounds', async ({ page }) => {
    const issues = await extractIssues(page)
    for (const issue of issues) {
      if (issue.frequency !== undefined) {
        expect(issue.frequency).toBeGreaterThan(0)
        expect(issue.frequency).toBeLessThan(500) // Nyquist limit for 1kHz sampling
      }
      if (issue.amplitude !== undefined) {
        expect(issue.amplitude).toBeGreaterThan(0)
        expect(issue.amplitude).toBeLessThan(2000) // Physical limit deg/s
      }
      if (issue.overshoot !== undefined) {
        expect(issue.overshoot).toBeGreaterThan(0)
        expect(issue.overshoot).toBeLessThan(500) // Extreme but physical
      }
    }
  })

  test('both roll and pitch axes have detected issues', async ({ page }) => {
    const issues = await extractIssues(page)
    const axes = new Set(issues.map(i => i.axis))
    expect(axes.has('roll')).toBe(true)
    expect(axes.has('pitch')).toBe(true)
  })

  test('multi-occurrence issue count matches navigator', async ({ page }) => {
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    // Find all issues with (×N) in their description
    const cards = page.locator('[data-issue-id]')
    const count = await cards.count()

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i)
      const desc = await card.locator('h4').first().textContent()
      const match = desc?.match(/\(×(\d+)\)/)
      if (!match) continue

      const expectedCount = parseInt(match[1])

      // This card should have an occurrence navigator showing "1/N"
      const counter = card.locator('text=/\\d+\\/\\d+/')
      if (await counter.count() === 0) continue

      const counterText = await counter.textContent()
      const navMatch = counterText!.match(/^\d+\/(\d+)$/)
      expect(navMatch).not.toBeNull()
      expect(parseInt(navMatch![1])).toBe(expectedCount)
    }
  })

  test('issue reference lines on chart use known issue type labels', async ({ page }) => {
    // Labels are HTML elements rendered in an overlay above the chart
    const container = page.getByTestId('chart-container')
    const chartLabels = container.locator('[data-testid="chart-label"]')
    const count = await chartLabels.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const text = (await chartLabels.nth(i).textContent())!.trim()
      if (text.length === 0) continue
      // Label may include a stack count suffix like "propwash +2"
      const issueType = text.replace(/\s\+\d+$/, '')
      expect(VALID_CHART_LABELS.has(issueType)).toBe(true)
    }
  })
})
