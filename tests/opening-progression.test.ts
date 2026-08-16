import { describe, expect, test } from 'vitest'

import { createDevScenario } from '@/game/devtools'
import {
  FEEDER_PROFILES,
  FOOD_PROFILES,
  foodProfile,
  type FeederStage,
  type FoodStage,
} from '@/game/equipment'
import { randomGenome } from '@/game/genome'
import { buildHudSnapshot } from '@/game/hud'
import { MEAL_HISTORY_BATCH_LIMIT, TANK, TUNING } from '@/game/model'
import { decodeSave, hydrate } from '@/game/save'
import { GameSim } from '@/game/sim'
import {
  addEntity,
  createFreshGame,
  createState,
  livingFish,
  mealsEatenSince,
  recordMeal,
  spawnFish,
  type GameState,
} from '@/game/state'
import { averagePollution } from '@/game/water'

/**
 * The opening progression package: a three-rung food ladder that owns the
 * opening cadence, waste that appears while the player is still watching,
 * and hidden developments that answer real workload rather than elapsed time
 * or repeated empty gestures.
 *
 * Everything here drives the real simulation. Where a test shapes state
 * directly it does so before handing the tank to the GameSim, or through the
 * same typed care history the save format persists.
 */

const STEP = 0.25

type TankOptions = {
  seed: number
  residents?: number
  weight?: number
  maxWeight?: number
  hunger?: number
  food?: FoodStage
  feeder?: FeederStage
  coins?: number
}

function tank(options: TankOptions): { state: GameState; sim: GameSim } {
  const state = createState(options.seed)
  for (let i = 0; i < (options.residents ?? 1); i += 1) {
    spawnFish(state, {
      genome: randomGenome(state.rng, options.maxWeight ?? 26),
      name: `Fish${i}`,
      weight: options.weight ?? 1.2,
      generation: 1,
      hunger: options.hunger ?? TUNING.starterHunger,
    })
  }
  state.equipment.food = options.food ?? 'flake'
  state.equipment.feeder = options.feeder ?? 'none'
  state.coins = options.coins ?? 100_000
  return { state, sim: new GameSim(state) }
}

/** The morsel dropped most recently. Query order is not insertion order —
 * miniplex reshuffles its buckets — so take the newest id rather than the
 * last element. */
function newestMorsel(state: GameState) {
  return [...state.world.with('food')].sort((a, b) => b.id - a.id)[0].food
}

/** Recent morsels the tank has actually eaten, from the persisted history. */
function mealsEaten(state: GameState): number {
  return state.care.meals.reduce((sum, bucket) => sum + bucket.eaten, 0)
}

function mealsEatenByHand(state: GameState): number {
  return state.care.meals.reduce((sum, bucket) => sum + bucket.manual, 0)
}

function totalMass(state: GameState): number {
  return livingFish(state).reduce((sum, fish) => sum + fish.physiology.weight, 0)
}

/**
 * Play like an attentive keeper: a morsel by hand whenever a resident wants
 * food and there is not already one in the water for it. Returns the sim
 * times at which morsels were eaten, so cadence and quiet gaps are measured
 * from meals rather than from clicks.
 */
function attentiveKeeper(
  sim: GameSim,
  state: GameState,
  seconds: number,
): number[] {
  const eatenAt: number[] = []
  const end = state.time + seconds
  while (state.time < end) {
    const edible = [...state.world.with('food')].filter((entity) => !entity.food!.spoiled)
    const wanting = livingFish(state)
      .filter((fish) => fish.physiology.hunger >= TUNING.seekFoodAbove)
      .sort((a, b) => b.physiology.hunger - a.physiology.hunger)
    if (wanting.length > edible.length) sim.dropFood(wanting[0].position.x)
    const before = mealsEaten(state)
    sim.advanceElapsed(STEP, 'visible')
    for (let i = 0; i < mealsEaten(state) - before; i += 1) eatenAt.push(state.time)
  }
  return eatenAt
}

/** Feed by hand until the tank has eaten `morsels`, or fail loudly. */
function feedByHand(sim: GameSim, state: GameState, morsels: number): void {
  const target = mealsEaten(state) + morsels
  const deadline = state.time + 600
  while (mealsEaten(state) < target) {
    if (state.time > deadline) {
      throw new Error(`only ${mealsEaten(state)} of ${target} morsels eaten within ten minutes`)
    }
    attentiveKeeper(sim, state, 1)
  }
}

describe('the opening food ladder', () => {
  test('three rungs rise in nutrition and in what each drop costs to feed', () => {
    expect(FOOD_PROFILES.flake).toMatchObject({ nutrition: 0.15, unitCost: 1 })
    expect(FOOD_PROFILES.crumb).toMatchObject({ nutrition: 0.4, cost: 30, unitCost: 2 })
    expect(FOOD_PROFILES.pellet).toMatchObject({ nutrition: 1, cost: 80, unitCost: 4 })
  })

  test('a fresh tank drops starter flakes and pays the flake unit cost', () => {
    const state = createFreshGame(41)
    const sim = new GameSim(state)
    const coins = state.coins
    expect(state.equipment.food).toBe('flake')

    expect(sim.dropFood(600).ok).toBe(true)

    expect(newestMorsel(state).nutrition).toBe(FOOD_PROFILES.flake.nutrition)
    expect(state.coins).toBeCloseTo(coins - FOOD_PROFILES.flake.unitCost, 6)
  })

  test('each rung is bought in turn, changing what every drop is and costs', () => {
    const { state, sim } = tank({ seed: 42 })
    state.developments.add('crumbFoodOffered')
    state.developments.add('heartyFoodOffered')

    // Only the next rung is ever on the shelf.
    expect(sim.shopOffers().map((offer) => offer.id)).toContain('crumbFood')
    expect(sim.shopOffers().map((offer) => offer.id)).not.toContain('heartyFood')

    expect(sim.buy('crumbFood').ok).toBe(true)
    expect(state.equipment.food).toBe('crumb')
    let coins = state.coins
    sim.dropFood(600)
    expect(newestMorsel(state).nutrition).toBe(FOOD_PROFILES.crumb.nutrition)
    expect(state.coins).toBeCloseTo(coins - FOOD_PROFILES.crumb.unitCost, 6)

    expect(sim.shopOffers().map((offer) => offer.id)).toContain('heartyFood')
    expect(sim.buy('heartyFood').ok).toBe(true)
    expect(state.equipment.food).toBe('pellet')
    coins = state.coins
    sim.dropFood(600)
    expect(newestMorsel(state).nutrition).toBe(FOOD_PROFILES.pellet.nutrition)
    expect(state.coins).toBeCloseTo(coins - FOOD_PROFILES.pellet.unitCost, 6)

    // The ladder is finished: nothing further to sell.
    expect(sim.shopOffers().map((offer) => offer.id)).not.toContain('heartyFood')
  })

  test('an automated drop costs the same as a hand-dropped one of the same food', () => {
    const { state, sim } = tank({
      seed: 43,
      residents: 2,
      weight: 24,
      hunger: 0.9,
      food: 'crumb',
      feeder: 'rotary',
      coins: 500,
    })
    state.feederLastDropAt = -10
    const before = state.coins
    const pellets = [...state.world.with('food')].length

    sim.advanceElapsed(TUNING.simTickSeconds, 'visible')

    expect([...state.world.with('food')].length).toBe(pellets + 1)
    // Income over one tick is a fraction of a coin, so the crumb's unit cost
    // is unmistakable against it.
    expect(before - state.coins).toBeGreaterThan(FOOD_PROFILES.crumb.unitCost - 0.5)
    expect(before - state.coins).toBeLessThan(FOOD_PROFILES.crumb.unitCost)
  })

  test('feeding is refused when the current food costs more than the purse holds', () => {
    // Three coins buys a flake or a crumb, but not a hearty pellet.
    const { sim } = tank({ seed: 44, food: 'pellet', coins: 3 })

    expect(sim.dropFood(600)).toMatchObject({ ok: false, reason: 'unaffordable' })
  })
})

describe('the opening cadence', () => {
  for (const seed of [42, 7]) {
    test(`an attentive keeper gets an active opening on a fresh save (seed ${seed})`, () => {
      const state = createFreshGame(seed)
      const sim = new GameSim(state)

      const eatenAt = attentiveKeeper(sim, state, 180)

      // At least eight useful feeds a minute across the opening three minutes.
      expect(eatenAt.length).toBeGreaterThanOrEqual(24)
      // And no unexplained quiet stretch: care is continuous, not a wait.
      let longestGap = 0
      let previous = 0
      for (const at of eatenAt) {
        longestGap = Math.max(longestGap, at - previous)
        previous = at
      }
      expect(longestGap).toBeLessThanOrEqual(12)
      // Never a crisis, and never broke.
      expect(livingFish(state)[0].physiology.hunger).toBeLessThan(TUNING.distressHungerAbove)
      expect(state.coins).toBeGreaterThan(0)
    })
  }

  test('the opening produces real debris while the player is still watching', () => {
    const state = createFreshGame(42)
    const sim = new GameSim(state)

    attentiveKeeper(sim, state, 180)

    expect([...state.world.with('waste')].length).toBeGreaterThan(0)
  })

  test('a mature tank still keeps its standing debris inside the legible band', () => {
    const sim = createDevScenario('thriving-full-tank', 42)
    const state = sim.read as unknown as GameState

    sim.advanceElapsed(900, 'visible')

    const debris = [...state.world.with('waste')].length
    expect(debris).toBeGreaterThanOrEqual(15)
    expect(debris).toBeLessThanOrEqual(90)
    expect(averagePollution(state.water)).toBeLessThan(0.3)
  })
})

describe('the rolling meal history', () => {
  test('a meal remains in the six-minute window until its exact timestamp expires', () => {
    const { state } = tank({ seed: 49, residents: 0 })
    state.time = 9.9
    recordMeal(state, true)

    state.time = 360.1
    expect(mealsEatenSince(state, 360)).toBe(1)

    state.time = 370
    expect(mealsEatenSince(state, 360)).toBe(0)
  })

  test('only morsels that were eaten count', () => {
    const { state, sim } = tank({ seed: 50, residents: 0 })

    for (let i = 0; i < 10; i += 1) sim.dropFood(200 + i * 80)
    sim.advanceElapsed(60, 'visible')

    expect([...state.world.with('food')].length).toBe(10)
    expect(mealsEaten(state)).toBe(0)
  })

  test('feeder drops never count towards the hand-fed history', () => {
    const { state, sim } = tank({
      seed: 51,
      residents: 2,
      weight: 20,
      hunger: 0.8,
      food: 'crumb',
      feeder: 'rotary',
    })

    sim.advanceElapsed(120, 'visible')

    expect(mealsEaten(state)).toBeGreaterThan(0)
    expect(mealsEatenByHand(state)).toBe(0)
  })

  test('the history is bounded and forgets meals older than its longest window', () => {
    const { state, sim } = tank({ seed: 52, residents: 2, weight: 12 })
    feedByHand(sim, state, 30)
    expect(mealsEaten(state)).toBeGreaterThanOrEqual(30)
    const buckets = state.care.meals.length

    // Long enough that every recorded meal falls out of the window.
    sim.advanceElapsed(TUNING.mealHistorySeconds + 60, 'visible')

    expect(mealsEaten(state)).toBe(0)
    expect(state.care.meals.length).toBeLessThanOrEqual(buckets)
    expect(state.care.meals.length).toBeLessThanOrEqual(MEAL_HISTORY_BATCH_LIMIT)
  })
})

describe('workload reveals richer food', () => {
  test('a busy hand-feeding stretch in a tank with real mass reveals crumbs', () => {
    // A small-genome resident: it eats plenty but never carries the tank mass
    // the crumb offer waits for on its own.
    const { state, sim } = tank({ seed: 60, maxWeight: 4.5 })

    feedByHand(sim, state, TUNING.crumbFoodEatenInWindow)

    expect(totalMass(state)).toBeLessThan(TUNING.crumbFoodAtTankGrams)
    expect(state.developments.has('crumbFoodOffered')).toBe(false)

    // A second resident brings the tank up to a real feeding load.
    spawnFish(state, {
      genome: randomGenome(state.rng, 26),
      name: 'Second',
      weight: 4,
      generation: 1,
      hunger: 0.3,
    })
    const result = sim.advanceElapsed(1, 'visible')

    expect(state.developments.has('crumbFoodOffered')).toBe(true)
    const announcement = result.notifications.find((n) => n.tone === 'development' && /flake/i.test(n.message))
    expect(announcement).toBeDefined()
    expect(announcement!.message).not.toMatch(/\d/) // observable pressure, not a formula
    expect(sim.shopOffers().map((offer) => offer.id)).toContain('crumbFood')
  })

  test('a heavy tank nobody is feeding never reveals crumbs', () => {
    const { state, sim } = tank({ seed: 61, residents: 3, weight: 20, hunger: 0.3 })

    // Long enough for every resident to get properly hungry: mass and time
    // are both there, and neither is what the offer is looking for.
    sim.advanceElapsed(120, 'visible')

    expect(totalMass(state)).toBeGreaterThan(TUNING.crumbFoodAtTankGrams)
    expect(mealsEaten(state)).toBe(0)
    expect(state.developments.has('crumbFoodOffered')).toBe(false)
  })

  test('meals that fall out of the window stop counting towards crumbs', () => {
    const { state, sim } = tank({ seed: 62, residents: 2, weight: 6 })
    feedByHand(sim, state, TUNING.crumbFoodEatenInWindow - 5)
    expect(state.developments.has('crumbFoodOffered')).toBe(false)

    // The player looks away for longer than the window — 'background' time,
    // where nothing can die of neglect — and comes back to feed a little.
    sim.advanceElapsed(TUNING.crumbFoodWindowSeconds + 30, 'background')
    feedByHand(sim, state, 5)

    // Those thirty-five morsels are history now: the offer waits for a fresh
    // stretch of feeding rather than a running total.
    expect(livingFish(state)).toHaveLength(2)
    expect(totalMass(state)).toBeGreaterThan(TUNING.crumbFoodAtTankGrams)
    expect(mealsEatenSince(state, TUNING.crumbFoodWindowSeconds)).toBeLessThan(
      TUNING.crumbFoodEatenInWindow,
    )
    expect(state.developments.has('crumbFoodOffered')).toBe(false)
  })

  test('hearty pellets follow busy mealtimes in a tank of four residents', () => {
    const { state, sim } = tank({ seed: 63, residents: 4, weight: 5, food: 'crumb' })

    expect(state.developments.has('heartyFoodOffered')).toBe(false)
    feedByHand(sim, state, TUNING.heartyFoodEatenInWindow)
    sim.advanceElapsed(1, 'visible')

    expect(totalMass(state)).toBeLessThan(TUNING.heartyFoodAtTankGrams)
    expect(state.developments.has('heartyFoodOffered')).toBe(true)
    expect(sim.shopOffers().map((offer) => offer.id)).toContain('heartyFood')
  })

  test('a busy pair of small fish is not yet heavy or numerous enough for pellets', () => {
    const { state, sim } = tank({ seed: 64, residents: 2, weight: 4, food: 'crumb' })

    feedByHand(sim, state, TUNING.heartyFoodEatenInWindow)

    expect(totalMass(state)).toBeLessThan(TUNING.heartyFoodAtTankGrams)
    expect(livingFish(state).length).toBeLessThan(TUNING.heartyFoodAtResidents)
    expect(state.developments.has('heartyFoodOffered')).toBe(false)
  })
})

describe('the drip feeder answers hand-feeding, not the calendar', () => {
  test('three residents fed by hand until it is a chore reveal the drip feeder', () => {
    const { state, sim } = tank({ seed: 70, residents: 3, weight: 8, food: 'crumb' })

    sim.advanceElapsed(30, 'visible')
    expect(state.developments.has('dripFeederOffered')).toBe(false)

    feedByHand(sim, state, TUNING.feederManualEatenInWindow)

    expect(mealsEatenByHand(state)).toBeGreaterThanOrEqual(TUNING.feederManualEatenInWindow)
    expect(state.developments.has('dripFeederOffered')).toBe(true)
    // The offer lands mid-chore, so the announcement is looked for where it
    // durably lives rather than in whichever advance happened to carry it.
    expect(state.journal.some((entry) => /drip feeder/.test(entry.message))).toBe(true)
  })

  test('a tank fed by its own feeder never earns the next feeder for free', () => {
    const { state, sim } = tank({
      seed: 71,
      residents: 3,
      weight: 20,
      hunger: 0.5,
      food: 'pellet',
      feeder: 'drip',
    })

    sim.advanceElapsed(TUNING.feederManualWindowSeconds + 120, 'visible')

    expect(mealsEaten(state)).toBeGreaterThan(TUNING.feederManualEatenInWindow)
    expect(mealsEatenByHand(state)).toBe(0)
    expect(state.developments.has('twinHopperOffered')).toBe(false)
  })
})

describe('feeder strain is net pressure, not uptime', () => {
  const comfortable: { stage: Exclude<FeederStage, 'none'>; residents: number }[] = [
    { stage: 'drip', residents: 3 },
    { stage: 'twin', residents: 8 },
    { stage: 'rotary', residents: 12 },
  ]

  for (const { stage, residents } of comfortable) {
    test(`a ${stage} feeder coping with ${residents} residents accrues no net strain`, () => {
      const { state, sim } = tank({
        seed: 80 + residents,
        residents,
        weight: 24,
        hunger: 0.3,
        food: 'pellet',
        feeder: stage,
      })
      for (const entity of state.world.with('breeding')) {
        entity.breeding.cooldownUntil = Number.MAX_SAFE_INTEGER
      }

      sim.advanceElapsed(1800, 'visible')

      expect(state.care.feederStrainSeconds).toBe(0)
      expect(state.developments.has('twinHopperOffered') || state.developments.has('rotaryFeederOffered')).toBe(false)
    })
  }

  test('an overloaded drip feeder reveals its relief within five simulated minutes', () => {
    const { state, sim } = tank({
      seed: 90,
      residents: 6,
      weight: 24,
      hunger: 0.5,
      food: 'pellet',
      feeder: 'drip',
    })
    state.developments.add('dripFeederOffered')

    sim.advanceElapsed(300, 'visible')

    expect(state.care.feederStrainSeconds).toBeGreaterThanOrEqual(TUNING.feederStrainForNextTier)
    expect(state.developments.has('twinHopperOffered')).toBe(true)
  })

  test('strain is given back once the tank catches up', () => {
    const { state, sim } = tank({
      seed: 91,
      residents: 6,
      weight: 24,
      hunger: 0.8,
      food: 'pellet',
      feeder: 'drip',
    })

    sim.advanceElapsed(30, 'visible')
    const strained = state.care.feederStrainSeconds
    expect(strained).toBeGreaterThan(0)

    // The keeper steps in and feeds everyone themselves: the feeder is no
    // longer behind, and the pressure it built up drains away.
    for (const entity of state.world.with('physiology')) entity.physiology.hunger = 0.1
    sim.advanceElapsed(20, 'visible')

    expect(state.care.feederStrainSeconds).toBeLessThan(strained)
  })

  test('courtship is not feeder demand and does not scatter ignored food', () => {
    const { state, sim } = tank({
      seed: 92,
      residents: 2,
      weight: 24,
      hunger: 0.7,
      food: 'pellet',
      feeder: 'rotary',
    })
    const [a, b] = livingFish(state)
    a.position.x = 100
    b.position.x = TANK.width - 100
    a.behaviour.activity = { kind: 'court', partnerId: b.id, until: state.time + 10 }
    b.behaviour.activity = { kind: 'court', partnerId: a.id, until: state.time + 10 }

    sim.advanceElapsed(3, 'visible')

    expect([...state.world.with('food')]).toHaveLength(0)
    expect(state.care.feederStrainSeconds).toBe(0)
  })

  test('every feeder advertises the population it was measured to hold', () => {
    expect(FEEDER_PROFILES.drip.supportsResidents).toBe(4)
    expect(FEEDER_PROFILES.twin.supportsResidents).toBe(12)
    expect(FEEDER_PROFILES.rotary.supportsResidents).toBe(20)
  })
})

describe('siphon cleans have to be worth something', () => {
  /** A tank with a siphon and clean, empty sand. */
  function cleaner(seed: number) {
    const built = tank({ seed, residents: 1, weight: 12, hunger: 0.2 })
    built.state.equipment.siphon = true
    return built
  }

  function dropDebris(state: GameState, x: number): void {
    addEntity(state, {
      position: { x, y: TANK.sandTop - 6 },
      velocity: { x: 0, y: 0 },
      waste: { size: 2, restingOnSand: true },
    })
  }

  test('sixty empty sweeps earn nothing and reveal no filter', () => {
    const { state, sim } = cleaner(100)

    for (let i = 0; i < 60; i += 1) {
      sim.siphonAt(150 + (i % 10) * 100, TANK.sandTop - 20)
      sim.advanceElapsed(1, 'visible')
    }

    expect(state.care.cleaningCredits).toBe(0)
    expect(state.developments.has('spongeFilterOffered')).toBe(false)
  })

  test('lifting debris earns a credit; sweeping the same spot again straight away does not', () => {
    const { state, sim } = cleaner(101)
    dropDebris(state, 400)
    dropDebris(state, 410)

    expect(sim.siphonAt(400, TANK.sandTop - 6)).toMatchObject({ ok: true, value: 2 })
    expect(state.care.cleaningCredits).toBe(1)

    // A held sweep pulses many times a second; only the first is work.
    dropDebris(state, 405)
    sim.advanceElapsed(TUNING.siphonCreditCooldownSeconds / 2, 'visible')
    sim.siphonAt(400, TANK.sandTop - 6)
    expect(state.care.cleaningCredits).toBe(1)

    // Once the cell has had time to be dirtied again, it can count again.
    dropDebris(state, 400)
    sim.advanceElapsed(TUNING.siphonCreditCooldownSeconds, 'visible')
    sim.siphonAt(400, TANK.sandTop - 6)
    expect(state.care.cleaningCredits).toBe(2)
  })

  test('clearing real local murk counts, a barely-tinged cell does not', () => {
    const { state, sim } = cleaner(102)
    state.water.cells.fill(0.6)

    sim.siphonAt(400, TANK.sandTop - 20)
    expect(state.care.cleaningCredits).toBe(1)

    const faint = cleaner(103)
    faint.state.water.cells.fill(0.05)
    faint.sim.siphonAt(400, TANK.sandTop - 20)
    expect(faint.state.care.cleaningCredits).toBe(0)
  })
})

describe('the filter answers the murk the player can see', () => {
  test('one foul corner in an otherwise clear tank never accrues sustained murk', () => {
    const { state, sim } = tank({ seed: 110, residents: 1, weight: 12, hunger: 0.2 })
    state.equipment.siphon = true
    // Debris settles where it falls, so one patch of sand can sit far dirtier
    // than the tank the player is looking at.
    for (let i = 0; i < 6; i += 1) {
      addEntity(state, {
        position: { x: 400, y: TANK.sandTop + 14 },
        velocity: { x: 0, y: 0 },
        waste: { size: 2, restingOnSand: true },
      })
    }

    // Long enough that the old worst-cell rule would have been accruing the
    // whole time, and the tank as a whole still reads clear.
    sim.advanceElapsed(200, 'visible')

    // The corner greens up visibly; the HUD's average — and the trigger with
    // it — does not.
    expect(Math.max(...state.water.cells)).toBeGreaterThan(TUNING.pollutionNoticedAt)
    expect(averagePollution(state.water)).toBeLessThan(TUNING.filterMurkAtLeast)
    expect(state.care.murkySeconds).toBe(0)
    expect(state.developments.has('spongeFilterOffered')).toBe(false)
  })

  test('a tank that stays visibly murky long enough reveals the filter', () => {
    const { state, sim } = tank({ seed: 111, residents: 1, weight: 12, hunger: 0.2 })
    state.equipment.siphon = true
    state.water.cells.fill(TUNING.filterMurkAtLeast + 0.1)
    for (let i = 0; i < 10; i += 1) {
      addEntity(state, {
        position: { x: 100 + i * 110, y: TANK.sandTop + 14 },
        velocity: { x: 0, y: 0 },
        waste: { size: 9, restingOnSand: true },
      })
    }

    sim.advanceElapsed(TUNING.filterOfferedAfterMurkySeconds + 60, 'visible')

    expect(state.care.cleaningCredits).toBe(0)
    expect(state.developments.has('spongeFilterOffered')).toBe(true)
  })

  test('clearing the water restarts the sustained-murk streak', () => {
    const { state, sim } = tank({ seed: 112, residents: 1, weight: 12, hunger: 0.2 })
    state.equipment.siphon = true
    state.water.cells.fill(TUNING.filterMurkAtLeast + 0.1)

    sim.advanceElapsed(30, 'visible')
    expect(state.care.murkySeconds).toBeGreaterThan(0)

    state.water.cells.fill(0)
    sim.advanceElapsed(1, 'visible')

    expect(state.care.murkySeconds).toBe(0)
    expect(state.developments.has('spongeFilterOffered')).toBe(false)
  })
})

describe('persistence', () => {
  test('the same siphon cell stays on cooldown across an immediate save and load', () => {
    const { state, sim } = tank({ seed: 119 })
    state.equipment.siphon = true
    state.water.cells.fill(0.6)

    sim.siphonAt(400, TANK.sandTop - 20)
    expect(state.care.cleaningCredits).toBe(1)

    const decoded = decodeSave(JSON.stringify(sim.toSave(1_000)))
    expect(decoded.kind).toBe('loaded')
    if (decoded.kind !== 'loaded') return
    const resumed = new GameSim(hydrate(decoded.document))

    resumed.siphonAt(400, TANK.sandTop - 20)
    expect(resumed.read.care.cleaningCredits).toBe(1)
  })

  test('the food ladder, meal history, and care counters survive a round trip', () => {
    const { state, sim } = tank({ seed: 120, residents: 2, weight: 8, food: 'crumb' })
    state.equipment.siphon = true
    feedByHand(sim, state, 12)
    sim.siphonAt(400, TANK.sandTop - 20)

    const saved = sim.toSave(1_000)
    const result = decodeSave(JSON.stringify(saved))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    const resumed = new GameSim(hydrate(result.document))

    expect(resumed.read.equipment.food).toBe('crumb')
    expect(resumed.read.care).toEqual(state.care)
    expect(resumed.toSave(1_000)).toEqual(saved)
  })

  test('a morsel in flight remembers whether a hand or a feeder dropped it', () => {
    // Two hungry mouths: one takes the hand-dropped morsel, so the feeder
    // still has someone to drop its own for.
    const { state, sim } = tank({ seed: 121, residents: 2, weight: 20, hunger: 0.9, feeder: 'drip' })
    state.feederLastDropAt = -10 // the feeder is due, and drops on the next tick
    sim.dropFood(300)
    sim.advanceElapsed(TUNING.simTickSeconds, 'visible')
    expect([...state.world.with('food')].length).toBe(2)

    const result = decodeSave(JSON.stringify(sim.toSave(1_000)))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    const resumed = hydrate(result.document)

    const manual = [...resumed.world.with('food')].filter((entity) => entity.food.manual)
    expect(manual).toHaveLength(1)
  })

  test('a save from the previous build keeps the food it was actually feeding', () => {
    const previous = (food: 'flake' | 'pellet') => {
      const save = GameSim.fresh(122).toSave(1_000) as unknown as Record<string, unknown>
      const equipment = { ...(save.equipment as Record<string, unknown>), food }
      return {
        ...save,
        version: 4,
        equipment,
        care: {
          feederShortfallSeconds: 300,
          siphonUses: 9,
          pollutedSeconds: 800,
          stableFullSeconds: 40,
        },
        // A V4 morsel carried no record of who dropped it.
        entities: (save.entities as Record<string, unknown>[]).map((entity) => {
          const food = entity.food as Record<string, unknown> | undefined
          if (!food) return entity
          const withoutManual = { ...food }
          delete withoutManual.manual
          return { ...entity, food: withoutManual }
        }),
      }
    }

    const flakes = decodeSave(JSON.stringify(previous('flake')))
    expect(flakes.kind).toBe('loaded')
    if (flakes.kind !== 'loaded') return
    // Old flakes were as rich as today's crumbs; the migration must not
    // quietly halve what a returning keeper is feeding.
    expect(flakes.document.equipment.food).toBe('crumb')
    expect(flakes.document.developments).toContain('crumbFoodOffered')

    const pellets = decodeSave(JSON.stringify(previous('pellet')))
    expect(pellets.kind).toBe('loaded')
    if (pellets.kind !== 'loaded') return
    expect(pellets.document.equipment.food).toBe('pellet')

    // The redefined counters start clean rather than inheriting numbers that
    // meant something else, and the streak that did not change is kept.
    expect(flakes.document.care).toEqual({
      feederStrainSeconds: 0,
      cleaningCredits: 0,
      murkySeconds: 0,
      stableFullSeconds: 40,
      meals: [],
    })
    // No development is granted by the migration itself.
    const sim = new GameSim(hydrate(flakes.document))
    expect(sim.shopOffers().map((offer) => offer.id)).not.toContain('crumbFood')

    // Deterministic: the same document every time.
    expect(decodeSave(JSON.stringify(previous('flake')))).toEqual(flakes)
  })
})

describe('the interface tells the truth about food and feeders', () => {
  test('the HUD names the food in the tin and what a drop of it costs', () => {
    const { state, sim } = tank({ seed: 130 })

    expect(buildHudSnapshot(sim, undefined, 'clear').food).toEqual({
      label: 'Starter flakes',
      unitCost: foodProfile('flake').unitCost,
    })

    state.developments.add('crumbFoodOffered')
    expect(sim.buy('crumbFood').ok).toBe(true)

    expect(buildHudSnapshot(sim, undefined, 'clear').food).toEqual({
      label: 'Crumbs',
      unitCost: foodProfile('crumb').unitCost,
    })
  })

  test('the shop describes both food rungs and the feeders it can actually hold', () => {
    const { state, sim } = tank({ seed: 131 })
    state.developments.add('crumbFoodOffered')
    state.developments.add('dripFeederOffered')

    const items = buildHudSnapshot(sim, undefined, 'clear').shopItems
    const crumbs = items.find((item) => item.id === 'crumbFood')
    expect(crumbs).toMatchObject({ label: 'Crumbs', cost: FOOD_PROFILES.crumb.cost })
    expect(crumbs!.description).toMatch(/flake/i)

    const drip = items.find((item) => item.id === 'dripFeeder')
    expect(drip!.description).toContain(String(FEEDER_PROFILES.drip.supportsResidents))
    expect(drip!.description).toMatch(/hearty pellet/i)
  })

  test('feeder purchase notices describe the current food price rather than a fixed coin', () => {
    const { state, sim } = tank({ seed: 132, food: 'crumb' })
    state.developments.add('dripFeederOffered')

    const purchase = sim.buy('dripFeeder')

    expect(purchase.ok).toBe(true)
    if (!purchase.ok) return
    expect(purchase.notifications[0].message).toMatch(/current food/i)
    expect(purchase.notifications[0].message).not.toMatch(/a coin per pellet|every pellet.*coin/i)
  })
})
