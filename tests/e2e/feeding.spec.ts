import { expect, test } from '@playwright/test'

import { loadScenario, openGame, snapshot, tankPoint } from './support'

test.beforeEach(async ({ page }) => {
  await openGame(page)
})

test('a quick click on open water drops exactly one pellet', async ({ page }) => {
  const state = await loadScenario(page, 'fresh', 11)
  const point = await tankPoint(page, 200, state.tank.waterTop + 40)

  await page.mouse.click(point.x, point.y)

  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1)
})

test('holding the pointer sprinkles a stream of pellets', async ({ page }) => {
  const state = await loadScenario(page, 'fresh', 12)
  const point = await tankPoint(page, 200, state.tank.waterTop + 40)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.waitForTimeout(1200)
  await page.mouse.up()

  const fed = await snapshot(page)
  expect(fed.food.length).toBeGreaterThanOrEqual(3)
  expect(fed.coins).toBe(30 - fed.food.length)

  // Releasing stops the stream.
  await page.waitForTimeout(600)
  expect((await snapshot(page)).food.length).toBe(fed.food.length)
})

test('tapping a fish inspects it without feeding it in the face', async ({ page }) => {
  const state = await loadScenario(page, 'fresh', 13)
  const fish = state.fish[0]
  const point = await tankPoint(page, fish.x, fish.y)

  await page.mouse.click(point.x, point.y)

  await expect(page.getByTestId('fish-inspector')).toBeVisible()
  expect((await snapshot(page)).food).toHaveLength(0)
})

test('holding over a fish sprinkles instead of opening the inspector', async ({ page }) => {
  const state = await loadScenario(page, 'fresh', 14)
  const fish = state.fish[0]
  const point = await tankPoint(page, fish.x, fish.y)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.waitForTimeout(900)
  await page.mouse.up()

  expect((await snapshot(page)).food.length).toBeGreaterThanOrEqual(1)
  await expect(page.getByTestId('fish-inspector')).not.toBeVisible()
})

test('the first-feed hint shows on a fresh tank and retires after the first pellet', async ({
  page,
}) => {
  const state = await loadScenario(page, 'fresh', 15)
  await expect(page.getByTestId('first-feed-hint')).toBeVisible()

  const point = await tankPoint(page, 300, state.tank.waterTop + 40)
  await page.mouse.click(point.x, point.y)

  await expect(page.getByTestId('first-feed-hint')).not.toBeVisible()
})
