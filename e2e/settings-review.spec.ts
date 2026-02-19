import { test, expect, Page } from '@playwright/test'
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

async function pasteSettings(page: Page) {
  await page.getByTestId('import-settings-button').click()
  await page.getByTestId('paste-cli-option').click()
  await page.getByTestId('settings-paste-textarea').waitFor({ state: 'visible', timeout: 5000 })
  await page.getByTestId('settings-paste-textarea').fill(BF_SETTINGS)
  const importBtns = page.getByTestId('import-settings-button')
  await importBtns.last().click({ force: true })
}

test.beforeEach(async ({ page }) => {
  // Clear localStorage so previous sessions don't interfere
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await uploadAndAnalyze(page)
})

test.describe('Settings review modal', () => {
  test('import opens review modal for acceptance', async ({ page }) => {
    await pasteSettings(page)

    // Review modal should appear
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await expect(page.getByTestId('settings-review-count')).toContainText('8 settings')
    await expect(page.getByTestId('settings-review-accept')).toBeVisible()
    await expect(page.getByTestId('settings-review-cancel')).toBeVisible()
  })

  test('accepting pending settings applies them as baseline', async ({ page }) => {
    await pasteSettings(page)

    // Accept in review modal
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-accept').click()

    // Review modal should close
    await expect(page.getByTestId('settings-review-modal')).not.toBeVisible()

    // Settings should now be active — "Update settings" text confirms import
    await expect(page.getByTestId('import-settings-button').first()).toContainText('Update settings')
  })

  test('cancelling review modal keeps settings pending', async ({ page }) => {
    await pasteSettings(page)

    // Cancel in review modal
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-cancel').click()

    // Review modal closes
    await expect(page.getByTestId('settings-review-modal')).not.toBeVisible()

    // Settings not accepted — still shows "Import settings"
    await expect(page.getByTestId('import-settings-button').first()).toContainText('Import settings')

    // Accept tune should be disabled (settings not imported)
    await expect(page.getByTestId('accept-tune-button')).toBeDisabled()
  })

  test('accept tune guard opens review modal when settings are pending', async ({ page }) => {
    // Import and accept settings first
    await pasteSettings(page)
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-accept').click()

    // Import more settings (creates new pending)
    await pasteSettings(page)
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-cancel').click()

    // Click Accept tune — guard fires, review modal opens
    await page.getByTestId('accept-tune-button').click()
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 3000 })
  })

  test('accepting from guard executes the deferred action', async ({ page }) => {
    // Import and accept settings
    await pasteSettings(page)
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-accept').click()

    // Import more settings (creates pending)
    await pasteSettings(page)
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-cancel').click()

    // Click Accept tune — guard opens review modal
    await page.getByTestId('accept-tune-button').click()
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 3000 })

    // Accept — should close review and open accept tune modal
    await page.getByTestId('settings-review-accept').click()
    await expect(page.getByTestId('settings-review-modal')).not.toBeVisible()
    await page.getByTestId('accept-tune-modal').waitFor({ state: 'visible', timeout: 3000 })
  })

  test('settings from previous session require re-acceptance', async ({ page }) => {
    // Import and accept settings
    await pasteSettings(page)
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('settings-review-accept').click()

    // Reload page — simulates returning next session
    await page.reload()
    await uploadAndAnalyze(page)

    // Accept tune should be disabled (pending settings from storage not yet accepted)
    await expect(page.getByTestId('accept-tune-button')).toBeDisabled()

    // Import from last session
    await page.getByTestId('import-settings-button').click()
    await page.getByTestId('last-session-option').click()
    await page.getByTestId('settings-review-modal').waitFor({ state: 'visible', timeout: 5000 })
    await expect(page.getByTestId('settings-review-count')).toContainText('8 settings')
    await page.getByTestId('settings-review-accept').click()

    // Accept tune should now be enabled
    await expect(page.getByTestId('accept-tune-button')).toBeEnabled()
  })
})
