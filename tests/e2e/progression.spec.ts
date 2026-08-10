import { expect, test } from '@playwright/test'

import { advance, snapshot, startScenario, tankPoint } from './support'


/**
 * The hidden progression arc, exercised through the real UI: care creates
 * pressure, pressure reveals a development, the shop offers it, and buying
 * it visibly changes the tank.
 */

test.setTimeout(120_000)

test('care, then pressure, reveals the siphon and then filtration', async ({ page }) => {
  await startScenario(page, 'fresh', 4242)
  const canvas = page.getByTestId('tank-canvas')

  // Hand-feed until the tank has both grown and dirtied itself.
  for (let i = 0; i < 40; i += 1) {
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + 150 + (i % 8) * 110, box.y + 110)
    await advance(page, 14)
    if ((await snapshot(page)).developments.includes('siphonOffered')) break
  }

  let state = await snapshot(page)
  expect(state.developments).toContain('growthNoticed')
  expect(state.developments).toContain('siphonOffered')
  expect(state.fish).toHaveLength(1)
  // Filtration must not jump the queue ahead of the siphon.
  expect(state.developments).not.toContain('spongeFilterOffered')

  // Coins trickle in while the shop waits; the siphon becomes affordable.
  for (let i = 0; i < 30; i += 1) {
    if ((await snapshot(page)).shop.some((offer) => offer.id === 'siphon' && offer.affordable)) break
    await advance(page, 30)
  }
  await page.getByTestId('buy-siphon').click()
  await expect(page.getByTestId('tool-siphon')).toBeVisible()
  expect((await snapshot(page)).equipment.siphon).toBe(true)

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

  state = await snapshot(page)
  expect(state.care.siphonUses).toBeGreaterThanOrEqual(10)
  expect(state.developments).toContain('spongeFilterOffered')
  await expect(page.getByTestId('buy-spongeFilter')).toBeVisible()
})

test('a stable full tank reveals the habitat expansion; buying it visibly enlarges the aquarium', async ({
  page,
}) => {
  await startScenario(page, 'thriving-full-tank', 4243)

  // Hold the tank at capacity, healthy and clean, until the shop takes note.
  for (let i = 0; i < 12; i += 1) {
    await advance(page, 60)
    if ((await snapshot(page)).developments.includes('habitatExpansionOffered')) break
  }
  let state = await snapshot(page)
  expect(state.developments).toContain('habitatExpansionOffered')
  expect(state.tank.width).toBe(1200)

  // Income accrues until the expansion is affordable, then buy it for real.
  for (let i = 0; i < 20; i += 1) {
    if (
      (await snapshot(page)).shop.some(
        (offer) => offer.id === 'habitatExpansion' && offer.affordable,
      )
    )
      break
    await advance(page, 60)
  }
  await page.getByTestId('buy-habitatExpansion').click()

  state = await snapshot(page)
  expect(state.equipment.habitat).toBe('expanded')
  expect(state.tank.width).toBeGreaterThan(1200)
  await expect(page.getByTestId('fish-roster')).toContainText('/20')

  // The capacity valve is open again: a healthy tank breeds past twelve.
  for (let i = 0; i < 10; i += 1) {
    await advance(page, 60)
    const now = await snapshot(page)
    if (now.fish.length + now.eggs.length > 12) break
  }
  state = await snapshot(page)
  expect(state.fish.length + state.eggs.length).toBeGreaterThan(12)

  // The pointer still lands where it aims in the larger coordinate space:
  // feed far in the new east ground and the pellet appears there.
  const before = (await snapshot(page)).food.length
  const point = await tankPoint(page, 1500, state.tank.waterTop + 40)
  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => (await snapshot(page)).food.length).toBeGreaterThan(before)
  const newest = (await snapshot(page)).food.at(-1)!
  expect(Math.abs(newest.x - 1500)).toBeLessThan(40)
})

test('a straining feeder reveals the next tier, and the upgrade relieves the tank', async ({
  page,
}) => {
  await startScenario(page, 'growing-tank', 77)
  expect((await snapshot(page)).equipment.feeder).toBe('drip')

  // A drip feeder cannot hold this many mature residents.
  await advance(page, 900)
  let state = await snapshot(page)
  expect(state.care.feederShortfallSeconds).toBeGreaterThan(0)
  expect(state.developments).toContain('twinHopperOffered')
  const strained = Math.max(...state.fish.map((fish) => fish.hunger))
  expect(strained).toBeGreaterThan(0.6)

  // Buy the upgrade once affordable; it replaces the drip feeder outright.
  for (let i = 0; i < 20; i += 1) {
    if ((await snapshot(page)).shop.some((offer) => offer.id === 'twinHopper' && offer.affordable)) break
    await advance(page, 120)
  }
  await page.getByTestId('buy-twinHopper').click()

  state = await snapshot(page)
  expect(state.equipment.feeder).toBe('twin')
  expect(state.care.feederShortfallSeconds).toBe(0)
  expect(state.shop.map((offer) => offer.id)).not.toContain('dripFeeder')

  // The relieved tank feeds comfortably again.
  await advance(page, 600)
  state = await snapshot(page)
  const relieved = state.fish.map((fish) => fish.hunger).sort((a, b) => a - b)
  const median = relieved[Math.floor(relieved.length / 2)]
  expect(median).toBeLessThan(0.6)
})
