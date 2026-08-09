import { expect, test } from '@playwright/test'

import type { DevSnapshot } from '../../src/game/devtools'

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
