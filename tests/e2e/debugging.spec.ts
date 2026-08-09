import { expect, test, type Page } from '@playwright/test'

import type { DevScenario, DevSnapshot } from '../../src/game/devtools'

type DevWindow = Window & {
  __glassgarden?: unknown
}

async function waitForDevTools(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as DevWindow).__glassgardenDev))
}

async function snapshot(page: Page): Promise<DevSnapshot> {
  return page.evaluate(() => (window as DevWindow).__glassgardenDev!.snapshot())
}

async function loadScenario(page: Page, name: DevScenario, seed = 42): Promise<DevSnapshot> {
  return page.evaluate(
    ({ scenario, scenarioSeed }) =>
      (window as DevWindow).__glassgardenDev!.loadScenario(scenario, scenarioSeed),
    { scenario: name, scenarioSeed: seed },
  )
}

async function clickTank(page: Page, state: DevSnapshot, x: number, y: number): Promise<void> {
  const canvas = page.getByTestId('tank-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('tank canvas has no browser bounding box')
  await page.mouse.click(
    box.x + (x / state.tank.width) * box.width,
    box.y + (y / state.tank.height) * box.height,
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForDevTools(page)
  await page.evaluate(() => (window as DevWindow).__glassgardenDev!.setSpeed(0))
})

test('feeds a fresh fish and persists the result across reload', async ({ page }) => {
  const before = await loadScenario(page, 'fresh', 23)
  const fish = before.fish[0]
  const dropX = Math.min(before.tank.width - 40, fish.x + 50)

  await page.getByTestId('tool-feed').click()
  await clickTank(page, before, dropX, before.tank.waterTop + 40)
  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1)
  await page.evaluate(() => (window as DevWindow).__glassgardenDev!.advance(12))

  const fed = await snapshot(page)
  expect(fed.fish[0].weight).toBeGreaterThan(fish.weight)
  expect(fed.fish[0].hunger).toBeLessThan(fish.hunger)

  await page.reload()
  await waitForDevTools(page)
  await page.evaluate(() => (window as DevWindow).__glassgardenDev!.setSpeed(0))
  const reloaded = await snapshot(page)
  expect(reloaded.fish[0].name).toBe(fed.fish[0].name)
  expect(reloaded.fish[0].weight).toBeCloseTo(fed.fish[0].weight)
})

test('loads deterministic scenarios and cleans a dirty tank through the UI', async ({ page }) => {
  const first = await loadScenario(page, 'fresh', 91)
  const second = await loadScenario(page, 'fresh', 91)
  expect(second.fish).toEqual(first.fish)
  expect(await page.evaluate(() => (window as DevWindow).__glassgarden)).toBeUndefined()

  const dirty = await loadScenario(page, 'dirty-tank', 91)
  expect(dirty.waste).toHaveLength(3)
  expect(dirty.ownsSiphon).toBe(true)

  await page.getByTestId('tool-siphon').click()
  // Click-to-dismiss toasts overlap the bottom-left sand; clear them first.
  const toasts = page.locator('button[data-testid^="toast-"]')
  while (await toasts.count()) await toasts.first().click()
  await clickTank(page, dirty, dirty.waste[0].x, dirty.waste[0].y)

  await expect.poll(async () => (await snapshot(page)).waste.length).toBeLessThan(3)
})

test('simulates three hours away and rescues the fish through the UI', async ({ page }) => {
  await loadScenario(page, 'starving-rescuable', 17)
  const summary = await page.evaluate(() =>
    (window as DevWindow).__glassgardenDev!.simulateAway(3 * 60 * 60),
  )
  expect(summary.simulatedSeconds).toBe(20 * 60)

  await expect(page.getByText('While you were away…')).toBeVisible()
  await page.getByRole('button', { name: 'Back to the tank' }).click()

  const before = await snapshot(page)
  expect(before.fish).toHaveLength(1)
  const fish = before.fish[0]
  const dropX = Math.min(before.tank.width - 40, fish.x + 50)
  await page.getByTestId('tool-feed').click()
  await clickTank(page, before, dropX, before.tank.waterTop + 40)
  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1)
  await page.evaluate(() => (window as DevWindow).__glassgardenDev!.advance(12))

  const after = await snapshot(page)
  expect(after.fish).toHaveLength(1)
  expect(after.fish[0].hunger).toBeLessThan(fish.hunger)
  expect(after.gameOver).toBe(false)
})