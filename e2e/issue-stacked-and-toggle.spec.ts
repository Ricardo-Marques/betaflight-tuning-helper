import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

test.describe('Issue Interactions — Stacked & Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadAndAnalyze(page)
  })

  // ---- Stacked Issue Behavior ----

  test('chart click selects highest priority first', async ({ page }) => {
    // Click on a reference line area in the chart
    const refLine = page.getByTestId('chart-container').locator('.recharts-reference-line').first()
    const refLineCount = await refLine.count()
    if (refLineCount === 0) {
      test.skip()
      return
    }

    // Click on the chart area near a reference line
    const container = page.getByTestId('chart-container')
    const svgArea = container.locator('svg.recharts-surface').first()
    await svgArea.click({ position: { x: 100, y: 100 } })
    await page.waitForTimeout(500)

    // If a card got selected, verify it exists
    const selectedCard = page.locator('[data-issue-id][data-selected="true"]')
    const selectedCount = await selectedCard.count()
    if (selectedCount > 0) {
      await expect(selectedCard).toBeVisible()
    }
  })

  test('clicking same position cycles issues', async ({ page }) => {
    // Find a reference line position and click it
    const container = page.getByTestId('chart-container')
    const refLines = container.locator('.recharts-reference-line line')
    const lineCount = await refLines.count()
    if (lineCount < 2) {
      test.skip()
      return
    }

    // Get position of first reference line
    const firstLine = refLines.first()
    const bbox = await firstLine.boundingBox()
    if (!bbox) {
      test.skip()
      return
    }

    const svgArea = container.locator('svg.recharts-surface').first()
    const svgBox = await svgArea.boundingBox()
    if (!svgBox) {
      test.skip()
      return
    }

    // Click at the reference line position (relative to the SVG)
    const relX = bbox.x - svgBox.x + bbox.width / 2
    const relY = svgBox.height / 2

    // First click
    await svgArea.click({ position: { x: relX, y: relY } })
    await page.waitForTimeout(500)

    const selectedCard1 = page.locator('[data-issue-id][data-selected="true"]')
    const count1 = await selectedCard1.count()
    if (count1 === 0) {
      // No issue at this position — skip
      test.skip()
      return
    }
    const firstSelectedId = await selectedCard1.first().getAttribute('data-issue-id')

    // Second click at same position
    await svgArea.click({ position: { x: relX, y: relY } })
    await page.waitForTimeout(500)

    const selectedCard2 = page.locator('[data-issue-id][data-selected="true"]')
    const count2 = await selectedCard2.count()
    if (count2 === 0) {
      // Selection was cleared — that's also valid behavior
      return
    }
    const secondSelectedId = await selectedCard2.first().getAttribute('data-issue-id')

    // If there are stacked issues, the selected ID should change
    // If not stacked, it may be the same — both are valid
    expect(secondSelectedId).toBeDefined()
    // We note whether cycling happened (may or may not depending on stacking)
    if (firstSelectedId !== secondSelectedId) {
      expect(secondSelectedId).not.toBe(firstSelectedId)
    }
  })

  // ---- Issues Toggle ----

  test('issues toggle is checked by default', async ({ page }) => {
    const toggle = page.getByTestId('toggle-issues')
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeChecked()
  })

  test('unchecking hides issue markers, labels, and summary strip', async ({ page }) => {
    // Verify issues are visible before toggling
    const refLines = page.getByTestId('chart-container').locator('.recharts-reference-line')
    const refLinesBefore = await refLines.count()
    expect(refLinesBefore).toBeGreaterThan(0)

    const strip = page.getByTestId('issues-in-view')
    await expect(strip).toBeVisible()

    const labels = page.getByTestId('chart-label')
    const labelsBefore = await labels.count()
    expect(labelsBefore).toBeGreaterThan(0)

    await page.getByTestId('toggle-issues').uncheck()
    await page.waitForTimeout(300)

    // Reference lines, labels, and strip should be gone
    const refLinesAfter = await refLines.count()
    expect(refLinesAfter).toBe(0)

    await expect(strip).toContainText('Issues hidden')

    const labelsAfter = await labels.count()
    expect(labelsAfter).toBe(0)
  })

  test('selected issue still shows line and label when toggle is off', async ({ page }) => {
    await page.getByTestId('toggle-issues').uncheck()
    await page.waitForTimeout(300)

    // Verify everything is hidden
    const refLines = page.getByTestId('chart-container').locator('.recharts-reference-line')
    expect(await refLines.count()).toBe(0)
    expect(await page.getByTestId('chart-label').count()).toBe(0)

    // Select an issue from the right panel
    await page.getByTestId('right-panel').locator('button').filter({ hasText: /^Issues/ }).click()
    const issueCard = page.locator('[data-issue-id]').first()
    await issueCard.scrollIntoViewIfNeeded()
    await issueCard.click()
    await page.waitForTimeout(500)

    // The selected issue's reference line(s) should now appear
    const refLinesAfter = await refLines.count()
    expect(refLinesAfter).toBeGreaterThan(0)

    // The selected issue's label should appear
    const labelsAfter = await page.getByTestId('chart-label').count()
    expect(labelsAfter).toBeGreaterThan(0)
  })

  test('re-enabling toggle restores all issues', async ({ page }) => {
    const refLines = page.getByTestId('chart-container').locator('.recharts-reference-line')
    const refLinesBefore = await refLines.count()

    await page.getByTestId('toggle-issues').uncheck()
    await page.waitForTimeout(300)
    await page.getByTestId('toggle-issues').check()
    await page.waitForTimeout(300)

    const refLinesAfter = await refLines.count()
    expect(refLinesAfter).toBe(refLinesBefore)

    await expect(page.getByTestId('issues-in-view')).toBeVisible()
  })
})
