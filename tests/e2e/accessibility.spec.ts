import { expect, test, type Page } from '@playwright/test'

import { snapshot, startScenario } from './support'


/**
 * The game has to be playable and safely navigable without a pointer. These
 * tests drive the real keyboard: no synthetic events, no ARIA inspection
 * standing in for behaviour.
 */

/** What the browser currently considers focused, for focus assertions. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return 'none'
    return el.dataset.testid ?? el.getAttribute('aria-label') ?? el.tagName.toLowerCase()
  })
}

test('a keyboard player can feed the tank without a pointer', async ({ page }) => {
  await startScenario(page, 'fresh', 501)
  const canvas = page.getByTestId('tank-canvas')

  await canvas.focus()
  expect(await focused(page)).toBe('tank-canvas')

  // The caret appears on focus and reports where it is aiming.
  await expect(page.locator('#tank-caret-status')).toContainText('Target')

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')

  await expect.poll(async () => (await snapshot(page)).food.length).toBe(1)
})

test('a keyboard player can clean the sand with the siphon', async ({ page }) => {
  await startScenario(page, 'dirty-tank', 502)
  const before = (await snapshot(page)).waste.length
  expect(before).toBeGreaterThan(0)

  // Tool shortcuts work from anywhere outside an overlay.
  await page.keyboard.press('2')
  await expect(page.getByTestId('tool-siphon')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('tank-canvas').focus()
  // Walk the caret down onto the sand, then clean along it.
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowDown')
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
  }

  await expect.poll(async () => (await snapshot(page)).waste.length).toBeLessThan(before)
  expect((await snapshot(page)).care.siphonUses).toBeGreaterThan(0)
})

test('a keyboard player can move between residents and inspect one', async ({ page }) => {
  await startScenario(page, 'fresh', 503)
  await page.getByTestId('tank-canvas').focus()

  await page.keyboard.press('Tab') // jump the caret to the first resident
  await expect(page.locator('#tank-caret-status')).toContainText('Target over')

  await page.keyboard.press('i')
  await expect(page.getByTestId('fish-inspector')).toBeVisible()

  // Escape closes the inspector and hands focus back to the tank.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('fish-inspector')).not.toBeVisible()
  expect(await focused(page)).toBe('tank-canvas')
})

test('overlays take focus, scope Escape, and give focus back', async ({ page }) => {
  await startScenario(page, 'fresh', 504)

  // Opening the menu moves focus into the dialog.
  await page.getByTestId('menu-toggle').focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('dialog', { name: 'Paused' })
  await expect(menu).toBeVisible()
  expect(await focused(page)).toBe('menu-resume')

  // Escape inside the confirmation closes only the confirmation.
  await page.getByTestId('menu-new-game').click()
  await expect(page.getByTestId('menu-confirm-new-game')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('menu-confirm-new-game')).not.toBeVisible()
  await expect(menu).toBeVisible()

  // A second Escape closes the menu and restores the opener's focus.
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  expect(await focused(page)).toBe('menu-toggle')
})

test('a modal overlay keeps the tank and shop out of the tab order', async ({ page }) => {
  await startScenario(page, 'fresh', 505)
  await page.getByTestId('menu-toggle').click()
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()

  expect(await page.getByTestId('tank-canvas').evaluate((el) => el.hasAttribute('inert'))).toBe(true)
  expect(await page.getByTestId('shop-panel').evaluate((el) => el.hasAttribute('inert'))).toBe(true)

  await page.getByTestId('menu-resume').click()
  expect(await page.getByTestId('tank-canvas').evaluate((el) => el.hasAttribute('inert'))).toBe(false)
})

test('the journal and help panels are labelled dialogs reachable by keyboard', async ({ page }) => {
  await startScenario(page, 'fresh', 506)

  await page.getByTestId('journal-toggle').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Tank Journal' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tank-journal')).not.toBeVisible()
  expect(await focused(page)).toBe('journal-toggle')

  await page.getByTestId('help-toggle').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('help-panel')).not.toBeVisible()
})

test('icon-only controls carry accessible names', async ({ page }) => {
  await startScenario(page, 'fresh', 507)

  await expect(page.getByRole('button', { name: 'Tank Journal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'How to play' })).toBeVisible()
  // The tank itself explains its own keyboard controls.
  await expect(page.getByTestId('tank-canvas')).toHaveAttribute('aria-label', /Arrow keys aim/)
})

test('the away summary is announced as a labelled dialog and dismissed by Escape', async ({
  page,
}) => {
  await startScenario(page, 'fresh', 508)
  await page.evaluate(() => window.__glassgardenDev!.simulateAway(3 * 60 * 60))

  const away = page.getByRole('dialog', { name: 'While you were away…' })
  await expect(away).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(away).not.toBeVisible()
})
