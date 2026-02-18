import { test, expect, Page } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

/**
 * Known valid Betaflight CLI parameter names that our CLI export can produce.
 * Derived from CliExport.ts PER_AXIS_PARAMS and GLOBAL_PARAM_MAP.
 */
const VALID_CLI_PARAMS = new Set([
  // Per-axis PID (p/i/d/d_min/f × roll/pitch/yaw)
  'p_roll', 'p_pitch', 'p_yaw',
  'i_roll', 'i_pitch', 'i_yaw',
  'd_roll', 'd_pitch', 'd_yaw',
  'd_min_roll', 'd_min_pitch', 'd_min_yaw',
  'f_roll', 'f_pitch', 'f_yaw',
  // Global
  'simplified_master_multiplier',
  'simplified_gyro_filter_multiplier',
  'simplified_dterm_filter_multiplier',
  'dyn_notch_count', 'dyn_notch_q',
  'dyn_notch_min_hz', 'dyn_notch_max_hz',
  'rpm_filter_harmonics', 'rpm_filter_min_hz',
  'dshot_idle_value',
  'tpa_rate', 'tpa_breakpoint',
  'iterm_relax_cutoff',
])

/**
 * Chart labels use shortLabel() which extracts the text before the colon in
 * issue descriptions. These are the known prefixes produced by each rule.
 */
const VALID_CHART_LABELS = new Set([
  // BouncebackRule
  'Bounceback detected',
  // PropwashRule
  'Propwash oscillation',
  // WobbleRule (description starts with frequency band)
  'Low-frequency wobble', 'Mid-frequency wobble', 'High-frequency wobble',
  // GyroNoiseRule
  'Gyro noise',
  // DTermNoiseRule
  'D-term noise',
  // MotorSaturationRule
  'Motor saturation',
  // HighThrottleOscillationRule
  'High-throttle oscillation',
  // TrackingQualityRule
  'Phase lag', 'Poor tracking',
])

/** Extract the text of a <p> containing a given label from an issue card */
async function metricText(card: ReturnType<Page['locator']>, label: string): Promise<string | null> {
  const el = card.locator('p').filter({ hasText: label })
  if (await el.count() === 0) return null
  return (await el.first().textContent())!.trim()
}

/** Extract structured issue data from all issue cards on the page */
async function extractIssues(page: Page) {
  // Issues are on the Issues tab (default tab is Summary)
  await page.locator('button').filter({ hasText: /^Issues/ }).click()
  const cards = page.locator('[data-issue-id]')
  const count = await cards.count()
  const issues: {
    severity: string
    axis: string
    confidence: number
    description: string
    frequency?: number
    amplitude?: number
    overshoot?: number
  }[] = []

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i)
    const badge = card.locator('span').filter({ hasText: /^(HIGH|MEDIUM|LOW)$/ })
    const severity = (await badge.textContent())!.trim()

    // Use <p> parent to get full text like "Axis: roll"
    const axisText = await metricText(card, 'Axis:')
    const axis = axisText!.replace(/.*Axis:\s*/, '').trim()

    const confText = await metricText(card, 'Confidence:')
    const confidence = parseFloat(confText!.replace(/.*Confidence:\s*/, '').replace('%', '').trim())

    const description = (await card.locator('h4').first().textContent())!.trim()

    const issue: typeof issues[0] = { severity, axis, confidence, description }

    // Extract optional metrics from parent <p> elements
    const freqText = await metricText(card, 'Frequency:')
    if (freqText) {
      issue.frequency = parseFloat(freqText.replace(/.*Frequency:\s*/, '').replace('Hz', '').trim())
    }
    const ampText = await metricText(card, 'Amplitude:')
    if (ampText) {
      issue.amplitude = parseFloat(ampText.replace(/.*Amplitude:\s*/, '').replace('°/s', '').trim())
    }
    const ovText = await metricText(card, 'Overshoot:')
    if (ovText) {
      issue.overshoot = parseFloat(ovText.replace(/.*Overshoot:\s*/, '').replace('°', '').trim())
    }

    issues.push(issue)
  }
  return issues
}

test.describe('Data Verification', () => {
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

  test('summary issue counts match actual severity distribution', async ({ page }) => {
    // Read summary counts first (Summary tab is default)
    const summary = page.getByTestId('analysis-summary')

    const highText = await summary.getByText(/^High:/).textContent()
    const mediumText = await summary.getByText(/^Medium:/).textContent()
    const lowText = await summary.getByText(/^Low:/).textContent()

    const parsedHigh = parseInt(highText!.replace('High:', '').trim())
    const parsedMedium = parseInt(mediumText!.replace('Medium:', '').trim())
    const parsedLow = parseInt(lowText!.replace('Low:', '').trim())

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
    await page.locator('button').filter({ hasText: /^Issues/ }).click()
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
    await page.locator('button').filter({ hasText: /^Issues/ }).click()
    const fixLinks = page.locator('[data-issue-id]').locator('button').filter({ hasText: /^Fix:/ })
    const linkCount = await fixLinks.count()
    if (linkCount === 0) return

    // Switch to Fixes tab to get recommendation titles
    await page.locator('button').filter({ hasText: /^Fixes/ }).click()
    const recSection = page.getByTestId('recommendations-section')
    const recCards = recSection.locator('[data-rec-id]')
    const recTitles: string[] = []
    const recCount = await recCards.count()
    for (let i = 0; i < recCount; i++) {
      const title = await recCards.nth(i).locator('h4').first().textContent()
      recTitles.push(title!.trim())
    }

    // Switch back to Issues tab to read links
    await page.locator('button').filter({ hasText: /^Issues/ }).click()
    for (let i = 0; i < linkCount; i++) {
      const linkText = await fixLinks.nth(i).textContent()
      const recTitle = linkText!.replace('Fix:', '').trim()
      expect(recTitles).toContain(recTitle)
    }
  })

  test('both roll and pitch axes have detected issues', async ({ page }) => {
    const issues = await extractIssues(page)
    const axes = new Set(issues.map(i => i.axis))
    expect(axes.has('roll')).toBe(true)
    expect(axes.has('pitch')).toBe(true)
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
    await page.locator('button').filter({ hasText: /^Fixes/ }).click()
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
    await page.locator('button').filter({ hasText: /^Fixes/ }).click()
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

  test('multi-occurrence issue count matches navigator', async ({ page }) => {
    await page.locator('button').filter({ hasText: /^Issues/ }).click()
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
