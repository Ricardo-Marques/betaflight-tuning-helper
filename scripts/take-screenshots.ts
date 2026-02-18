/**
 * Screenshot automation for README showcase images.
 *
 * Usage:
 *   npx tsx scripts/take-screenshots.ts          # Take all screenshots
 *   npx tsx scripts/take-screenshots.ts 2         # Take only screenshot 2
 *   npx tsx scripts/take-screenshots.ts 1 3 5     # Take screenshots 1, 3, and 5
 *   npx tsx scripts/take-screenshots.ts composite  # Re-composite all from existing raws
 */
import { chromium, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const SCREENSHOTS_DIR = path.join(ROOT, 'screenshots')
const RAW_DIR = path.join(SCREENSHOTS_DIR, 'raw')
const TEST_LOG = path.join(ROOT, 'test-logs', 'bflLog.BFL')
const BASE_URL = 'http://localhost:5173'

const VIEWPORT = { width: 1920, height: 1080 }

interface ShowcaseCard {
  id: number
  filename: string
  rawFile: string
  title: string
  description: string
  accent: string
}

const SHOWCASE_CARDS: ShowcaseCard[] = [
  {
    id: 1,
    filename: '01-analysis-overview.png',
    rawFile: 'raw-01-overview.png',
    title: 'Instant Flight Analysis',
    description:
      'Upload a Blackbox log and instantly see detected issues overlaid on your flight data. The summary panel shows overall flight health, severity breakdown, and top priorities at a glance.',
    accent: '#3b82f6',
  },
  {
    id: 2,
    filename: '02-issue-detection.png',
    rawFile: 'raw-02-issue.png',
    title: 'Pinpoint Tuning Problems',
    description:
      'Click any issue marker to zoom in and see exactly where the problem occurs. Detailed metrics — frequency, amplitude, overshoot, and confidence — help you understand severity and root cause.',
    accent: '#ef4444',
  },
  {
    id: 3,
    filename: '03-actionable-fixes.png',
    rawFile: 'raw-03-fixes.png',
    title: 'Copy-Paste CLI Fixes',
    description:
      'Every detected issue comes with specific Betaflight parameter changes. See current vs. recommended values, understand the rationale, and copy the CLI commands directly into your configurator.',
    accent: '#10b981',
  },
  {
    id: 4,
    filename: '04-signal-analysis.png',
    rawFile: 'raw-04-signals.png',
    title: 'Deep Signal Analysis',
    description:
      'Toggle gyro, setpoint, D-term, and motor traces to isolate problems. Zoom and pan through your entire flight to trace oscillations, noise, or tracking errors back to their source.',
    accent: '#8b5cf6',
  },
  {
    id: 5,
    filename: '05-light-mode.png',
    rawFile: 'raw-05-light.png',
    title: 'Personalized Experience',
    description:
      'Switch between dark and light themes. Choose your quad profile and analysis level — from beginner-friendly basics to expert-level diagnostics — for tailored recommendations.',
    accent: '#f59e0b',
  },
]

// ── Helpers ──────────────────────────────────────────────────────────

async function waitForStable(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms)
}

async function uploadAndAnalyze(page: Page): Promise<void> {
  await page.locator('#file-upload').setInputFiles(TEST_LOG)
  await page.getByTestId('parse-success-text').waitFor({ state: 'visible', timeout: 30_000 })
  await page.getByTestId('flight-segments').waitFor({ state: 'visible', timeout: 30_000 })
  await waitForStable(page, 1500)
}

async function enableDarkMode(page: Page): Promise<void> {
  const btn = page.locator('button[aria-label="Toggle theme"]')
  const title = await btn.getAttribute('title')
  if (title === 'Switch to dark mode') {
    await btn.click()
    await waitForStable(page, 500)
  }
}

async function enableLightMode(page: Page): Promise<void> {
  const btn = page.locator('button[aria-label="Toggle theme"]')
  const title = await btn.getAttribute('title')
  if (title === 'Switch to light mode') {
    await btn.click()
    await waitForStable(page, 500)
  }
}

async function ensureToggle(toggle: ReturnType<Page['getByTestId']>, wanted: boolean): Promise<void> {
  const checked = await toggle.isChecked()
  if (wanted && !checked) await toggle.check()
  if (!wanted && checked) await toggle.uncheck()
}

// ── Individual screenshot captures ──────────────────────────────────

async function capture1(page: Page): Promise<void> {
  console.log('Taking screenshot 1: Analysis overview (dark)...')
  await enableDarkMode(page)
  await waitForStable(page, 800)

  await ensureToggle(page.getByTestId('toggle-gyro'), true)
  await ensureToggle(page.getByTestId('toggle-setpoint'), true)
  await ensureToggle(page.getByTestId('toggle-motors'), false)
  await ensureToggle(page.getByTestId('toggle-throttle'), false)
  await waitForStable(page, 500)

  await page.screenshot({ path: path.join(RAW_DIR, 'raw-01-overview.png') })
}

async function capture2(page: Page): Promise<void> {
  console.log('Taking screenshot 2: Issue detection (dark)...')
  await enableDarkMode(page)

  // Switch to Issues tab
  await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
  await waitForStable(page, 500)

  const issueCards = page.locator('[data-issue-id]')
  const issueCount = await issueCards.count()
  if (issueCount > 0) {
    // Find a high-severity issue if possible
    const highSevCard = page.locator('[data-issue-id][data-severity="high"]').first()
    const hasHigh = (await highSevCard.count()) > 0
    const targetCard = hasHigh ? highSevCard : issueCards.first()

    // Read the issue description to match it to a chart label later
    const issueTitle = await targetCard.locator('h4').first().textContent()
    const issueLabelText = issueTitle?.split(':')[0]?.trim() ?? ''

    await targetCard.scrollIntoViewIfNeeded()
    await targetCard.click()
    await waitForStable(page, 2000)

    // Hover over the chart label matching the selected issue to show popover + glow
    const chartLabels = page.locator('[data-testid="chart-label"]')
    const labelCount = await chartLabels.count()
    let hovered = false
    for (let i = 0; i < labelCount; i++) {
      const labelText = await chartLabels.nth(i).textContent()
      const cleanLabel = labelText?.replace(/\s\+\d+$/, '').trim() ?? ''
      if (cleanLabel === issueLabelText || issueLabelText.includes(cleanLabel) || cleanLabel.includes(issueLabelText)) {
        await chartLabels.nth(i).hover()
        await waitForStable(page, 600)
        hovered = true
        break
      }
    }
    if (!hovered && labelCount > 0) {
      await chartLabels.first().hover()
      await waitForStable(page, 600)
    }
  }

  await page.screenshot({ path: path.join(RAW_DIR, 'raw-02-issue.png') })
}

async function capture3(page: Page): Promise<void> {
  console.log('Taking screenshot 3: Fixes & CLI (dark)...')
  await enableDarkMode(page)

  // Reset zoom
  await page.getByTestId('zoom-reset-button').click()
  await waitForStable(page, 500)

  // Switch to Fixes tab
  await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Fixes/ }).click()
  await waitForStable(page, 500)

  // Expand CLI preview
  const previewBtn = page.locator('button').filter({ hasText: 'Preview' })
  if ((await previewBtn.count()) > 0) {
    await previewBtn.click()
    await waitForStable(page, 500)
  }

  await page.screenshot({ path: path.join(RAW_DIR, 'raw-03-fixes.png') })
}

async function capture4(page: Page): Promise<void> {
  console.log('Taking screenshot 4: Signal analysis (dark)...')
  await enableDarkMode(page)

  // Switch to Pitch axis
  await page.getByTestId('axis-button-pitch').click()
  await waitForStable(page, 500)

  // Summary tab for cleaner right panel
  await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Summary/ }).click()
  await waitForStable(page, 300)

  // Enable D-term and motors for a richer chart
  await ensureToggle(page.getByTestId('toggle-dterm'), true)
  await ensureToggle(page.getByTestId('toggle-motors'), true)
  await waitForStable(page, 500)

  // Zoom in to show waveform detail
  const container = page.getByTestId('chart-container')
  await container.hover()
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -300)
    await waitForStable(page, 150)
  }
  await waitForStable(page, 800)

  await page.screenshot({ path: path.join(RAW_DIR, 'raw-04-signals.png') })
}

async function capture5(page: Page): Promise<void> {
  console.log('Taking screenshot 5: Light mode overview...')

  // Reset zoom
  await page.getByTestId('zoom-reset-button').click()
  await waitForStable(page, 500)

  await enableLightMode(page)
  await waitForStable(page, 500)

  // Roll axis, gyro + setpoint only
  await page.getByTestId('axis-button-roll').click()
  await waitForStable(page, 500)

  await ensureToggle(page.getByTestId('toggle-dterm'), false)
  await ensureToggle(page.getByTestId('toggle-motors'), false)
  await ensureToggle(page.getByTestId('toggle-throttle'), false)
  await waitForStable(page, 500)

  // Summary tab
  await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Summary/ }).click()
  await waitForStable(page, 500)

  await page.screenshot({ path: path.join(RAW_DIR, 'raw-05-light.png') })
}

const CAPTURE_FNS: Record<number, (page: Page) => Promise<void>> = {
  1: capture1, 2: capture2, 3: capture3, 4: capture4, 5: capture5,
}

// ── Compositing ─────────────────────────────────────────────────────

function compositeHtml(rawImagePath: string, card: ShowcaseCard): string {
  const imgData = fs.readFileSync(rawImagePath)
  const imgUrl = `data:image/png;base64,${imgData.toString('base64')}`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: transparent;
    width: 1400px;
    overflow: hidden;
  }

  .card {
    display: flex;
    flex-direction: column;
    background: #111;
    border-radius: 16px;
    overflow: hidden;
    margin: 20px;
    box-shadow: 0 25px 50px rgba(0,0,0,0.5);
  }

  .text-panel {
    padding: 36px 44px 28px;
    background: linear-gradient(135deg, ${card.accent}18, ${card.accent}08);
    border-bottom: 1px solid ${card.accent}30;
  }

  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: ${card.accent};
    background: ${card.accent}20;
    padding: 4px 12px;
    border-radius: 100px;
    margin-bottom: 14px;
  }

  .title {
    font-size: 28px;
    font-weight: 700;
    color: #f5f5f5;
    margin-bottom: 10px;
    line-height: 1.2;
  }

  .description {
    font-size: 16px;
    line-height: 1.6;
    color: #a0a0a0;
    max-width: 900px;
  }

  .screenshot-wrap {
    padding: 0;
    position: relative;
  }

  .screenshot-wrap img {
    width: 100%;
    display: block;
    border-bottom-left-radius: 16px;
    border-bottom-right-radius: 16px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="text-panel">
      <div class="badge">Feature</div>
      <div class="title">${card.title}</div>
      <div class="description">${card.description}</div>
    </div>
    <div class="screenshot-wrap">
      <img src="${imgUrl}" />
    </div>
  </div>
</body>
</html>`
}

async function compositeCards(ids: number[]): Promise<void> {
  const cards = ids.length > 0
    ? SHOWCASE_CARDS.filter(c => ids.includes(c.id))
    : SHOWCASE_CARDS

  console.log('\nCreating composite showcase cards...')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 2000 },
    deviceScaleFactor: 2,
  })

  for (const card of cards) {
    const rawPath = path.join(RAW_DIR, card.rawFile)
    if (!fs.existsSync(rawPath)) {
      console.log(`  Skipping ${card.filename} — raw file missing`)
      continue
    }
    console.log(`  Compositing: ${card.filename}...`)
    const html = compositeHtml(rawPath, card)
    const tempPage = await ctx.newPage()
    await tempPage.setContent(html, { waitUntil: 'networkidle' })
    await tempPage.waitForTimeout(1000)
    const cardEl = tempPage.locator('.card')
    await cardEl.screenshot({
      path: path.join(SCREENSHOTS_DIR, card.filename),
      omitBackground: true,
    })
    await tempPage.close()
  }

  await ctx.close()
  await browser.close()
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  fs.mkdirSync(RAW_DIR, { recursive: true })

  const args = process.argv.slice(2)

  // "composite" mode — just re-render composites from existing raws
  if (args.includes('composite')) {
    const ids = args.filter(a => a !== 'composite').map(Number).filter(n => n >= 1 && n <= 5)
    await compositeCards(ids)
    return
  }

  // Determine which screenshots to take
  const requested = args.map(Number).filter(n => n >= 1 && n <= 5)
  const ids = requested.length > 0 ? requested : [1, 2, 3, 4, 5]

  console.log(`Capturing screenshot(s): ${ids.join(', ')}`)
  console.log('Launching browser...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  console.log('Navigating to app...')
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')

  console.log('Uploading log file...')
  await uploadAndAnalyze(page)

  // Capture requested screenshots sequentially
  for (const id of ids) {
    const fn = CAPTURE_FNS[id]
    if (fn) await fn(page)
  }

  await context.close()
  await browser.close()

  // Composite the captured screenshots
  await compositeCards(ids)

  console.log('\nDone! Screenshots saved to screenshots/')
  for (const card of SHOWCASE_CARDS.filter(c => ids.includes(c.id))) {
    console.log(`  ${card.filename}`)
  }
}

main().catch((err) => {
  console.error('Screenshot script failed:', err)
  process.exit(1)
})
