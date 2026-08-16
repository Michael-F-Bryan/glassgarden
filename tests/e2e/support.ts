import type { Page } from '@playwright/test'

import type { DevScenario, DevSnapshot } from '../../src/game/devtools'

/**
 * Shared plumbing for the browser suite. Only helpers several live specs
 * genuinely use live here — anything one spec needs stays in that spec.
 */

export async function waitForDevTools(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
}

export async function snapshot(page: Page): Promise<DevSnapshot> {
  return page.evaluate(() => window.__glassgardenDev!.snapshot())
}

export async function loadScenario(
  page: Page,
  name: DevScenario,
  seed = 42,
): Promise<DevSnapshot> {
  return page.evaluate(
    ({ scenario, scenarioSeed }) => window.__glassgardenDev!.loadScenario(scenario, scenarioSeed),
    { scenario: name, scenarioSeed: seed },
  )
}

/** Advance simulated time without waiting for it in real time. */
export async function advance(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => window.__glassgardenDev!.advance(s), seconds)
}

/** Open the game with the clock stopped, so tests drive time themselves. */
export async function openGame(page: Page): Promise<void> {
  await page.goto('/')
  await waitForDevTools(page)
  await page.evaluate(() => window.__glassgardenDev!.setSpeed(0))
}

/** Open the game and load a deterministic scenario into it. */
export async function startScenario(
  page: Page,
  name: DevScenario,
  seed = 42,
): Promise<DevSnapshot> {
  await openGame(page)
  return loadScenario(page, name, seed)
}

/**
 * Convert logical tank coordinates to page coordinates. Reads the canvas box
 * fresh every call, so a box captured earlier in a test cannot go stale
 * across layout changes (window resizes, panels opening).
 */
export async function tankPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('tank-canvas').boundingBox()
  if (!box) throw new Error('tank canvas has no browser bounding box')
  const tank = (await snapshot(page)).tank
  return {
    x: box.x + (x / tank.width) * box.width,
    y: box.y + (y / tank.height) * box.height,
  }
}
