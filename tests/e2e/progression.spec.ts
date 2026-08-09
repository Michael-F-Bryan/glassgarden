import { expect, test, type Page } from '@playwright/test'

import type { DevSnapshot } from '../../src/game/devtools'

/**
 * The hidden progression arc, exercised through the real UI: care creates
 * pressure, pressure reveals a development, the shop offers it, and buying
 * it visibly changes the tank.
 */

test.setTimeout(120_000)

async function snap(page: Page): Promise<DevSnapshot> {
  return page.evaluate(() => window.__glassgardenDev!.snapshot())
}

async function advance(page: Page, seconds: number) {
  await page.evaluate((s) => window.__glassgardenDev!.advance(s), seconds)
}

async function ready(page: Page, scenario: 'fresh' | 'growing-tank', seed: number) {
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
  await page.evaluate(() => window.__glassgardenDev!.setSpeed(0))
  await page.evaluate(
    ({ s, sd }) => window.__glassgardenDev!.loadScenario(s, sd),
    { s: scenario, sd: seed },
  )
}

test('care, then pressure, reveals the siphon and then filtration', async ({ page }) => {
  await ready(page, 'fresh', 4242)
  const canvas = page.getByTestId('tank-canvas')

  // Hand-feed until the tank has both grown and dirtied itself.
  for (let i = 0; i < 40; i += 1) {
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + 150 + (i % 8) * 110, box.y + 110)
    await advance(page, 14)
    if ((await snap(page)).developments.includes('siphonOffered')) break
  }

  let state = await snap(page)
  expect(state.developments).toContain('growthNoticed')
  expect(state.developments).toContain('siphonOffered')
  expect(state.fish).toHaveLength(1)
  // Filtration must not jump the queue ahead of the siphon.
  expect(state.developments).not.toContain('spongeFilterOffered')

  // Coins trickle in while the shop waits; the siphon becomes affordable.
  for (let i = 0; i < 30; i += 1) {
    if ((await snap(page)).shop.some((offer) => offer.id === 'siphon' && offer.affordable)) break
    await advance(page, 30)
  }
  await page.getByTestId('buy-siphon').click()
  await expect(page.getByTestId('tool-siphon')).toBeVisible()
  expect((await snap(page)).equipment.siphon).toBe(true)

  // Repeated cleaning is the maintenance pressure that reveals the filter.
  await page.getByTestId('tool-siphon').click()
  await expect(page.getByTestId('tool-siphon')).toHaveAttribute('aria-pressed', 'true')
  for (let i = 0; i < 16; i += 1) {
    // Re-read the box each sweep: expiring toasts restretch the grid row.
    const box = (await canvas.boundingBox())!
    const x = box.x + 110 + (i % 12) * 60
    const y = box.y + box.height - 36
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 30, y)
    await page.mouse.up()
  }
  await advance(page, 3)

  state = await snap(page)
  expect(state.care.siphonUses).toBeGreaterThanOrEqual(10)
  expect(state.developments).toContain('spongeFilterOffered')
  await expect(page.getByTestId('buy-spongeFilter')).toBeVisible()
})

test('a straining feeder reveals the next tier, and the upgrade relieves the tank', async ({
  page,
}) => {
  await ready(page, 'growing-tank', 77)
  expect((await snap(page)).equipment.feeder).toBe('drip')

  // A drip feeder cannot hold this many mature residents.
  await advance(page, 900)
  let state = await snap(page)
  expect(state.care.feederShortfallSeconds).toBeGreaterThan(0)
  expect(state.developments).toContain('twinHopperOffered')
  const strained = Math.max(...state.fish.map((fish) => fish.hunger))
  expect(strained).toBeGreaterThan(0.6)

  // Buy the upgrade once affordable; it replaces the drip feeder outright.
  for (let i = 0; i < 20; i += 1) {
    if ((await snap(page)).shop.some((offer) => offer.id === 'twinHopper' && offer.affordable)) break
    await advance(page, 120)
  }
  await page.getByTestId('buy-twinHopper').click()

  state = await snap(page)
  expect(state.equipment.feeder).toBe('twin')
  expect(state.care.feederShortfallSeconds).toBe(0)
  expect(state.shop.map((offer) => offer.id)).not.toContain('dripFeeder')

  // The relieved tank feeds comfortably again.
  await advance(page, 600)
  state = await snap(page)
  const relieved = state.fish.map((fish) => fish.hunger).sort((a, b) => a - b)
  const median = relieved[Math.floor(relieved.length / 2)]
  expect(median).toBeLessThan(0.6)
})
