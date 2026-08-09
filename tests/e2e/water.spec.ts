import { expect, test, type Page } from '@playwright/test'

import { loadScenario, openGame } from './support'

/** Mean colour of a patch of mid-water pixels, straight off the canvas. */
async function midWaterColour(page: Page): Promise<{ r: number; g: number; b: number }> {
  // Let a couple of frames render the new scenario first.
  await page.waitForTimeout(200)
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="tank-canvas"]')!
    const ctx = canvas.getContext('2d')!
    const patch = ctx.getImageData(
      Math.round(canvas.width * 0.5) - 10,
      Math.round(canvas.height * 0.45) - 10,
      20,
      20,
    ).data
    let r = 0
    let g = 0
    let b = 0
    const pixels = patch.length / 4
    for (let i = 0; i < patch.length; i += 4) {
      r += patch[i]
      g += patch[i + 1]
      b += patch[i + 2]
    }
    return { r: r / pixels, g: g / pixels, b: b / pixels }
  })
}

test('polluted water is visibly murkier than clear water, on the glass itself', async ({
  page,
}) => {
  await openGame(page)

  await loadScenario(page, 'fresh', 31)
  const clear = await midWaterColour(page)

  await loadScenario(page, 'dirty-tank', 31)
  const dirty = await midWaterColour(page)

  // Greener and darker: the green channel gains against blue, and the water
  // as a whole loses light. Margins are generous so shaft drift can't flake.
  const clearGreenness = clear.g - clear.b
  const dirtyGreenness = dirty.g - dirty.b
  expect(dirtyGreenness).toBeGreaterThan(clearGreenness + 10)
  expect(dirty.b).toBeLessThan(clear.b - 10)
})
