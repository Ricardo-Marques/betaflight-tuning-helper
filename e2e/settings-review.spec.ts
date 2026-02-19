import { test, expect } from '@playwright/test'
import { uploadAndAnalyze } from './helpers'

const BF_SETTINGS = `
set p_roll = 45
set i_roll = 80
set d_roll = 40
set p_pitch = 47
set i_pitch = 84
set d_pitch = 46
set p_yaw = 45
set i_yaw = 80
`.trim()

test.beforeEach(async ({ page }) => {
  // Clear localStorage so previous sessions don't interfere
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await uploadAndAnalyze(page)
})

test.describe('Settings review modal', () => {
  test('import opens review modal for acceptance', async ({ page }) => {
    // Open import modal
    await page.getByTestId('import-settings-button').click()
    await page.getByTestId('settings-paste-textarea').waitFor({ state: 'visible', timeout: 5000 })

    // Paste and import
    await page.getByTestId('settings-paste-textarea').fill(BF_SETTINGS)
    const importBtns = page.getByTestId('import-settings-button')
    await importBtns.last().click({ force: true })

    // Review modal should appear
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await expect(page.getByTestId('settings-review-count')).toContainText('8 settings')
    await expect(page.getByTestId('settings-review-accept')).toBeVisible()
    await expect(page.getByTestId('settings-review-cancel')).toBeVisible()
  })

  test('accepting pending settings applies them as baseline', async ({ page }) => {
    // Import settings
    await page.getByTestId('import-settings-button').click()
    await page.getByTestId('settings-paste-textarea').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-paste-textarea').fill(BF_SETTINGS)
    const importBtns = page.getByTestId('import-settings-button')
    await importBtns.last().click({ force: true })

    // Accept in review modal
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-accept').click()

    // Review modal should close
    await expect(page.getByTestId('settings-review-modal')).not.toBeVisible()

    // Settings should now be active — "Update settings" text confirms import
    await expect(page.getByTestId('import-settings-button').first()).toContainText('Update settings')
  })

  test('cancelling review modal keeps settings pending', async ({ page }) => {
    // Import settings
    await page.getByTestId('import-settings-button').click()
    await page.getByTestId('settings-paste-textarea').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-paste-textarea').fill(BF_SETTINGS)
    const importBtns = page.getByTestId('import-settings-button')
    await importBtns.last().click({ force: true })

    // Cancel in review modal
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-cancel').click()

    // Review modal closes
    await expect(page.getByTestId('settings-review-modal')).not.toBeVisible()

    // Settings not accepted — still shows "Import settings"
    await expect(page.getByTestId('import-settings-button').first()).toContainText('Import settings')

    // Clicking Copy re-opens review modal (guard)
    await page.getByTestId('copy-cli-button').click()
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 3000 })
  })

  test('preview click opens review modal when settings are pending', async ({ page }) => {
    // Import settings and cancel review
    await page.getByTestId('import-settings-button').click()
    await page.getByTestId('settings-paste-textarea').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-paste-textarea').fill(BF_SETTINGS)
    const importBtns = page.getByTestId('import-settings-button')
    await importBtns.last().click({ force: true })
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-cancel').click()

    // Click Preview — should open review modal instead of expanding CLI
    const previewBtn = page.getByTestId('cli-commands-section').locator('button').filter({ hasText: 'Preview' })
    await previewBtn.click()
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 3000 })
  })

  test('accepting from guard executes the deferred action', async ({ page }) => {
    // Import settings and cancel review
    await page.getByTestId('import-settings-button').click()
    await page.getByTestId('settings-paste-textarea').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-paste-textarea').fill(BF_SETTINGS)
    const importBtns = page.getByTestId('import-settings-button')
    await importBtns.last().click({ force: true })
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-cancel').click()

    // Click Preview — guard opens review modal
    const previewBtn = page.getByTestId('cli-commands-section').locator('button').filter({ hasText: 'Preview' })
    await previewBtn.click()
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 3000 })

    // Accept — should close modal AND expand CLI preview
    await page.getByTestId('settings-review-accept').click()
    await expect(page.getByTestId('settings-review-modal')).not.toBeVisible()

    // CLI preview should now be expanded (contains "set" commands)
    const cliPreview = page.getByTestId('cli-commands-section').locator('pre')
    await expect(cliPreview).toBeVisible({ timeout: 3000 })
  })

  test('settings from previous session require re-acceptance', async ({ page }) => {
    // Import and accept settings
    await page.getByTestId('import-settings-button').click()
    await page.getByTestId('settings-paste-textarea').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-paste-textarea').fill(BF_SETTINGS)
    const importBtns = page.getByTestId('import-settings-button')
    await importBtns.last().click({ force: true })
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-accept').click()

    // Reload page — simulates returning next session
    await page.reload()
    await uploadAndAnalyze(page)

    // Click Copy — should open review modal (settings from storage need re-acceptance)
    await page.getByTestId('copy-cli-button').click()
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await expect(page.getByTestId('settings-review-count')).toContainText('8 settings')
  })
})
