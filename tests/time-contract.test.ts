import { describe, expect, test } from 'vitest'

import { randomGenome } from '@/game/genome'
import { TANK, TUNING } from '@/game/model'
import { serialize } from '@/game/save'
import { GameSim } from '@/game/sim'
import { addEntity, createState, spawnFish } from '@/game/state'

/**
 * Finding 3 ("Give elapsed time one contract"): GameSim.advanceElapsed is the
 * only path into the fixed-tick simulation, so equal elapsed time reaches
 * identical state no matter how a caller partitions it. These tests invert
 * the sensitivity proven by the (now historical) time-step probe.
 */

describe('partition invariance', () => {
  function run(dt: number) {
    const sim = GameSim.fresh(4242)
    sim.dropFood(600)
    for (let elapsed = 0; elapsed < 120; elapsed += dt) {
      sim.advanceElapsed(Math.min(dt, 120 - elapsed), 'visible')
    }
    return serialize(sim.state, 0)
  }

  test('the same 120s delivered as 1/60, 0.25, 1, and 2s outer calls reaches identical state', () => {
    const partitions = [1 / 60, 0.25, 1, 2]
    const outcomes = partitions.map((dt) => JSON.stringify(run(dt)))
    expect(new Set(outcomes).size).toBe(1)
    // rngState is part of the serialized save, so this also proves identical
    // RNG consumption regardless of partitioning.
    expect(JSON.parse(outcomes[0]).rngState).toBe(JSON.parse(outcomes[1]).rngState)
  })
})

describe('input validation', () => {
  test('zero elapsed seconds is a no-op', () => {
    const sim = GameSim.fresh(1)
    const before = serialize(sim.state, 0)
    sim.advanceElapsed(0, 'visible')
    expect(serialize(sim.state, 0)).toEqual(before)
  })

  test.each([
    ['NaN', Number.NaN],
    ['negative', -1],
    ['positive infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s elapsed seconds with a RangeError', (_label, value) => {
    const sim = GameSim.fresh(1)
    expect(() => sim.advanceElapsed(value, 'visible')).toThrow(RangeError)
  })
})

describe('remainder carry', () => {
  test('sub-quantum remainders accumulate across calls instead of being dropped', () => {
    const sim = GameSim.fresh(2)
    // Deliberately not a whole multiple of the 1/30s quantum, so every call
    // leaves a remainder that must survive into the next one.
    const dt = 0.31
    const calls = 97
    for (let i = 0; i < calls; i += 1) sim.advanceElapsed(dt, 'visible')

    const totalElapsed = dt * calls
    const expectedTicks = Math.floor(totalElapsed / TUNING.simTickSeconds + 1e-9)
    expect(sim.state.time).toBeCloseTo(expectedTicks * TUNING.simTickSeconds, 6)
    // And the leftover remainder is strictly less than one quantum.
    expect(totalElapsed - sim.state.time).toBeLessThan(TUNING.simTickSeconds)
    expect(totalElapsed - sim.state.time).toBeGreaterThanOrEqual(0)
  })
})

describe('gap handling', () => {
  test.each([2, 3.5, 5])('a %ss gap is fully simulated, not truncated to a smaller window', (seconds) => {
    const sim = GameSim.fresh(3)
    const before = sim.state.time
    sim.advanceElapsed(seconds, 'visible')
    // Only whole-tick truncation (< one quantum) is allowed to be lost —
    // allow a hair of floating-point noise at the upper bound.
    expect(sim.state.time - before).toBeGreaterThan(seconds - TUNING.simTickSeconds)
    expect(sim.state.time - before).toBeLessThanOrEqual(seconds + 1e-6)
  })
})

describe('mode contracts', () => {
  test("'offline' clamps hunger and sickness at their ceilings and never kills", () => {
    const sim = GameSim.fresh(401)
    const fish = [...sim.state.world.with('fish')][0]
    fish.fish.hunger = 0.99
    fish.fish.sickness = 0.9

    sim.advanceElapsed(TUNING.offlineMaxSimSeconds, 'offline')

    const after = [...sim.state.world.with('fish')][0]
    expect(after.fish.hunger).toBeLessThanOrEqual(TUNING.offlineHungerCeiling)
    expect(after.fish.sickness).toBeLessThanOrEqual(TUNING.offlineSicknessCeiling)
    expect(sim.state.gameOver).toBe(false)
  })

  test("'background' never kills, even under sustained critical neglect", () => {
    const sim = GameSim.fresh(402)
    const fish = [...sim.state.world.with('fish')][0]
    fish.fish.hunger = 1
    fish.fish.health = 0.001

    sim.advanceElapsed(600, 'background')

    expect([...sim.state.world.with('fish')]).toHaveLength(1)
    expect(sim.state.gameOver).toBe(false)
  })

  test("'visible' retains warned death after sustained neglect", () => {
    const sim = GameSim.fresh(403)
    const fish = [...sim.state.world.with('fish')][0]
    fish.fish.hunger = 1

    sim.advanceElapsed(400, 'visible')
    const events = sim.drainEvents()

    expect(
      events.some((e) => e.type === 'toast' && e.tone === 'warning' && /starving/.test(e.message)),
    ).toBe(true)
    expect(events.some((e) => e.type === 'death')).toBe(true)
    expect([...sim.state.world.with('fish')]).toHaveLength(0)
    expect(sim.state.gameOver).toBe(true)
  })
})

describe('offline catch-up performance', () => {
  test('simulating the maximum offline catch-up window stays comfortably within budget', () => {
    const state = createState(999)
    for (let i = 0; i < 12; i += 1) {
      spawnFish(state, {
        genome: randomGenome(state.rng, 26),
        name: `Fish${i}`,
        weight: 5 + i,
        generation: 1,
        hunger: 0.3,
      })
    }
    for (let i = 0; i < 20; i += 1) {
      addEntity(state, {
        position: { x: 100 + i * 40, y: TANK.sandTop - 6 },
        velocity: { x: 0, y: 0 },
        waste: { size: 2, restingOnSand: true },
      })
    }
    const sim = new GameSim(state)

    const start = performance.now()
    sim.advanceElapsed(TUNING.offlineMaxSimSeconds, 'offline')
    const elapsedMs = performance.now() - start

    // Measured ~979ms on dev hardware at the chosen 1/30s quantum for a
    // dozen fish plus 20 debris entities (see the TUNING.simTickSeconds
    // comment, which also records the 1/60s comparison). Budgeted
    // generously here so this documents the cost without being flaky
    // across machines/CI rather than pinning the exact number.
    expect(elapsedMs).toBeLessThan(2000)
  })
})
