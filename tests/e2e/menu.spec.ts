import { expect, test, type Page } from '@playwright/test'

import type { DevSnapshot } from '../../src/game/devtools'

async function waitForDevTools(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
}

async function snapshot(page: Page): Promise<DevSnapshot> {
  return page.evaluate(() => window.__glassgardenDev!.snapshot())
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForDevTools(page)
})

test('opening the menu pauses the tank; resuming lets it flow again', async ({ page }) => {
  await page.evaluate(() => {
    window.__glassgardenDev!.loadScenario('fresh', 61)
    window.__glassgardenDev!.setSpeed(4)
  })

  await page.getByTestId('menu-toggle').click()
  await expect(page.getByTestId('main-menu')).toBeVisible()

  const paused = (await snapshot(page)).time
  await page.waitForTimeout(700)
  expect((await snapshot(page)).time).toBe(paused)

  await page.getByTestId('menu-resume').click()
  await expect(page.getByTestId('main-menu')).not.toBeVisible()
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(paused)
})

test('starting a new game requires confirmation and resets the tank for good', async ({ page }) => {
  await page.evaluate(() => {
    window.__glassgardenDev!.setSpeed(0)
    window.__glassgardenDev!.loadScenario('fresh', 62)
    window.__glassgardenDev!.advance(30)
  })
  expect((await snapshot(page)).time).toBeGreaterThanOrEqual(30)

  // Backing out keeps the tank.
  await page.getByTestId('menu-toggle').click()
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('menu-keep-tank').click()
  expect((await snapshot(page)).time).toBeGreaterThanOrEqual(30)

  // Confirming really starts over.
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('menu-confirm-new-game').click()
  await expect(page.getByTestId('main-menu')).not.toBeVisible()
  const fresh = await snapshot(page)
  expect(fresh.time).toBeLessThan(5)
  expect(fresh.coins).toBe(30)
  expect(fresh.fish).toHaveLength(1)

  // The reset is saved immediately, not lost to a reload.
  await page.reload()
  await waitForDevTools(page)
  expect((await snapshot(page)).time).toBeLessThan(30)
})
