import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import GameRoot from '@/components/game/GameRoot'
import { buildHudSnapshot } from '@/game/hud'
import { GameSim } from '@/game/sim'
import { createFreshGame } from '@/game/state'

function renderGame(): string {
  return renderToStaticMarkup(createElement(GameRoot))
}

describe('game UI layout', () => {
  test('shop is always present in the right sidebar', () => {
    const html = renderGame()

    expect(html).toContain('data-layout="tank-with-shop-sidebar"')
    expect(html).toContain('data-testid="shop-panel"')
    expect(html).toContain('data-ui-anchor="right-sidebar"')
    expect(html).not.toContain('data-testid="shop-toggle"')
  })

  test('tools stay on the tank; toasts live in the sidebar, off the play surface', () => {
    const html = renderGame()

    expect(html).toContain('data-testid="tool-palette"')
    expect(html).toContain('data-ui-anchor="top-left"')
    expect(html).toContain('data-testid="toast-stack"')
    expect(html).toContain('data-ui-anchor="sidebar"')
    expect(html).not.toContain('data-ui-anchor="bottom-left"')
  })

  test('main menu button is in the chrome and the menu itself starts closed', () => {
    const html = renderGame()

    expect(html).toContain('data-testid="menu-toggle"')
    expect(html).not.toContain('data-testid="main-menu"')
  })

  test('fish roster is permanently present at the bottom of the shop', () => {
    const html = renderGame()

    expect(html).toContain('data-testid="fish-roster"')
    expect(html).toContain('data-ui-section="shop-footer"')
    expect(html).toContain('Residents')
  })

  test('fish roster summarises weight and mood with an emoji', () => {
    const sim = GameSim.fresh(123)
    const fish = [...sim.read.world.with('fish')][0].fish
    fish.hunger = 0.9

    const resident = buildHudSnapshot(sim, undefined, 'clear').residents[0]

    expect(resident).toMatchObject({
      name: fish.name,
      weightGrams: fish.weight,
      mood: 'very hungry',
      moodEmoji: '😟',
    })
  })

  test('a healthy fish in polluted water reads as uneasy, not content', () => {
    const state = createFreshGame(123)
    const sim = new GameSim(state)
    state.water.cells.fill(0.5)

    const resident = buildHudSnapshot(sim, undefined, 'clear').residents[0]

    expect(resident.mood).toBe('uneasy in the murk')
    expect(resident.moodEmoji).toBe('😖')
  })

  test('hud exposes worst pollution for the water-quality meter', () => {
    const state = createFreshGame(123)
    const sim = new GameSim(state)
    expect(buildHudSnapshot(sim, undefined, 'clear').worstPollution).toBe(0)

    state.water.cells.fill(0.4)

    expect(buildHudSnapshot(sim, undefined, 'clear').worstPollution).toBeCloseTo(0.4)
  })

  test('journal entries reach the HUD newest-first with readable ages', () => {
    const state = createFreshGame(123)
    const sim = new GameSim(state)
    state.coins = 100
    state.unlocks.siphonInShop = true
    sim.buy('siphon')

    const journal = buildHudSnapshot(sim, undefined, 'clear').journal

    expect(journal[0].message).toContain('gravel siphon')
    expect(journal.at(-1)!.kind).toBe('arrival')
    expect(journal[0].age).toBe('moments ago')
  })

  test('first-feed hint follows the sim and never flashes on the placeholder HUD', () => {
    const sim = GameSim.fresh(123)
    expect(buildHudSnapshot(sim, undefined, 'clear').fedOnce).toBe(false)

    sim.dropFood(600)

    expect(buildHudSnapshot(sim, undefined, 'clear').fedOnce).toBe(true)
    // Before the sim mounts, GameRoot renders EMPTY_HUD — the hint must stay hidden.
    expect(renderGame()).not.toContain('first-feed-hint')
  })
})
