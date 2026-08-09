import { expect, test, type Page } from '@playwright/test'

import type { DevSnapshot } from '../../src/game/devtools'

async function waitForDevTools(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
}

async function snapshot(page: Page): Promise<DevSnapshot> {
  return page.evaluate(() => window.__glassgardenDev!.snapshot())
}

async function loadDirtyTank(page: Page, seed: number): Promise<DevSnapshot> {
  return page.evaluate(
    (scenarioSeed) => window.__glassgardenDev!.loadScenario('dirty-tank', scenarioSeed),
    seed,
  )
}

async function tankPoint(page: Page, state: DevSnapshot, x: number, y: number) {
  const canvas = page.getByTestId('tank-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('tank canvas has no browser bounding box')
  return {
    x: box.x + (x / state.tank.width) * box.width,
    y: box.y + (y / state.tank.height) * box.height,
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await waitForDevTools(page)
  await page.evaluate(() => window.__glassgardenDev!.setSpeed(0))
})

test('one sweep of the siphon clears every dropping along its path', async ({ page }) => {
  const dirty = await loadDirtyTank(page, 21)
  expect(dirty.waste).toHaveLength(3)
  await page.getByTestId('tool-siphon').click()

  const first = await tankPoint(page, dirty, dirty.waste[0].x, dirty.waste[0].y)
  const last = await tankPoint(page, dirty, dirty.waste[2].x, dirty.waste[2].y)
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  await page.mouse.move(last.x, last.y, { steps: 25 })
  await page.mouse.up()

  await expect.poll(async () => (await snapshot(page)).waste.length).toBe(0)
})

test('holding the siphon in place keeps drawing pollution out of the water', async ({ page }) => {
  const dirty = await loadDirtyTank(page, 22)
  const before = dirty.water.meanPollution
  expect(before).toBeGreaterThan(0)
  await page.getByTestId('tool-siphon').click()

  const point = await tankPoint(page, dirty, 600, dirty.tank.sandTop - 20)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.waitForTimeout(1000)
  await page.mouse.up()

  const after = await snapshot(page)
  expect(after.water.meanPollution).toBeLessThan(before)
})

test('the water-quality meter reflects the worst water in the tank', async ({ page }) => {
  const dirty = await loadDirtyTank(page, 23)
  expect(dirty.water.worstPollution).toBeCloseTo(0.4)

  const bar = page.getByTestId('water-quality-bar')
  await expect.poll(async () => bar.evaluate((el) => el.style.width)).toBe('40%')
})
