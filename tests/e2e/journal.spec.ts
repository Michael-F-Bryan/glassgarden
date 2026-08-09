import { expect, test } from '@playwright/test'

import { loadScenario, openGame } from './support'

test.beforeEach(async ({ page }) => {
  await openGame(page)
  await loadScenario(page, 'fresh', 41)
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
  await openGame(page)

  await page.getByTestId('journal-toggle').click()
  await expect(page.getByTestId('tank-journal')).toContainText('arrived in the bare tank')
})
