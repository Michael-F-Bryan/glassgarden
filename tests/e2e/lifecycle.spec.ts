import { expect, test } from '@playwright/test'

import { loadScenario, openGame, snapshot, tankPoint } from './support'

test('replacing the simulation resets the tool, so the first click feeds', async ({ page }) => {
  await openGame(page)
  await loadScenario(page, 'dirty-tank', 81)
  await page.getByTestId('tool-siphon').click()

  await loadScenario(page, 'fresh', 82)

  // The fresh tank has no siphon; the stale tool must not survive replacement.
  await expect(page.getByTestId('tool-siphon')).not.toBeVisible()
  await page.getByTestId('tank-canvas').click({ position: { x: 650, y: 100 } })
  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1)
})

test('number keys select the feed and siphon tools', async ({ page }) => {
  await openGame(page)
  await loadScenario(page, 'dirty-tank', 84)

  await page.keyboard.press('2')
  await expect(page.getByTestId('tool-siphon')).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('1')
  await expect(page.getByTestId('tool-feed')).toHaveAttribute('aria-pressed', 'true')
})

test('pausing cancels a held feed gesture; resuming needs a fresh press', async ({ page }) => {
  await openGame(page)
  await loadScenario(page, 'fresh', 83)
  const point = await tankPoint(page, 1000, 300)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await expect.poll(async () => (await snapshot(page)).food.length).toBeGreaterThan(0)

  // Open the menu through its normal click handler while the pointer stays held.
  await page.evaluate(() =>
    (document.querySelector('[data-testid="menu-toggle"]') as HTMLButtonElement).click(),
  )
  await expect(page.getByTestId('main-menu')).toBeVisible()
  const atPause = (await snapshot(page)).food.length
  await page.waitForTimeout(700)
  expect((await snapshot(page)).food.length).toBe(atPause)

  // Resuming must not resurrect the old gesture — it was cancelled at pause.
  await page.mouse.up()
  await page.getByTestId('menu-resume').click()
  await page.waitForTimeout(700)
  expect((await snapshot(page)).food.length).toBe(atPause)
})
