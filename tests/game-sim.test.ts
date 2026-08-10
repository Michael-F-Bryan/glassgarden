import { describe, expect, test } from 'vitest'

import { generateName, randomGenome } from '@/game/genome'
import { capacityFor } from '@/game/equipment'
import { TANK, TUNING, type StepReport, type UiNotification } from '@/game/model'
import { decodeSave, deserialize, hydrate, parseSave } from '@/game/save'
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

type RunResult = { report: StepReport; notifications: UiNotification[] }

/** Loop advanceElapsed in TEST_STEP-sized slices, merging every call's
 * report (arrays concatenated, gameOver OR-ed) and notifications. */
function runFor(sim: GameSim, seconds: number, visible = true): RunResult {
  const report: StepReport = { births: [], deaths: [], gameOver: false }
  const notifications: UiNotification[] = []
  for (let t = 0; t < seconds; t += TEST_STEP) {
    const step = sim.advanceElapsed(TEST_STEP, visible ? 'visible' : 'background')
    report.births.push(...step.report.births)
    report.deaths.push(...step.report.deaths)
    report.gameOver = report.gameOver || step.report.gameOver
    notifications.push(...step.notifications)
  }
  return { report, notifications }
}

function onlyFish(sim: GameSim) {
  const fish = [...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]
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
    const fish = [...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]
    expect(fish).toHaveLength(1)
    // Peckish enough to chase the first pellet, nowhere near a crisis.
    expect(fish[0].physiology.hunger).toBeGreaterThan(TUNING.seekFoodAbove)
    expect(fish[0].physiology.hunger).toBeLessThan(TUNING.distressHungerAbove)
    expect(fish[0].physiology.weight).toBe(TUNING.starterWeight)
    expect(sim.read.coins).toBe(TUNING.startingCoins)
    expect([...sim.read.world.with('waste')]).toHaveLength(0)
    expect(maxPollution(sim.read.water)).toBe(0)
  })

  test('the first pellet retires the first-feed hint, permanently', () => {
    const sim = GameSim.fresh(42)
    expect(sim.read.developments.has('fedOnce')).toBe(false)

    sim.dropFood(600)

    expect(sim.read.developments.has('fedOnce')).toBe(true)
    const resumed = new GameSim(deserialize(sim.toSave(1_000)))
    expect(resumed.read.developments.has('fedOnce')).toBe(true)
  })

})

describe('simulation timing', () => {
  test('fish move on animation-frame-sized deltas', () => {
    const sim = GameSim.fresh(43)
    const fish = onlyFish(sim)
    fish.position = { x: 300, y: 300 }
    fish.velocity = { x: 40, y: 0 }
    fish.behaviour.activity = { kind: 'wander', target: { x: 900, y: 300 }, idleUntil: 0 }

    // A single animation-frame-sized delta (1/60s) is smaller than the fixed
    // simulation quantum (1/30s); it accumulates rather than ticking
    // immediately. Two frames' worth crosses one quantum.
    sim.advanceElapsed(1 / 60, 'visible')
    sim.advanceElapsed(1 / 60, 'visible')

    expect(fish.position.x).toBeGreaterThan(300)
  })
})

describe('feeding and growth', () => {
  test('a hungry fish swims to a dropped pellet, eats it, and grows', () => {
    const sim = GameSim.fresh(7)
    const before = onlyFish(sim).physiology.weight
    expect(sim.dropFood(onlyFish(sim).position.x).ok).toBe(true)
    runFor(sim, 40)
    expect([...sim.read.world.with('food')]).toHaveLength(0)
    expect(onlyFish(sim).physiology.weight).toBeGreaterThan(before)
  })

  test('feeding costs coins and is refused when unaffordable', () => {
    const state = createFreshGame(7)
    const sim = new GameSim(state)
    const coins = state.coins
    expect(sim.dropFood(500).ok).toBe(true)
    expect(state.coins).toBeCloseTo(coins - TUNING.pelletCost)
    state.coins = 0.2
    // Scenario is specifically "not enough coins", so pin the failure reason.
    expect(sim.dropFood(500)).toMatchObject({ ok: false, reason: 'unaffordable' })
  })

  test('repeated feeding grows the fish substantially and announces the growth development', () => {
    const sim = GameSim.fresh(11)
    const notifications: UiNotification[] = []
    for (let round = 0; round < 40; round += 1) {
      sim.dropFood(onlyFish(sim).position.x)
      notifications.push(...runFor(sim, 8).notifications)
    }
    expect(onlyFish(sim).physiology.weight).toBeGreaterThan(3.5)
    expect(sim.read.developments.has('growthNoticed')).toBe(true)
    expect(
      notifications.some((n) => n.tone === 'development' && /bigger/.test(n.message)),
    ).toBe(true)
  })

  test('digestion turns meals into waste droppings', () => {
    const sim = GameSim.fresh(13)
    // A dropping represents several pellets' worth of digestion, so keep the
    // fish hungry enough to actually eat every pellet dropped for it.
    for (let round = 0; round < 8; round += 1) {
      onlyFish(sim).physiology.hunger = 0.6
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
    const result = runFor(sim, 240)
    expect(maxPollution(state.water)).toBeGreaterThan(0.1)
    expect(state.developments.has('siphonOffered')).toBe(true)
    expect(
      result.notifications.some((n) => n.tone === 'development' && /green/.test(n.message)),
    ).toBe(true)
  })

  test('fish sicken in polluted water and recover in clean water', () => {
    const state = createFreshGame(9)
    const sim = new GameSim(state)
    for (let t = 0; t < 60; t += TEST_STEP) {
      state.water.cells.fill(0.8)
      sim.advanceElapsed(TEST_STEP, 'visible')
    }
    const sickness = onlyFish(sim).physiology.sickness
    expect(sickness).toBeGreaterThan(0.05)
    state.water.cells.fill(0)
    runFor(sim, 120)
    expect(onlyFish(sim).physiology.sickness).toBeLessThan(sickness)
  })

  test('the siphon removes debris and clears local pollution, but only once owned', () => {
    const state = createFreshGame(3)
    const sim = new GameSim(state)
    // Scenario is specifically "no siphon owned yet", so pin the failure reason.
    expect(sim.siphonAt(600, 600)).toMatchObject({ ok: false, reason: 'unowned' })
    state.developments.add('siphonOffered')
    state.coins = 100
    expect(sim.buy('siphon').ok).toBe(true)
    expect(state.equipment.siphon).toBe(true)
    addEntity(state, {
      position: { x: 600, y: 609 },
      velocity: { x: 0, y: 0 },
      waste: { size: 3, restingOnSand: true },
    })
    state.water.cells.fill(0.4)
    const pollutionBefore = pollutionAt(state.water, { x: 600, y: 609 }, TANK)
    expect(sim.siphonAt(600, 609)).toMatchObject({ ok: true, value: 1 })
    expect([...state.world.with('waste')]).toHaveLength(0)
    expect(pollutionAt(state.water, { x: 600, y: 609 }, TANK)).toBeLessThan(pollutionBefore)
  })
})

describe('economy and population', () => {
  test('coins accrue faster with more fish mass', () => {
    const light = GameSim.fresh(21)
    const heavy = GameSim.fresh(21)
    onlyFish(heavy).physiology.weight = 20
    const lightStart = light.read.coins
    const heavyStart = heavy.read.coins
    runFor(light, 60)
    runFor(heavy, 60)
    expect(heavy.read.coins - heavyStart).toBeGreaterThan(light.read.coins - lightStart)
  })

  test('starter growth unlocks fish purchases at an escalating price', () => {
    const state = createFreshGame(31)
    const sim = new GameSim(state)
    onlyFish(sim).physiology.weight = TUNING.fishUnlockWeight + 0.1
    const result = runFor(sim, 1)
    expect(state.developments.has('fishOffered')).toBe(true)
    expect(result.notifications.some((n) => n.tone === 'development')).toBe(true)

    state.coins = 500
    expect(sim.shopOffers().find((i) => i.id === 'fish')?.cost).toBe(TUNING.fishPrices[0])
    expect(sim.buy('fish').ok).toBe(true)
    expect([...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(2)
    expect(sim.shopOffers().find((i) => i.id === 'fish')?.cost).toBe(TUNING.fishPrices[1])
  })
})

describe('breeding', () => {
  test('two thriving fish in clean water court, lay an egg, and hatch a blended baby', () => {
    const state = pairedState(101)
    const sim = new GameSim(state)
    const result = runFor(sim, 100)
    const fish = [...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]
    expect(fish).toHaveLength(3)
    const baby = fish.find((f) => f.resident.generation === 2)!
    expect(baby).toBeDefined()
    expect(baby.resident.parents).toEqual(expect.arrayContaining(['Ada', 'Bez']))
    expect(baby.resident.name).not.toBe('Ada')
    expect(baby.resident.name).not.toBe('Bez')
    expect(baby.genome.maxWeight).toBeGreaterThan(20)
    expect(baby.genome.maxWeight).toBeLessThan(32)
    expect(baby.genome.hue).toBeGreaterThanOrEqual(0)
    expect(baby.genome.hue).toBeLessThan(360)
    expect(result.report.births.length).toBeGreaterThan(0)
    expect(
      result.notifications.some((n) => n.tone === 'development' && /egg/.test(n.message)),
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
    // Genuinely foul ground, not the everyday greening under a working tank.
    for (let t = 0; t < 80; t += TEST_STEP) {
      state.water.cells.fill(TUNING.murkyEggPollution + 0.1)
      sim.advanceElapsed(TEST_STEP, 'visible')
    }
    const baby = [...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')].find((f) => f.resident.generation === 2)!
    expect(baby).toBeDefined()
    expect(baby.resident.hatchedInMurkyWater).toBe(true)
    expect(baby.genome.maxWeight).toBeLessThan(23)
  })
})

describe('critique regressions', () => {
  test('a starving fish still chases and eats dropped food — rescue is possible', () => {
    const state = createFreshGame(701)
    const sim = new GameSim(state)
    const fish = onlyFish(sim)
    fish.physiology.hunger = 1
    for (let t = 0; t < 120; t += TEST_STEP) {
      if ([...state.world.with('food')].length === 0) {
        state.coins = 10
        sim.dropFood(onlyFish(sim).position.x)
      }
      sim.advanceElapsed(TEST_STEP, 'visible')
      if (onlyFish(sim).physiology.hunger < 0.9) break
    }
    expect(onlyFish(sim).physiology.hunger).toBeLessThan(0.9)
    expect([...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(1)
  })

  test('a fish recovered from illness leaves the distress posture', () => {
    const sim = GameSim.fresh(703)
    const fish = onlyFish(sim)
    fish.physiology.hunger = 0.1
    fish.physiology.sickness = 0.8
    runFor(sim, 2)
    expect(onlyFish(sim).behaviour.activity.kind).toBe('distress')
    onlyFish(sim).physiology.sickness = 0
    runFor(sim, 2)
    expect(onlyFish(sim).behaviour.activity.kind).not.toBe('distress')
  })

  test('no game over while an egg is incubating; the hatchling revives the tank', () => {
    const sim = new GameSim(pairedState(705))
    runFor(sim, 25)
    expect([...sim.read.world.with('egg')]).toHaveLength(1)
    for (const entity of [...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]) {
      entity.physiology.hunger = 1
      entity.physiology.health = 0.001
      entity.physiology.criticalSince = sim.read.time - TUNING.warningGraceSeconds - 1
    }
    runFor(sim, 10)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(0)
    expect(sim.read.gameOver).toBe(false)
    runFor(sim, 80)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(1)
    expect(sim.read.gameOver).toBe(false)
    expect(sim.dropFood(600).ok).toBe(true)
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
    onlyFish(sim).physiology.hunger = 0 // keep the fish uninterested
    for (let t = 0; t < 700; t += TEST_STEP) {
      onlyFish(sim).physiology.hunger = 0
      sim.advanceElapsed(TEST_STEP, 'visible')
    }
    expect([...state.world.with('waste')]).toHaveLength(0)
    expect([...state.world.with('food')]).toHaveLength(0)
  })

  test('offline catch-up pulls pre-existing sickness down to its ceiling', () => {
    const sim = GameSim.fresh(709)
    onlyFish(sim).physiology.sickness = 1
    sim.advanceOffline(3600)
    expect(onlyFish(sim).physiology.sickness).toBeLessThanOrEqual(TUNING.offlineSicknessCeiling)
  })

  test('the drip feeder feeds hungry fish automatically, spending coins', () => {
    const state = pairedState(715, { hunger: 0.9 })
    const sim = new GameSim(state)
    state.equipment.feeder = 'drip'
    state.coins = 50
    const coinsBefore = state.coins
    runFor(sim, 60)
    const fish = [...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]
    expect(Math.max(...fish.map((f) => f.physiology.hunger))).toBeLessThan(0.9)
    expect(state.coins).toBeLessThan(coinsBefore + 60 * TUNING.incomeFloor + 60 * TUNING.incomePerGram * 40)
  })

  test('the feeder does nothing without coins', () => {
    const state = pairedState(717, { hunger: 0.9 })
    const sim = new GameSim(state)
    state.equipment.feeder = 'drip'
    state.coins = 0
    sim.advanceElapsed(TEST_STEP, 'visible')
    expect([...state.world.with('food')]).toHaveLength(0)
  })

  test('a dead fish\'s name is not reused for newcomers', () => {
    const state = createFreshGame(719)
    const sim = new GameSim(state)
    const name = onlyFish(sim).resident.name
    onlyFish(sim).physiology.hunger = 1
    onlyFish(sim).physiology.health = 0.01
    runFor(sim, 300)
    expect(state.gameOver).toBe(true)
    state.coins = 100
    expect(sim.buy('starterFish').ok).toBe(true)
    expect(onlyFish(sim).resident.name).not.toBe(name)
  })

  test('the shop refuses fish at the population cap', () => {
    const state = createFreshGame(711)
    const sim = new GameSim(state)
    state.developments.add('fishOffered')
    state.coins = 100_000
    for (let i = 0; i < capacityFor('starter') - 1; i += 1) {
      spawnFish(state, {
        genome: randomGenome(state.rng, 20),
        name: `Filler${i}`,
        weight: 5,
        generation: 1,
      })
    }
    const item = sim.shopOffers().find((i) => i.id === 'fish')
    expect(item?.affordable).toBe(false)
    // Scenario is specifically "at the population cap", so pin the failure reason.
    expect(sim.buy('fish')).toMatchObject({ ok: false, reason: 'atCapacity' })
    expect([...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(capacityFor('starter'))
  })
})

describe('neglect, death, and game over', () => {
  test('a starving fish is warned, then dies only after sustained visible neglect', () => {
    const sim = GameSim.fresh(201)
    onlyFish(sim).physiology.hunger = 1
    const result = runFor(sim, 400)
    expect(
      result.notifications.some((n) => n.tone === 'warning' && /starving/.test(n.message)),
    ).toBe(true)
    expect(result.report.deaths.length).toBeGreaterThan(0)
    expect(result.report.gameOver).toBe(true)
    expect(sim.read.gameOver).toBe(true)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(0)
  })

  test('death takes at least the warning grace period even for a frail fish', () => {
    const sim = GameSim.fresh(207)
    const fish = onlyFish(sim)
    fish.physiology.hunger = 1
    fish.physiology.health = 0.01
    runFor(sim, TUNING.warningGraceSeconds - 5)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(1)
    runFor(sim, 30)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(0)
  })

  test('no fish dies while the page is hidden', () => {
    const sim = GameSim.fresh(202)
    onlyFish(sim).physiology.hunger = 1
    runFor(sim, 600, false)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(1)
    expect(sim.read.gameOver).toBe(false)
  })

  test('game over keeps coins and equipment, and a new starter fish resumes play', () => {
    const state = createFreshGame(203)
    const sim = new GameSim(state)
    state.equipment.siphon = true
    state.coins = 40
    onlyFish(sim).physiology.hunger = 1
    onlyFish(sim).physiology.health = 0.05
    runFor(sim, 300)
    expect(state.gameOver).toBe(true)
    expect(state.equipment.siphon).toBe(true)
    const coinsAfterDeath = state.coins
    expect(coinsAfterDeath).toBeGreaterThan(0)

    const starter = sim.shopOffers().find((i) => i.id === 'starterFish')
    expect(starter).toBeDefined()
    expect(sim.buy('starterFish').ok).toBe(true)
    expect(state.gameOver).toBe(false)
    expect([...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(1)
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
    onlyFish(sim).physiology.hunger = 0.99
    const summary = sim.advanceOffline(24 * 3600)
    expect(summary.simulatedSeconds).toBe(TUNING.offlineMaxSimSeconds)
    expect(summary.coinsEarned).toBeGreaterThan(0)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(1)
    expect(onlyFish(sim).physiology.hunger).toBeLessThanOrEqual(TUNING.offlineHungerCeiling)
    expect(sim.read.gameOver).toBe(false)
  })

  test('a prepared pair can breed while the player is away, reported in the summary', () => {
    const sim = new GameSim(pairedState(403))
    const summary = sim.advanceOffline((150 / TUNING.offlineRate) * 1)
    expect(summary.births.length).toBeGreaterThan(0)
    expect([...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(3)
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
    for (let round = 0; round < 12; round += 1) {
      sim.dropFood(200 + (round % 6) * 120)
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

  test('notifications are not persisted', () => {
    const sim = GameSim.fresh(507)
    const save = sim.toSave(1_000)
    expect(save).not.toHaveProperty('pendingEvents')

    // A legacy save that DOES carry pendingEvents must still decode and
    // hydrate — the field is accepted and dropped, never replayed.
    const legacyRaw = JSON.stringify({
      ...save,
      pendingEvents: [{ type: 'toast', tone: 'info', message: 'stale, from a previous session' }],
    })
    const result = decodeSave(legacyRaw)
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const resumed = new GameSim(hydrate(result.document))
    expect(resumed.advanceElapsed(0, 'visible').notifications).toHaveLength(0)
  })

  test('parseSave rejects malformed and foreign saves', () => {
    expect(parseSave('not json')).toBeUndefined()
    expect(parseSave('{"version":99}')).toBeUndefined()
    const sim = GameSim.fresh(503)
    const roundTripped = parseSave(JSON.stringify(sim.toSave(5)))
    expect(roundTripped?.version).toBe(3)
  })
})

describe('tank journal', () => {
  test('chronicles the arrival, purchases, and deaths of the tank', () => {
    const state = createFreshGame(901)
    const sim = new GameSim(state)
    expect(state.journal).toHaveLength(1)
    expect(state.journal[0].kind).toBe('arrival')

    state.coins = 100
    state.developments.add('siphonOffered')
    expect(sim.buy('siphon').ok).toBe(true)
    expect(state.journal.at(-1)).toMatchObject({ kind: 'purchase' })

    const fish = onlyFish(sim)
    fish.physiology.hunger = 1
    fish.physiology.health = 0.001
    fish.physiology.criticalSince = -TUNING.warningGraceSeconds
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
