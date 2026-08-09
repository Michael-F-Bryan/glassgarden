import { expect, test, type Page } from '@playwright/test'

async function waitForDevTools(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForDevTools(page)
  await page.evaluate(() => {
    window.__glassgardenDev!.setSpeed(0)
    window.__glassgardenDev!.loadScenario('fresh', 41)
  })
})

test('the Tank Journal opens from the book button and remembers the arrival', async ({ page }) => {
  await page.getByTestId('journal-toggle').click()

  const journal = page.getByTestId('tank-journal')
  await expect(journal).toBeVisible()
  await expect(journal).toContainText('Tank Journal')
  await expect(journal).toContainText('arrived in the bare tank')

  await page.keyboard.press('Escape')
  await expect(journal).not.toBeVisible()
})

test('the journal survives a reload', async ({ page }) => {
  await page.reload()
  await waitForDevTools(page)

  await page.getByTestId('journal-toggle').click()
  await expect(page.getByTestId('tank-journal')).toContainText('arrived in the bare tank')
})
