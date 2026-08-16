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

  // Cleaning that does real work is the maintenance pressure that reveals
  // the filter: sweeps that actually lift a dropping off the sand. Sweeping
  // clean glass earns nothing, so the tank has to keep making the mess.
  for (let i = 0; i < 45; i += 1) {
    state = await snapshot(page)
    if (state.developments.includes('spongeFilterOffered')) break

    await page.getByTestId('tool-siphon').click()
    for (const dropping of state.waste.slice(0, 3)) {
      const point = await tankPoint(page, dropping.x, dropping.y)
      await page.mouse.click(point.x, point.y)
      await advance(page, 2) // sweeping the same spot on repeat is not work
    }

    // Feed the tank on again, so there is something to clean next round.
    await page.getByTestId('tool-feed').click()
    const fish = state.fish[0]
    const drop = await tankPoint(
      page,
      Math.min(state.tank.width - 40, fish.x + 50),
      state.tank.waterTop + 40,
    )
    for (let pinch = 0; pinch < 6; pinch += 1) {
      await page.mouse.click(drop.x, drop.y)
    }
    await advance(page, 25)
  }

  state = await snapshot(page)
  expect(state.care.cleaningCredits).toBeGreaterThanOrEqual(8)
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

test('an expanded habitat stays readable and interactive near twenty residents', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await startScenario(page, 'thriving-full-tank', 4245)

  // Earn and buy the expansion through its real conditions.
  for (let i = 0; i < 12; i += 1) {
    await advance(page, 60)
    if ((await snapshot(page)).developments.includes('habitatExpansionOffered')) break
  }
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

  // Let the community breed toward the new capacity.
  for (let i = 0; i < 40; i += 1) {
    await advance(page, 60)
    if ((await snapshot(page)).fish.length >= 19) break
  }
  const grown = await snapshot(page)
  expect(grown.fish.length).toBeGreaterThanOrEqual(17)

  // Capacity is a hard valve: simultaneous courtships must not overshoot it.
  expect(grown.fish.length + grown.eggs.length).toBeLessThanOrEqual(20)

  // The tank stays legible under automation alone: debris bounded, water
  // out of the foul band, every resident findable.
  expect(grown.waste.length).toBeLessThanOrEqual(110)
  expect(grown.water.meanPollution).toBeLessThan(0.3)
  expect(Math.max(...grown.fish.map((fish) => fish.sickness))).toBeLessThan(0.5)

  // Healthy broods are the norm in a cared-for tank; stunted fry mean the
  // ground under the eggs was genuinely foul, not merely lived-on.
  const hatched = grown.fish.filter((fish) => fish.generation >= 2)
  const murky = hatched.filter((fish) => fish.hatchedInMurkyWater)
  expect(murky.length).toBeLessThan(hatched.length / 2)

  // Lineage is visible on a hatched resident through the real inspector.
  const descendant = grown.fish.find((fish) => fish.generation >= 2 && fish.parents)
  expect(descendant).toBeDefined()
  await page.getByTestId(`resident-${descendant!.id}`).click()
  await expect(page.getByTestId('fish-inspector')).toContainText(
    `child of ${descendant!.parents![0]}`,
  )
  await page.keyboard.press('Escape')

  // Keyboard play still works in the larger coordinate space.
  await page.getByTestId('tank-canvas').focus()
  await page.keyboard.press('n')
  await page.keyboard.press('i')
  await expect(page.getByTestId('fish-inspector')).toBeVisible()
  await page.keyboard.press('Escape')

  // Eight real seconds at normal speed: the tank keeps simulating and stays
  // quiet in the console while twenty residents swim.
  await page.evaluate(() => window.__glassgardenDev!.setSpeed(1))
  const before = (await snapshot(page)).time
  await page.waitForTimeout(8_000)
  const after = (await snapshot(page)).time
  expect(after - before).toBeGreaterThan(5)

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('a first shared egg forms a visible partnership that survives reload', async ({ page }) => {
  await startScenario(page, 'growing-tank', 4244)

  // Let the healthy tank court and lay its first egg.
  for (let i = 0; i < 30; i += 1) {
    await advance(page, 20)
    if ((await snapshot(page)).fish.some((fish) => fish.partner)) break
  }
  let state = await snapshot(page)
  const bonded = state.fish.find((fish) => fish.partner)
  expect(bonded).toBeDefined()
  expect(state.fish.find((fish) => fish.name === bonded!.partner)?.partner).toBe(bonded!.name)

  // The relationship is a player-visible fact, not private sim state.
  await page.getByTestId(`resident-${bonded!.id}`).click()
  await expect(page.getByTestId('inspector-partner')).toContainText(
    `partnered with ${bonded!.partner}`,
  )

  // And it is durable: the bond is still there after a reload.
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
  await page.evaluate(() => window.__glassgardenDev!.setSpeed(0))
  state = await snapshot(page)
  expect(state.fish.find((fish) => fish.name === bonded!.name)?.partner).toBe(bonded!.partner)
})

test('a straining feeder reveals the next tier, and the upgrade relieves the tank', async ({
  page,
}) => {
  await startScenario(page, 'growing-tank', 77)
  expect((await snapshot(page)).equipment.feeder).toBe('drip')

  // A drip feeder cannot hold this many mature residents.
  await advance(page, 900)
  let state = await snapshot(page)
  expect(state.care.feederStrainSeconds).toBeGreaterThan(0)
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
  expect(state.care.feederStrainSeconds).toBe(0)
  expect(state.shop.map((offer) => offer.id)).not.toContain('dripFeeder')

  // The relieved tank feeds comfortably again.
  await advance(page, 600)
  state = await snapshot(page)
  const relieved = state.fish.map((fish) => fish.hunger).sort((a, b) => a - b)
  const median = relieved[Math.floor(relieved.length / 2)]
  expect(median).toBeLessThan(0.6)
})
