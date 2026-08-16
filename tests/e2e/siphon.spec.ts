import { expect, test } from '@playwright/test'

import { dismissToasts, loadScenario, openGame, snapshot, tankPoint } from './support'

test.beforeEach(async ({ page }) => {
  await openGame(page)
})

test('one sweep of the siphon clears every dropping along its path', async ({ page }) => {
  const dirty = await loadScenario(page, 'dirty-tank', 21)
  expect(dirty.waste).toHaveLength(3)
  await dismissToasts(page) // the arrival notice overlays the leftmost dropping
  await page.getByTestId('tool-siphon').click()

  const first = await tankPoint(page, dirty.waste[0].x, dirty.waste[0].y)
  const last = await tankPoint(page, dirty.waste[2].x, dirty.waste[2].y)
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  await page.mouse.move(last.x, last.y, { steps: 25 })
  await page.mouse.up()

  await expect.poll(async () => (await snapshot(page)).waste.length).toBe(0)
})

test('holding the siphon in place keeps drawing pollution out of the water', async ({ page }) => {
  const dirty = await loadScenario(page, 'dirty-tank', 22)
  const before = dirty.water.meanPollution
  expect(before).toBeGreaterThan(0)
  await page.getByTestId('tool-siphon').click()

  const point = await tankPoint(page, 600, dirty.tank.sandTop - 20)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.waitForTimeout(1000)
  await page.mouse.up()

  const after = await snapshot(page)
  expect(after.water.meanPollution).toBeLessThan(before)
})

test('the water-quality meter reflects the worst water in the tank', async ({ page }) => {
  const dirty = await loadScenario(page, 'dirty-tank', 23)
  expect(dirty.water.worstPollution).toBeCloseTo(0.4)

  const bar = page.getByTestId('water-quality-bar')
  await expect.poll(async () => bar.evaluate((el) => el.style.width)).toBe('40%')
})
