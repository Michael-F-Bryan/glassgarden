import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import GameRoot, { buildHudSnapshot } from '@/components/game/GameRoot'
import { GameSim } from '@/game/sim'

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

  test('tools and toast stack are anchored inside the tank', () => {
    const html = renderGame()

    expect(html).toContain('data-testid="tool-palette"')
    expect(html).toContain('data-ui-anchor="top-left"')
    expect(html).toContain('data-testid="toast-stack"')
    expect(html).toContain('data-ui-anchor="bottom-left"')
  })

  test('fish roster is permanently present at the bottom of the shop', () => {
    const html = renderGame()

    expect(html).toContain('data-testid="fish-roster"')
    expect(html).toContain('data-ui-section="shop-footer"')
    expect(html).toContain('Residents')
  })

  test('fish roster summarises weight and mood with an emoji', () => {
    const sim = GameSim.fresh(123)
    const fish = [...sim.state.world.with('fish')][0].fish
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
    const sim = GameSim.fresh(123)
    sim.state.water.cells.fill(0.5)

    const resident = buildHudSnapshot(sim, undefined, 'clear').residents[0]

    expect(resident.mood).toBe('uneasy in the murk')
    expect(resident.moodEmoji).toBe('😖')
  })

  test('hud exposes worst pollution for the water-quality meter', () => {
    const sim = GameSim.fresh(123)
    expect(buildHudSnapshot(sim, undefined, 'clear').worstPollution).toBe(0)

    sim.state.water.cells.fill(0.4)

    expect(buildHudSnapshot(sim, undefined, 'clear').worstPollution).toBeCloseTo(0.4)
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
