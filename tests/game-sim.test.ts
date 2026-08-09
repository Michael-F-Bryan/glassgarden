import { describe, expect, test } from 'vitest'

import { generateName, randomGenome } from '@/game/genome'
import { TUNING, type GameEvent } from '@/game/model'
import { deserialize, parseSave, serialize } from '@/game/save'
import { GameSim } from '@/game/sim'
import {
  addEntity,
  createFreshGame,
  createState,
  recordJournal,
  spawnFish,
  takenNames,
} from '@/game/state'
import { maxPollution, pollutionAt } from '@/game/water'

const TEST_STEP = 0.25

function runFor(sim: GameSim, seconds: number, visible = true): GameEvent[] {
  const events: GameEvent[] = []
  for (let t = 0; t < seconds; t += TEST_STEP) {
    sim.step(TEST_STEP, visible)
    events.push(...sim.drainEvents())
  }
  return events
}

function onlyFish(sim: GameSim) {
  const fish = [...sim.read.world.with('fish')]
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
  test('starts with a bare tank, one gently peckish starter fish, and starting coins', () => {
    const sim = GameSim.fresh(42)
    const fish = [...sim.read.world.with('fish')]
    expect(fish).toHaveLength(1)
    // Peckish enough to chase the first pellet, nowhere near a crisis.
    expect(fish[0].fish.hunger).toBeGreaterThan(TUNING.seekFoodAbove)
    expect(fish[0].fish.hunger).toBeLessThan(TUNING.distressHungerAbove)
    expect(fish[0].fish.weight).toBe(TUNING.starterWeight)
    expect(sim.read.coins).toBe(TUNING.startingCoins)
    expect([...sim.read.world.with('waste')]).toHaveLength(0)
    expect(maxPollution(sim.read.water)).toBe(0)
  })

  test('the first pellet retires the first-feed hint, permanently', () => {
    const sim = GameSim.fresh(42)
    expect(sim.read.unlocks.fedOnce).toBe(false)

    sim.dropFood(600)

    expect(sim.read.unlocks.fedOnce).toBe(true)
    const resumed = new GameSim(deserialize(sim.toSave(1_000)))
    expect(resumed.read.unlocks.fedOnce).toBe(true)
  })

  test('pre-fedOnce saves infer feeding from a noticeably grown fish', () => {
    const state = createFreshGame(42)
    state.unlocks.noticedGrowth = true
    const save = serialize(state, 1_000)
    delete (save.unlocks as Partial<typeof save.unlocks>).fedOnce

    expect(deserialize(save).unlocks.fedOnce).toBe(true)
  })
})

describe('simulation timing', () => {
  test('fish move on animation-frame-sized deltas', () => {
    const sim = GameSim.fresh(43)
    const fish = onlyFish(sim)
    fish.position = { x: 300, y: 300 }
    fish.velocity = { x: 40, y: 0 }
    fish.fish.activity = { kind: 'wander', target: { x: 900, y: 300 }, idleUntil: 0 }

    // A single animation-frame-sized delta (1/60s) is smaller than the fixed
    // simulation quantum (1/30s); it accumulates rather than ticking
    // immediately. Two frames' worth crosses one quantum.
    sim.step(1 / 60, true)
    sim.step(1 / 60, true)

    expect(fish.position.x).toBeGreaterThan(300)
  })
})

describe('feeding and growth', () => {
  test('a hungry fish swims to a dropped pellet, eats it, and grows', () => {
    const sim = GameSim.fresh(7)
    const before = onlyFish(sim).fish.weight
    expect(sim.dropFood(onlyFish(sim).position.x)).toBe(true)
    runFor(sim, 40)
    expect([...sim.read.world.with('food')]).toHaveLength(0)
    expect(onlyFish(sim).fish.weight).toBeGreaterThan(before)
  })

  test('feeding costs coins and is refused when unaffordable', () => {
    const state = createFreshGame(7)
    const sim = new GameSim(state)
    const coins = state.coins
    expect(sim.dropFood(500)).toBe(true)
    expect(state.coins).toBeCloseTo(coins - TUNING.pelletCost)
    state.coins = 0.2
    expect(sim.dropFood(500)).toBe(false)
  })

  test('repeated feeding grows the fish substantially and announces the growth development', () => {
    const sim = GameSim.fresh(11)
    const events: GameEvent[] = []
    for (let round = 0; round < 40; round += 1) {
      sim.dropFood(onlyFish(sim).position.x)
      events.push(...runFor(sim, 8))
    }
    expect(onlyFish(sim).fish.weight).toBeGreaterThan(3.5)
    expect(sim.read.unlocks.noticedGrowth).toBe(true)
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
    expect([...sim.read.world.with('waste')].length).toBeGreaterThan(0)
  })
})

describe('pollution and sickness', () => {
  test('waste on the sand pollutes the water and puts the siphon in the shop', () => {
    const state = createFreshGame(5)
    const sim = new GameSim(state)
    for (let i = 0; i < 4; i += 1) {
      addEntity(state, {
        position: { x: 500 + i * 20, y: 609 },
        velocity: { x: 0, y: 0 },
        waste: { size: 3, restingOnSand: true },
      })
    }
    const events = runFor(sim, 240)
    expect(maxPollution(state.water)).toBeGreaterThan(0.1)
    expect(state.unlocks.siphonInShop).toBe(true)
    expect(
      events.some((e) => e.type === 'toast' && e.tone === 'development' && /green/.test(e.message)),
    ).toBe(true)
  })

  test('fish sicken in polluted water and recover in clean water', () => {
    const state = createFreshGame(9)
    const sim = new GameSim(state)
    for (let t = 0; t < 60; t += TEST_STEP) {
      state.water.cells.fill(0.8)
      sim.step(TEST_STEP, true)
    }
    const sickness = onlyFish(sim).fish.sickness
    expect(sickness).toBeGreaterThan(0.05)
    state.water.cells.fill(0)
    runFor(sim, 120)
    expect(onlyFish(sim).fish.sickness).toBeLessThan(sickness)
  })

  test('the siphon removes debris and clears local pollution, but only once owned', () => {
    const state = createFreshGame(3)
    const sim = new GameSim(state)
    expect(sim.siphonAt(600, 600)).toBeUndefined()
    state.unlocks.siphonInShop = true
    state.coins = 100
    expect(sim.buy('siphon')).toBe(true)
    expect(state.ownsSiphon).toBe(true)
    addEntity(state, {
      position: { x: 600, y: 609 },
      velocity: { x: 0, y: 0 },
      waste: { size: 3, restingOnSand: true },
    })
    state.water.cells.fill(0.4)
    const pollutionBefore = pollutionAt(state.water, { x: 600, y: 609 })
    expect(sim.siphonAt(600, 609)).toBe(1)
    expect([...state.world.with('waste')]).toHaveLength(0)
    expect(pollutionAt(state.water, { x: 600, y: 609 })).toBeLessThan(pollutionBefore)
  })
})

describe('economy and population', () => {
  test('coins accrue faster with more fish mass', () => {
    const light = GameSim.fresh(21)
    const heavy = GameSim.fresh(21)
    onlyFish(heavy).fish.weight = 20
    const lightStart = light.read.coins
    const heavyStart = heavy.read.coins
    runFor(light, 60)
    runFor(heavy, 60)
    expect(heavy.read.coins - heavyStart).toBeGreaterThan(light.read.coins - lightStart)
  })

  test('starter growth unlocks fish purchases at an escalating price', () => {
    const state = createFreshGame(31)
    const sim = new GameSim(state)
    onlyFish(sim).fish.weight = TUNING.fishUnlockWeight + 0.1
    const events = runFor(sim, 1)
    expect(state.unlocks.fishInShop).toBe(true)
    expect(events.some((e) => e.type === 'toast' && e.tone === 'development')).toBe(true)

    state.coins = 500
    expect(sim.shopItems().find((i) => i.id === 'fish')?.cost).toBe(TUNING.fishPrices[0])
    expect(sim.buy('fish')).toBe(true)
    expect([...state.world.with('fish')]).toHaveLength(2)
    expect(sim.shopItems().find((i) => i.id === 'fish')?.cost).toBe(TUNING.fishPrices[1])
  })
})

describe('breeding', () => {
  test('two thriving fish in clean water court, lay an egg, and hatch a blended baby', () => {
    const state = pairedState(101)
    const sim = new GameSim(state)
    const events = runFor(sim, 100)
    const fish = [...state.world.with('fish')]
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
    expect([...state.world.with('egg')]).toHaveLength(0)
  })

  test('an egg incubated in murky water hatches a stunted, flagged fry', () => {
    const state = pairedState(107)
    const sim = new GameSim(state)
    runFor(sim, 25)
    expect([...state.world.with('egg')]).toHaveLength(1)
    for (let t = 0; t < 80; t += TEST_STEP) {
      state.water.cells.fill(0.6)
      sim.step(TEST_STEP, true)
    }
    const baby = [...state.world.with('fish')].find((f) => f.fish.generation === 2)!
    expect(baby).toBeDefined()
    expect(baby.fish.hatchedInMurkyWater).toBe(true)
    expect(baby.fish.genome.maxWeight).toBeLessThan(23)
  })
})

describe('critique regressions', () => {
  test('a starving fish still chases and eats dropped food — rescue is possible', () => {
    const state = createFreshGame(701)
    const sim = new GameSim(state)
    const fish = onlyFish(sim)
    fish.fish.hunger = 1
    for (let t = 0; t < 120; t += TEST_STEP) {
      if ([...state.world.with('food')].length === 0) {
        state.coins = 10
        sim.dropFood(onlyFish(sim).position.x)
      }
      sim.step(TEST_STEP, true)
      if (onlyFish(sim).fish.hunger < 0.9) break
    }
    expect(onlyFish(sim).fish.hunger).toBeLessThan(0.9)
    expect([...state.world.with('fish')]).toHaveLength(1)
  })

  test('a fish recovered from illness leaves the distress posture', () => {
    const sim = GameSim.fresh(703)
    const fish = onlyFish(sim)
    fish.fish.hunger = 0.1
    fish.fish.sickness = 0.8
    runFor(sim, 2)
    expect(onlyFish(sim).fish.activity.kind).toBe('distress')
    onlyFish(sim).fish.sickness = 0
    runFor(sim, 2)
    expect(onlyFish(sim).fish.activity.kind).not.toBe('distress')
  })

  test('no game over while an egg is incubating; the hatchling revives the tank', () => {
    const sim = new GameSim(pairedState(705))
    runFor(sim, 25)
    expect([...sim.read.world.with('egg')]).toHaveLength(1)
    for (const entity of [...sim.read.world.with('fish')]) {
      entity.fish.hunger = 1
      entity.fish.health = 0.001
      entity.fish.criticalSince = sim.read.time - TUNING.warningGraceSeconds - 1
    }
    runFor(sim, 10)
    expect([...sim.read.world.with('fish')]).toHaveLength(0)
    expect(sim.read.gameOver).toBe(false)
    runFor(sim, 80)
    expect([...sim.read.world.with('fish')]).toHaveLength(1)
    expect(sim.read.gameOver).toBe(false)
    expect(sim.dropFood(600)).toBe(true)
  })

  test('waste and spoiled food break down on their own, keeping entities bounded', () => {
    const state = createFreshGame(707)
    const sim = new GameSim(state)
    addEntity(state, {
      position: { x: 600, y: 609 },
      velocity: { x: 0, y: 0 },
      waste: { size: 1.2, restingOnSand: true },
    })
    state.coins = 10
    sim.dropFood(1100) // far from the fish; left to spoil
    onlyFish(sim).fish.hunger = 0 // keep the fish uninterested
    for (let t = 0; t < 700; t += TEST_STEP) {
      onlyFish(sim).fish.hunger = 0
      sim.step(TEST_STEP, true)
    }
    expect([...state.world.with('waste')]).toHaveLength(0)
    expect([...state.world.with('food')]).toHaveLength(0)
  })

  test('offline catch-up pulls pre-existing sickness down to its ceiling', () => {
    const sim = GameSim.fresh(709)
    onlyFish(sim).fish.sickness = 1
    sim.advanceOffline(3600)
    expect(onlyFish(sim).fish.sickness).toBeLessThanOrEqual(TUNING.offlineSicknessCeiling)
  })

  test('the drip feeder feeds hungry fish automatically, spending coins', () => {
    const state = pairedState(715, { hunger: 0.9 })
    const sim = new GameSim(state)
    state.ownsFeeder = true
    state.coins = 50
    const coinsBefore = state.coins
    runFor(sim, 60)
    const fish = [...state.world.with('fish')]
    expect(Math.max(...fish.map((f) => f.fish.hunger))).toBeLessThan(0.9)
    expect(state.coins).toBeLessThan(coinsBefore + 60 * TUNING.incomeFloor + 60 * TUNING.incomePerGram * 40)
  })

  test('the feeder does nothing without coins', () => {
    const state = pairedState(717, { hunger: 0.9 })
    const sim = new GameSim(state)
    state.ownsFeeder = true
    state.coins = 0
    sim.step(TEST_STEP, true)
    expect([...state.world.with('food')]).toHaveLength(0)
  })

  test('a dead fish\'s name is not reused for newcomers', () => {
    const state = createFreshGame(719)
    const sim = new GameSim(state)
    const name = onlyFish(sim).fish.name
    onlyFish(sim).fish.hunger = 1
    onlyFish(sim).fish.health = 0.01
    runFor(sim, 300)
    expect(state.gameOver).toBe(true)
    state.coins = 100
    expect(sim.buy('starterFish')).toBe(true)
    expect(onlyFish(sim).fish.name).not.toBe(name)
  })

  test('the shop refuses fish at the population cap', () => {
    const state = createFreshGame(711)
    const sim = new GameSim(state)
    state.unlocks.fishInShop = true
    state.coins = 100_000
    for (let i = 0; i < TUNING.maxPopulation - 1; i += 1) {
      spawnFish(state, {
        genome: randomGenome(state.rng, 20),
        name: `Filler${i}`,
        weight: 5,
        generation: 1,
      })
    }
    const item = sim.shopItems().find((i) => i.id === 'fish')
    expect(item?.affordable).toBe(false)
    expect(sim.buy('fish')).toBe(false)
    expect([...state.world.with('fish')]).toHaveLength(TUNING.maxPopulation)
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
    expect(sim.read.gameOver).toBe(true)
    expect([...sim.read.world.with('fish')]).toHaveLength(0)
  })

  test('death takes at least the warning grace period even for a frail fish', () => {
    const sim = GameSim.fresh(207)
    const fish = onlyFish(sim)
    fish.fish.hunger = 1
    fish.fish.health = 0.01
    runFor(sim, TUNING.warningGraceSeconds - 5)
    expect([...sim.read.world.with('fish')]).toHaveLength(1)
    runFor(sim, 30)
    expect([...sim.read.world.with('fish')]).toHaveLength(0)
  })

  test('no fish dies while the page is hidden', () => {
    const sim = GameSim.fresh(202)
    onlyFish(sim).fish.hunger = 1
    runFor(sim, 600, false)
    expect([...sim.read.world.with('fish')]).toHaveLength(1)
    expect(sim.read.gameOver).toBe(false)
  })

  test('game over keeps coins and equipment, and a new starter fish resumes play', () => {
    const state = createFreshGame(203)
    const sim = new GameSim(state)
    state.ownsSiphon = true
    state.coins = 40
    onlyFish(sim).fish.hunger = 1
    onlyFish(sim).fish.health = 0.05
    runFor(sim, 300)
    expect(state.gameOver).toBe(true)
    expect(state.ownsSiphon).toBe(true)
    const coinsAfterDeath = state.coins
    expect(coinsAfterDeath).toBeGreaterThan(0)

    const starter = sim.shopItems().find((i) => i.id === 'starterFish')
    expect(starter).toBeDefined()
    expect(sim.buy('starterFish')).toBe(true)
    expect(state.gameOver).toBe(false)
    expect([...state.world.with('fish')]).toHaveLength(1)
  })

  test('an empty tank still trickles income so recovery is always reachable', () => {
    const state = createState(301)
    state.gameOver = true
    state.coins = 0
    const sim = new GameSim(state)
    runFor(sim, 60)
    expect(state.coins).toBeCloseTo(TUNING.incomeFloor * 60, 1)
  })
})

describe('away time', () => {
  test('offline catch-up is slowed, capped, clamps deterioration, and never kills', () => {
    const sim = GameSim.fresh(401)
    onlyFish(sim).fish.hunger = 0.99
    const summary = sim.advanceOffline(24 * 3600)
    expect(summary.simulatedSeconds).toBe(TUNING.offlineMaxSimSeconds)
    expect(summary.coinsEarned).toBeGreaterThan(0)
    expect(sim.drainEvents().some((e) => e.type === 'awaySummary')).toBe(true)
    expect([...sim.read.world.with('fish')]).toHaveLength(1)
    expect(onlyFish(sim).fish.hunger).toBeLessThanOrEqual(TUNING.offlineHungerCeiling)
    expect(sim.read.gameOver).toBe(false)
  })

  test('a prepared pair can breed while the player is away, reported in the summary', () => {
    const sim = new GameSim(pairedState(403))
    const summary = sim.advanceOffline((150 / TUNING.offlineRate) * 1)
    expect(summary.births.length).toBeGreaterThan(0)
    expect([...sim.read.world.with('fish')]).toHaveLength(3)
  })
})

describe('persistence', () => {
  test('serialize/deserialize round-trips the whole game and stays deterministic', () => {
    const sim = GameSim.fresh(501)
    sim.dropFood(600)
    runFor(sim, 60)
    const saved = sim.toSave(1_000)
    const resumed = new GameSim(deserialize(saved))
    expect(resumed.toSave(1_000)).toEqual(saved)

    runFor(sim, 30)
    runFor(resumed, 30)
    expect(resumed.toSave(2_000)).toEqual(sim.toSave(2_000))
  })

  test('determinism across the real JSON save path with a rich, removal-scarred world', () => {
    // Entity removals reorder miniplex's arrays (swap-remove), so this pins
    // that id-ordered iteration keeps a loaded game in lockstep with one that
    // was never saved — with multiple fish, food, waste, and eggs in play.
    const state = pairedState(801)
    const sim = new GameSim(state)
    state.coins = 200
    for (let round = 0; round < 6; round += 1) {
      sim.dropFood(200 + round * 120)
      runFor(sim, 12)
    }
    expect([...state.world.entities].length).toBeGreaterThan(3)

    const json = JSON.stringify(sim.toSave(5_000))
    const parsed = parseSave(json)
    expect(parsed).toBeDefined()
    const resumed = new GameSim(deserialize(parsed!))

    runFor(sim, 90)
    runFor(resumed, 90)
    expect(resumed.toSave(6_000)).toEqual(sim.toSave(6_000))
  })

  test('undelivered toasts survive a save/load cycle', () => {
    const sim = GameSim.fresh(507)
    const pending = sim.read.events.length
    expect(pending).toBeGreaterThan(0)
    const resumed = new GameSim(deserialize(sim.toSave(1_000)))
    expect(resumed.drainEvents()).toHaveLength(pending)
  })

  test('parseSave rejects malformed and foreign saves', () => {
    expect(parseSave('not json')).toBeUndefined()
    expect(parseSave('{"version":2}')).toBeUndefined()
    const sim = GameSim.fresh(503)
    const roundTripped = parseSave(JSON.stringify(sim.toSave(5)))
    expect(roundTripped?.version).toBe(1)
  })
})

describe('tank journal', () => {
  test('chronicles the arrival, purchases, and deaths of the tank', () => {
    const state = createFreshGame(901)
    const sim = new GameSim(state)
    expect(state.journal).toHaveLength(1)
    expect(state.journal[0].kind).toBe('arrival')

    state.coins = 100
    state.unlocks.siphonInShop = true
    expect(sim.buy('siphon')).toBe(true)
    expect(state.journal.at(-1)).toMatchObject({ kind: 'purchase' })

    const fish = onlyFish(sim)
    fish.fish.hunger = 1
    fish.fish.health = 0.001
    fish.fish.criticalSince = -TUNING.warningGraceSeconds
    runFor(sim, 5)
    const kinds = state.journal.map((entry) => entry.kind)
    expect(kinds).toContain('death')
  })

  test('chronicles hatchings with their lineage', () => {
    const sim = new GameSim(pairedState(903))
    runFor(sim, TUNING.courtshipSeconds + TUNING.eggHatchSeconds + 10)

    const birth = sim.read.journal.find((entry) => entry.kind === 'birth')
    expect(birth).toBeDefined()
    expect(birth!.message).toContain('child of Ada & Bez')
  })

  test('survives save/load and stays bounded', () => {
    const state = createFreshGame(905)
    const sim = new GameSim(state)
    for (let i = 0; i < TUNING.journalMaxEntries + 30; i += 1) {
      recordJournal(state, 'development', `entry ${i}`)
    }
    expect(state.journal).toHaveLength(TUNING.journalMaxEntries)
    expect(state.journal.at(-1)!.message).toBe(`entry ${TUNING.journalMaxEntries + 29}`)

    const resumed = new GameSim(deserialize(sim.toSave(1_000)))
    expect(resumed.read.journal).toEqual(state.journal)
  })

  test('records an away chapter when the modal-worthy threshold is crossed', () => {
    const sim = GameSim.fresh(907)
    sim.advanceOffline(3_600)
    expect(sim.read.journal.some((entry) => entry.kind === 'away')).toBe(true)
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
