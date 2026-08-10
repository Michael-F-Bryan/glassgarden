import { describe, expect, test } from 'vitest'

import {
  createDevScenario,
  createDevSnapshot,
  createGlassgardenDevTools,
  normaliseDevSpeed,
} from '@/game/devtools'
import { TUNING } from '@/game/model'
import { GameSim } from '@/game/sim'

describe('development snapshots', () => {
  test('exposes stable plain data without leaking the mutable ECS', () => {
    const snapshot = createDevSnapshot(GameSim.fresh(42))

    expect(snapshot.version).toBe(1)
    expect(snapshot.tank).toEqual({ width: 1200, height: 675, waterTop: 48, sandTop: 615 })
    expect(snapshot.fish).toHaveLength(1)
    expect(snapshot.fish[0]).toMatchObject({ id: 1, generation: 1, hunger: TUNING.starterHunger })
    expect(snapshot).not.toHaveProperty('state')
    expect(snapshot).not.toHaveProperty('world')
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)
  })
})

describe('development scenarios', () => {
  test('are deterministic and stop at useful debugging boundaries', () => {
    const firstFresh = createDevSnapshot(createDevScenario('fresh', 91))
    const secondFresh = createDevSnapshot(createDevScenario('fresh', 91))
    expect(firstFresh).toEqual(secondFresh)

    const dirty = createDevSnapshot(createDevScenario('dirty-tank', 91))
    expect(dirty.equipment.siphon).toBe(true)
    expect(dirty.waste.length).toBeGreaterThanOrEqual(3)
    expect(dirty.water.worstPollution).toBeGreaterThan(0.3)

    const growing = createDevSnapshot(createDevScenario('growing-tank', 91))
    expect(growing.fish.length).toBeGreaterThanOrEqual(6)
    expect(growing.equipment).toMatchObject({ siphon: true, feeder: 'drip' })
    expect(growing.developments).toContain('dripFeederOffered')

    const thriving = createDevSnapshot(createDevScenario('thriving-full-tank', 91))
    expect(thriving.fish).toHaveLength(12)
    expect(thriving.equipment).toMatchObject({ siphon: true, feeder: 'rotary', filter: 'sponge' })
    expect(thriving.developments).toContain('spongeFilterOffered')
    expect(thriving.water.worstPollution).toBe(0)
    expect(Math.max(...thriving.fish.map((fish) => fish.hunger))).toBeLessThan(0.5)

    const starving = createDevSnapshot(createDevScenario('starving-rescuable', 91))
    expect(starving.fish).toHaveLength(1)
    expect(starving.fish[0]).toMatchObject({ hunger: 1, health: 0.4 })
    expect(starving.gameOver).toBe(false)
  })
})

describe('development controls', () => {
  test('normalises pause and accelerated speeds into the supported range', () => {
    expect(normaliseDevSpeed(0)).toBe(0)
    expect(normaliseDevSpeed(8)).toBe(8)
    expect(normaliseDevSpeed(99)).toBe(16)
    expect(normaliseDevSpeed(-1)).toBe(1)
    expect(normaliseDevSpeed(Number.NaN)).toBe(1)
  })

  test('keeps the away-time rescue path usable when advancing deterministically', () => {
    let sim = createDevScenario('starving-rescuable', 17)
    const tools = createGlassgardenDevTools({
      getSim: () => sim,
      replaceSim: (next) => {
        sim = next
      },
      getSpeed: () => 0,
      setSpeed: () => undefined,
      advanceElapsed: (seconds) => void sim.advanceElapsed(seconds, 'visible'),
      simulateAway: (seconds) => sim.advanceOffline(seconds),
      save: () => undefined,
    })

    tools.simulateAway(3 * 60 * 60)
    const before = tools.snapshot().fish[0]
    expect(sim.dropFood(before.x + 50).ok).toBe(true)

    const after = tools.advance(12)
    expect(after.fish).toHaveLength(1)
    expect(after.fish[0].hunger).toBeLessThan(before.hunger)
  })

  test('resets, advances, and simulates away time through one stable interface', () => {
    let sim = GameSim.fresh(1)
    let speed = 1
    let saves = 0
    const tools = createGlassgardenDevTools({
      getSim: () => sim,
      replaceSim: (next) => {
        sim = next
      },
      getSpeed: () => speed,
      setSpeed: (next) => {
        speed = next
      },
      advanceElapsed: (seconds) => void sim.advanceElapsed(seconds, 'visible'),
      simulateAway: (seconds) => sim.advanceOffline(seconds),
      save: () => {
        saves += 1
      },
    })

    expect(tools.version).toBe(1)
    expect(tools.setSpeed(0)).toBe(0)
    expect(tools.loadScenario('starving-rescuable', 7).fish[0].hunger).toBe(1)

    const before = tools.snapshot().time
    expect(tools.advance(2).time).toBeGreaterThan(before)

    const summary = tools.simulateAway(3 * 60 * 60)
    expect(summary.simulatedSeconds).toBe(20 * 60)
    expect(tools.snapshot().fish).toHaveLength(1)
    expect(saves).toBeGreaterThanOrEqual(2)

    expect(tools.reset(7)).toEqual(createDevSnapshot(createDevScenario('fresh', 7), 0))
  })
})
