import { expect, test, type Page } from '@playwright/test'

import { loadScenario, openGame, snapshot, tankPoint } from './support'

type DevWindow = Window & {
  __glassgarden?: unknown
}

test.beforeEach(async ({ page }) => {
  await openGame(page)
})

/** Click a point given in logical tank coordinates. */
async function clickTank(page: Page, x: number, y: number): Promise<void> {
  const point = await tankPoint(page, x, y)
  await page.mouse.click(point.x, point.y)
}

test('feeds a fresh fish and persists the result across reload', async ({ page }) => {
  const before = await loadScenario(page, 'fresh', 23)
  const fish = before.fish[0]
  const dropX = Math.min(before.tank.width - 40, fish.x + 50)

  await page.getByTestId('tool-feed').click()
  await clickTank(page, dropX, before.tank.waterTop + 40)
  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1)
  await page.evaluate(() => (window as DevWindow).__glassgardenDev!.advance(12))

  const fed = await snapshot(page)
  expect(fed.fish[0].weight).toBeGreaterThan(fish.weight)
  expect(fed.fish[0].hunger).toBeLessThan(fish.hunger)

  await page.reload()
  await openGame(page)
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
  expect(dirty.equipment.siphon).toBe(true)

  await page.getByTestId('tool-siphon').click()
  await clickTank(page, dirty.waste[0].x, dirty.waste[0].y)

  await expect.poll(async () => (await snapshot(page)).waste.length).toBeLessThan(3)
})

test('a mature full tank stays readable: debris bounded, water recoverable', async ({ page }) => {
  test.setTimeout(120_000)
  // The roadmap's item-3 measurement: a fed twelve-resident tank used to
  // settle at ~200 standing droppings with the worst water cell pinned at
  // 1.00 and the sponge filter clogged to ~18% efficiency. A mature tank must
  // stay legible: bounded debris, a filter that still works, and murk that
  // stays out of the "foul" band while the tank is otherwise cared for.
  await loadScenario(page, 'thriving-full-tank', 42)
  for (let i = 0; i < 2; i += 1) {
    await page.evaluate(() => (window as DevWindow).__glassgardenDev!.advance(15 * 60))
  }

  const mature = await snapshot(page)
  expect(mature.fish).toHaveLength(12)
  expect(mature.waste.length).toBeLessThanOrEqual(90)
  expect(mature.water.meanPollution).toBeLessThan(0.25)
  // Debris still exists in numbers worth sweeping — the siphon keeps its job.
  expect(mature.waste.length).toBeGreaterThanOrEqual(15)
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
  await clickTank(page, dropX, before.tank.waterTop + 40)
  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1)
  await page.evaluate(() => (window as DevWindow).__glassgardenDev!.advance(12))

  const after = await snapshot(page)
  expect(after.fish).toHaveLength(1)
  expect(after.fish[0].hunger).toBeLessThan(fish.hunger)
  expect(after.gameOver).toBe(false)
})