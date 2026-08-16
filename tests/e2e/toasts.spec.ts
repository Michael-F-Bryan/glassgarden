import { expect, test } from '@playwright/test'

import type { DevSnapshot } from '../../src/game/devtools'

test('toasts overlay the tank bottom-left and never push the shop sidebar', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
  await page.evaluate(() => {
    window.__glassgardenDev!.setSpeed(0)
    window.__glassgardenDev!.loadScenario('fresh', 72)
  })

  const toast = page.getByTestId('toast-info')
  await expect(toast).toBeVisible()
  const toastBox = (await toast.boundingBox())!
  const canvasBox = (await page.getByTestId('tank-canvas').boundingBox())!
  const shopBefore = (await page.getByTestId('shop-panel').boundingBox())!

  // Bottom-left of the game viewport, drawn over the glass.
  expect(toastBox.x).toBeGreaterThanOrEqual(canvasBox.x)
  expect(toastBox.x - canvasBox.x).toBeLessThan(canvasBox.width / 3)
  expect(toastBox.y).toBeGreaterThan(canvasBox.y + canvasBox.height / 2)
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1)

  // Overlay, not layout: dismissing it must not reflow the sidebar.
  await toast.click()
  await expect(toast).not.toBeVisible()
  const shopAfter = (await page.getByTestId('shop-panel').boundingBox())!
  expect(shopAfter).toEqual(shopBefore)
})

test('clicking a toast dismisses it and never feeds the tank', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__glassgardenDev))
  await page.evaluate(() => {
    window.__glassgardenDev!.setSpeed(0)
    window.__glassgardenDev!.loadScenario('fresh', 71)
  })

  const arrivalToast = page.getByTestId('toast-info')
  await expect(arrivalToast).toBeVisible()

  await arrivalToast.click()

  await expect(arrivalToast).not.toBeVisible()
  const state: DevSnapshot = await page.evaluate(() => window.__glassgardenDev!.snapshot())
  expect(state.food).toHaveLength(0)
})
