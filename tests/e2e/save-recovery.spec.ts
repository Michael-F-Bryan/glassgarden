import { expect, test } from '@playwright/test'

test('an unreadable save starts fresh, warns, and preserves the raw data', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('glassgarden-save', '{"version":1,"coins":"not-a-number"}')
  })
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))

  await expect(page.getByTestId('toast-warning')).toContainText('could not be read')
  const recovered = await page.evaluate(() =>
    window.localStorage.getItem('glassgarden-save-recovery'),
  )
  expect(recovered).toContain('not-a-number')

  // The fresh tank is playable and autosave now writes a valid document.
  const state = await page.evaluate(() => window.__glassgardenDev!.snapshot())
  expect(state.fish).toHaveLength(1)
  expect(state.gameOver).toBe(false)
})
