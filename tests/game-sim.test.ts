import { describe, expect, test } from 'vitest'

import { generateName, randomGenome } from '@/game/genome'
import { TUNING, type GameEvent } from '@/game/model'
import { deserialize, parseSave, serialize } from '@/game/save'
import { GameSim } from '@/game/sim'
import { addEntity, createState, spawnFish, takenNames } from '@/game/state'
import { maxPollution, pollutionAt } from '@/game/water'

function runFor(sim: GameSim, seconds: number, visible = true): GameEvent[] {
  const events: GameEvent[] = []
  for (let t = 0; t < seconds; t += TUNING.tick) {
    sim.step(TUNING.tick, visible)
    events.push(...sim.drainEvents())
  }
  return events
}

function onlyFish(sim: GameSim) {
  const fish = [...sim.state.world.with('fish')]
  expect(fish.length).toBeGreaterThan(0)
  return fish[0]
}

function pairedState(seed: number, options?: { hunger?: number }) {
  const state = createState(seed)
  for (const name of ['Ada', 'Bez'] as const) {
    spawnFish(state, {
      genome: randomGenome(state.rng, 26),
      name,
      weight: 20,
      generation: 1,
      hunger: options?.hunger ?? 0.1,
    })
  }
  return state
}

describe('fresh game', () => {
  test('starts with a bare tank, one hungry starter fish, and starting coins', () => {
    const sim = GameSim.fresh(42)
    const fish = [...sim.state.world.with('fish')]
    expect(fish).toHaveLength(1)
    expect(fish[0].fish.hunger).toBeGreaterThan(0.5)
    expect(fish[0].fish.weight).toBe(TUNING.starterWeight)
    expect(sim.state.coins).toBe(TUNING.startingCoins)
    expect([...sim.state.world.with('waste')]).toHaveLength(0)
    expect(maxPollution(sim.state.water)).toBe(0)
  })
})

describe('feeding and growth', () => {
  test('a hungry fish swims to a dropped pellet, eats it, and grows', () => {
    const sim = GameSim.fresh(7)
    const before = onlyFish(sim).fish.weight
    expect(sim.dropFood(onlyFish(sim).position.x)).toBe(true)
    runFor(sim, 40)
    expect([...sim.state.world.with('food')]).toHaveLength(0)
    expect(onlyFish(sim).fish.weight).toBeGreaterThan(before)
  })

  test('feeding costs coins and is refused when unaffordable', () => {
    const sim = GameSim.fresh(7)
    const coins = sim.state.coins
    expect(sim.dropFood(500)).toBe(true)
    expect(sim.state.coins).toBeCloseTo(coins - TUNING.pelletCost)
    sim.state.coins = 0.2
    expect(sim.dropFood(500)).toBe(false)
  })

  test('repeated feeding grows the fish substantially and announces the growth development', () => {
    const sim = GameSim.fresh(11)
    const events: GameEvent[] = []
    for (let round = 0; round < 40; round += 1) {
      sim.dropFood(onlyFish(sim).position.x)
      events.push(...runFor(sim, 8))
    }
    expect(onlyFish(sim).fish.weight).toBeGreaterThan(5)
    expect(sim.state.unlocks.noticedGrowth).toBe(true)
    expect(
      events.some((e) => e.type === 'toast' && e.tone === 'development' && /bigger/.test(e.message)),
    ).toBe(true)
  })

  test('digestion turns meals into waste droppings', () => {
    const sim = GameSim.fresh(13)
    for (let round = 0; round < 6; round += 1) {
      sim.dropFood(onlyFish(sim).position.x)
      runFor(sim, 10)
    }
    expect([...sim.state.world.with('waste')].length).toBeGreaterThan(0)
  })
})

describe('pollution and sickness', () => {
  test('waste on the sand pollutes the water and puts the siphon in the shop', () => {
    const sim = GameSim.fresh(5)
    for (let i = 0; i < 4; i += 1) {
      addEntity(sim.state, {
        position: { x: 500 + i * 20, y: 609 },
        velocity: { x: 0, y: 0 },
        waste: { size: 3, restingOnSand: true },
      })
    }
    const events = runFor(sim, 240)
    expect(maxPollution(sim.state.water)).toBeGreaterThan(0.1)
    expect(sim.state.unlocks.siphonInShop).toBe(true)
    expect(
      events.some((e) => e.type === 'toast' && e.tone === 'development' && /green/.test(e.message)),
    ).toBe(true)
  })

  test('fish sicken in polluted water and recover in clean water', () => {
    const sim = GameSim.fresh(9)
    for (let t = 0; t < 60; t += TUNING.tick) {
      sim.state.water.cells.fill(0.8)
      sim.step(TUNING.tick, true)
    }
    const sickness = onlyFish(sim).fish.sickness
    expect(sickness).toBeGreaterThan(0.05)
    sim.state.water.cells.fill(0)
    runFor(sim, 120)
    expect(onlyFish(sim).fish.sickness).toBeLessThan(sickness)
  })

  test('the siphon removes debris and clears local pollution, but only once owned', () => {
    const sim = GameSim.fresh(3)
    expect(sim.siphonAt(600, 600)).toBeUndefined()
    sim.state.unlocks.siphonInShop = true
    sim.state.coins = 100
    expect(sim.buy('siphon')).toBe(true)
    expect(sim.state.ownsSiphon).toBe(true)
    addEntity(sim.state, {
      position: { x: 600, y: 609 },
      velocity: { x: 0, y: 0 },
      waste: { size: 3, restingOnSand: true },
    })
    sim.state.water.cells.fill(0.4)
    const pollutionBefore = pollutionAt(sim.state.water, { x: 600, y: 609 })
    expect(sim.siphonAt(600, 609)).toBe(1)
    expect([...sim.state.world.with('waste')]).toHaveLength(0)
    expect(pollutionAt(sim.state.water, { x: 600, y: 609 })).toBeLessThan(pollutionBefore)
  })
})

describe('economy and population', () => {
  test('coins accrue faster with more fish mass', () => {
    const light = GameSim.fresh(21)
    const heavy = GameSim.fresh(21)
    onlyFish(heavy).fish.weight = 20
    const lightStart = light.state.coins
    const heavyStart = heavy.state.coins
    runFor(light, 60)
    runFor(heavy, 60)
    expect(heavy.state.coins - heavyStart).toBeGreaterThan(light.state.coins - lightStart)
  })

  test('starter growth unlocks fish purchases at an escalating price', () => {
    const sim = GameSim.fresh(31)
    onlyFish(sim).fish.weight = TUNING.fishUnlockWeight + 0.1
    const events = runFor(sim, 1)
    expect(sim.state.unlocks.fishInShop).toBe(true)
    expect(events.some((e) => e.type === 'toast' && e.tone === 'development')).toBe(true)

    sim.state.coins = 500
    expect(sim.shopItems().find((i) => i.id === 'fish')?.cost).toBe(TUNING.fishPrices[0])
    expect(sim.buy('fish')).toBe(true)
    expect([...sim.state.world.with('fish')]).toHaveLength(2)
    expect(sim.shopItems().find((i) => i.id === 'fish')?.cost).toBe(TUNING.fishPrices[1])
  })
})

describe('breeding', () => {
  test('two thriving fish in clean water court, lay an egg, and hatch a blended baby', () => {
    const sim = new GameSim(pairedState(101))
    const events = runFor(sim, 100)
    const fish = [...sim.state.world.with('fish')]
    expect(fish).toHaveLength(3)
    const baby = fish.find((f) => f.fish.generation === 2)!
    expect(baby).toBeDefined()
    expect(baby.fish.parents).toEqual(expect.arrayContaining(['Ada', 'Bez']))
    expect(baby.fish.name).not.toBe('Ada')
    expect(baby.fish.name).not.toBe('Bez')
    expect(baby.fish.genome.maxWeight).toBeGreaterThan(20)
    expect(baby.fish.genome.maxWeight).toBeLessThan(32)
    expect(baby.fish.genome.hue).toBeGreaterThanOrEqual(0)
    expect(baby.fish.genome.hue).toBeLessThan(360)
    expect(events.some((e) => e.type === 'birth')).toBe(true)
    expect(
      events.some((e) => e.type === 'toast' && e.tone === 'development' && /egg/.test(e.message)),
    ).toBe(true)
  })

  test('fish do not breed in polluted water', () => {
    const state = pairedState(103)
    state.water.cells.fill(0.5)
    const sim = new GameSim(state)
    runFor(sim, 30)
    expect([...sim.state.world.with('egg')]).toHaveLength(0)
  })

  test('an egg incubated in murky water hatches a stunted, flagged fry', () => {
    const sim = new GameSim(pairedState(107))
    runFor(sim, 25)
    expect([...sim.state.world.with('egg')]).toHaveLength(1)
    for (let t = 0; t < 80; t += TUNING.tick) {
      sim.state.water.cells.fill(0.6)
      sim.step(TUNING.tick, true)
    }
    const baby = [...sim.state.world.with('fish')].find((f) => f.fish.generation === 2)!
    expect(baby).toBeDefined()
    expect(baby.fish.hatchedInMurkyWater).toBe(true)
    expect(baby.fish.genome.maxWeight).toBeLessThan(23)
  })
})

describe('neglect, death, and game over', () => {
  test('a starving fish is warned, then dies only after sustained visible neglect', () => {
    const sim = GameSim.fresh(201)
    onlyFish(sim).fish.hunger = 1
    const events = runFor(sim, 400)
    expect(events.some((e) => e.type === 'toast' && e.tone === 'warning' && /starving/.test(e.message))).toBe(true)
    expect(events.some((e) => e.type === 'death')).toBe(true)
    expect(events.some((e) => e.type === 'gameOver')).toBe(true)
    expect(sim.state.gameOver).toBe(true)
    expect([...sim.state.world.with('fish')]).toHaveLength(0)
  })

  test('death takes at least the warning grace period even for a frail fish', () => {
    const sim = GameSim.fresh(207)
    const fish = onlyFish(sim)
    fish.fish.hunger = 1
    fish.fish.health = 0.01
    runFor(sim, TUNING.warningGraceSeconds - 5)
    expect([...sim.state.world.with('fish')]).toHaveLength(1)
    runFor(sim, 30)
    expect([...sim.state.world.with('fish')]).toHaveLength(0)
  })

  test('no fish dies while the page is hidden', () => {
    const sim = GameSim.fresh(202)
    onlyFish(sim).fish.hunger = 1
    runFor(sim, 600, false)
    expect([...sim.state.world.with('fish')]).toHaveLength(1)
    expect(sim.state.gameOver).toBe(false)
  })

  test('game over keeps coins and equipment, and a new starter fish resumes play', () => {
    const sim = GameSim.fresh(203)
    sim.state.ownsSiphon = true
    sim.state.coins = 40
    onlyFish(sim).fish.hunger = 1
    onlyFish(sim).fish.health = 0.05
    runFor(sim, 300)
    expect(sim.state.gameOver).toBe(true)
    expect(sim.state.ownsSiphon).toBe(true)
    const coinsAfterDeath = sim.state.coins
    expect(coinsAfterDeath).toBeGreaterThan(0)

    const starter = sim.shopItems().find((i) => i.id === 'starterFish')
    expect(starter).toBeDefined()
    expect(sim.buy('starterFish')).toBe(true)
    expect(sim.state.gameOver).toBe(false)
    expect([...sim.state.world.with('fish')]).toHaveLength(1)
  })

  test('an empty tank still trickles income so recovery is always reachable', () => {
    const state = createState(301)
    state.gameOver = true
    state.coins = 0
    const sim = new GameSim(state)
    runFor(sim, 60)
    expect(sim.state.coins).toBeCloseTo(TUNING.incomeFloor * 60, 1)
  })
})

describe('away time', () => {
  test('offline catch-up is slowed, capped, clamps deterioration, and never kills', () => {
    const sim = GameSim.fresh(401)
    onlyFish(sim).fish.hunger = 0.99
    const summary = sim.advanceOffline(24 * 3600)
    expect(summary.simulatedSeconds).toBe(TUNING.offlineMaxSimSeconds)
    expect(summary.coinsEarned).toBeGreaterThan(0)
    expect([...sim.state.world.with('fish')]).toHaveLength(1)
    expect(onlyFish(sim).fish.hunger).toBeLessThanOrEqual(TUNING.offlineHungerCeiling)
    expect(sim.state.gameOver).toBe(false)
  })

  test('a prepared pair can breed while the player is away, reported in the summary', () => {
    const sim = new GameSim(pairedState(403))
    const summary = sim.advanceOffline((150 / TUNING.offlineRate) * 1)
    expect(summary.births.length).toBeGreaterThan(0)
    expect([...sim.state.world.with('fish')]).toHaveLength(3)
  })
})

describe('persistence', () => {
  test('serialize/deserialize round-trips the whole game and stays deterministic', () => {
    const sim = GameSim.fresh(501)
    sim.dropFood(600)
    runFor(sim, 60)
    const saved = serialize(sim.state, 1_000)
    const resumed = new GameSim(deserialize(saved))
    expect(serialize(resumed.state, 1_000)).toEqual(saved)

    runFor(sim, 30)
    runFor(resumed, 30)
    expect(serialize(resumed.state, 2_000)).toEqual(serialize(sim.state, 2_000))
  })

  test('undelivered toasts survive a save/load cycle', () => {
    const sim = GameSim.fresh(507)
    const pending = sim.state.events.length
    expect(pending).toBeGreaterThan(0)
    const resumed = new GameSim(deserialize(serialize(sim.state, 1_000)))
    expect(resumed.drainEvents()).toHaveLength(pending)
  })

  test('parseSave rejects malformed and foreign saves', () => {
    expect(parseSave('not json')).toBeUndefined()
    expect(parseSave('{"version":2}')).toBeUndefined()
    const sim = GameSim.fresh(503)
    const roundTripped = parseSave(JSON.stringify(serialize(sim.state, 5)))
    expect(roundTripped?.version).toBe(1)
  })
})

describe('names', () => {
  test('generated names avoid collisions with living fish', () => {
    const state = createState(601)
    spawnFish(state, { genome: randomGenome(state.rng, 20), name: 'Nori', weight: 5, generation: 1 })
    const taken = takenNames(state)
    for (let i = 0; i < 50; i += 1) {
      expect(generateName(state.rng, taken)).not.toBe('Nori')
    }
  })
})
