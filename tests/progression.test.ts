import { describe, expect, test } from 'vitest'

import {
  capacityFor,
  FEEDER_PROFILES,
  FILTER_PROFILES,
  HABITAT_PROFILES,
  tankBoundsFor,
  type FeederStage,
} from '@/game/equipment'
import { createDevScenario } from '@/game/devtools'
import { randomGenome } from '@/game/genome'
import { TANK, TUNING } from '@/game/model'
import { decodeSave, hydrate } from '@/game/save'
import { GameSim } from '@/game/sim'
import { addEntity, createState, spawnFish, type GameState } from '@/game/state'

/**
 * Progression is hidden from the player but must be provable here: each
 * feeder tier really does hold the population it is sold for, feeders still
 * cost coins and do not scatter pellets, developments fire once from real
 * pressure, and filtration buys headroom without retiring the siphon.
 */

/** A tank of mature residents with a feeder installed and money to run it. */
function stockedTank(options: {
  seed: number
  residents: number
  feeder: FeederStage
  coins?: number
}): { state: GameState; sim: GameSim } {
  const state = createState(options.seed)
  for (let i = 0; i < options.residents; i += 1) {
    spawnFish(state, {
      genome: randomGenome(state.rng, 26),
      name: `Fish${i}`,
      weight: 24, // mature: the demanding end of the hunger curve
      generation: 1,
      hunger: 0.3,
    })
  }
  state.equipment.feeder = options.feeder
  state.coins = options.coins ?? 100_000
  state.developments.add('fedOnce')
  return { state, sim: new GameSim(state) }
}

/** Feeder capacity is about feeding, not population growth: hold breeding
 * off so the tank under test stays the size the tier is rated for. */
function withoutBreeding(state: GameState): void {
  for (const entity of state.world.with('breeding')) {
    entity.breeding.cooldownUntil = Number.MAX_SAFE_INTEGER
  }
}

function hungers(state: GameState): number[] {
  return [...state.world.with('physiology')].map((entity) => entity.physiology.hunger)
}

describe('feeder capacity', () => {
  // The population each tier is sold as supporting must actually stay fed.
  const cases: { stage: Exclude<FeederStage, 'none'>; residents: number }[] = [
    { stage: 'drip', residents: FEEDER_PROFILES.drip.supportsResidents },
    { stage: 'twin', residents: FEEDER_PROFILES.twin.supportsResidents },
    { stage: 'rotary', residents: FEEDER_PROFILES.rotary.supportsResidents },
  ]

  for (const { stage, residents } of cases) {
    test(`the ${stage} feeder holds ${residents} mature residents below distress`, () => {
      const { state, sim } = stockedTank({ seed: 700 + residents, residents, feeder: stage })
      withoutBreeding(state)

      // Let the tank reach its feeding rhythm, then watch a long steady run:
      // no resident may cross into distress at any point.
      sim.advanceElapsed(120, 'visible')
      let worst = 0
      for (let i = 0; i < 600; i += 1) {
        sim.advanceElapsed(1, 'visible')
        worst = Math.max(worst, ...hungers(state))
      }

      expect(worst).toBeLessThan(TUNING.distressHungerAbove)
      expect([...state.world.with('resident')]).toHaveLength(residents)
    })
  }

  test('a feeder one tier too small lets its overpopulated tank fall into distress', () => {
    const overloaded = FEEDER_PROFILES.twin.supportsResidents
    const { state, sim } = stockedTank({ seed: 701, residents: overloaded, feeder: 'drip' })
    withoutBreeding(state)

    sim.advanceElapsed(600, 'visible')

    // This is the pressure the next tier is meant to relieve.
    expect(Math.max(...hungers(state))).toBeGreaterThan(TUNING.distressHungerAbove)
    expect(state.care.feederShortfallSeconds).toBeGreaterThan(0)
  })
})

describe('feeders stay a coin sink and do not scatter pellets', () => {
  test('every automated pellet costs a coin', () => {
    const { state, sim } = stockedTank({ seed: 710, residents: 4, feeder: 'rotary', coins: 500 })
    withoutBreeding(state)
    for (const entity of state.world.with('physiology')) entity.physiology.hunger = 0.9

    // The feeder starts ready, so exactly one drop lands in the next tick;
    // income over a single tick is a fraction of a coin, so the pellet's
    // cost is unmistakable.
    state.feederLastDropAt = -10
    const before = state.coins
    const pelletsBefore = [...state.world.with('food')].length
    sim.advanceElapsed(TUNING.simTickSeconds, 'visible')
    const dropped = [...state.world.with('food')].length - pelletsBefore

    // The same tank without a feeder only earns over that tick; the feeder
    // tank additionally pays for its pellet.
    const control = stockedTank({ seed: 710, residents: 4, feeder: 'none', coins: 500 })
    withoutBreeding(control.state)
    for (const entity of control.state.world.with('physiology')) entity.physiology.hunger = 0.9
    control.sim.advanceElapsed(TUNING.simTickSeconds, 'visible')

    expect(dropped).toBe(1)
    expect(control.state.coins - state.coins).toBeCloseTo(TUNING.pelletCost, 6)
    expect(state.coins).toBeLessThan(before)
  })

  test('a feeder with no coins cannot feed', () => {
    const { state, sim } = stockedTank({ seed: 714, residents: 4, feeder: 'rotary', coins: 0 })
    withoutBreeding(state)
    for (const entity of state.world.with('physiology')) entity.physiology.hunger = 0.9

    sim.advanceElapsed(10, 'visible')

    expect([...state.world.with('food')]).toHaveLength(0)
  })

  test('a feeder stops dropping once every hungry fish has a pellet waiting', () => {
    const { state, sim } = stockedTank({ seed: 711, residents: 2, feeder: 'rotary' })
    // Sate them: nobody is hungry enough to feed, so nothing should drop
    // before they get peckish again.
    for (const entity of state.world.with('physiology')) entity.physiology.hunger = 0

    sim.advanceElapsed(10, 'visible')

    expect([...state.world.with('food')]).toHaveLength(0)
  })

  test('the fastest feeder never leaves more pellets than hungry mouths', () => {
    const { state, sim } = stockedTank({ seed: 712, residents: 3, feeder: 'rotary' })
    for (const entity of state.world.with('physiology')) entity.physiology.hunger = 0.9

    let worstSurplus = 0
    for (let i = 0; i < 200; i += 1) {
      sim.advanceElapsed(0.5, 'visible')
      const pellets = [...state.world.with('food')].filter((e) => !e.food!.spoiled).length
      const hungry = [...state.world.with('physiology')].filter(
        (e) => e.physiology.hunger > TUNING.feederFeedsAbove,
      ).length
      worstSurplus = Math.max(worstSurplus, pellets - hungry)
    }
    // One pellet in flight beyond demand is the drop that satisfied the last
    // hungry mouth; a scattering feeder would run far ahead of this.
    expect(worstSurplus).toBeLessThanOrEqual(1)
  })

  test('manual feeding still works when the feeder is installed', () => {
    const { state, sim } = stockedTank({ seed: 713, residents: 2, feeder: 'rotary' })
    const before = [...state.world.with('food')].length

    expect(sim.dropFood(TANK.width / 2).ok).toBe(true)

    expect([...state.world.with('food')].length).toBe(before + 1)
  })
})

describe('hidden feeder developments', () => {
  test('the drip feeder is offered once the tank holds three residents', () => {
    const { state, sim } = stockedTank({ seed: 720, residents: 3, feeder: 'none' })

    const { notifications } = sim.advanceElapsed(1, 'visible')

    expect(state.developments.has('dripFeederOffered')).toBe(true)
    expect(notifications.some((n) => n.message.includes('drip feeder'))).toBe(true)
    expect(sim.shopOffers().map((offer) => offer.id)).toContain('dripFeeder')
  })

  test('a drip feeder falling behind reveals the twin hopper, once, without naming numbers', () => {
    const overloaded = FEEDER_PROFILES.twin.supportsResidents
    const { state, sim } = stockedTank({ seed: 721, residents: overloaded, feeder: 'drip' })
    state.developments.add('dripFeederOffered')

    const first = sim.advanceElapsed(400, 'visible')

    expect(state.developments.has('twinHopperOffered')).toBe(true)
    const announcement = first.notifications.find((n) => n.message.includes('twin hopper'))
    expect(announcement).toBeDefined()
    expect(announcement!.message).not.toMatch(/\d/) // observable pressure, not a formula
    expect(sim.shopOffers().map((offer) => offer.id)).toContain('twinHopper')

    // One-shot: continuing to strain the same feeder does not re-announce it.
    const second = sim.advanceElapsed(400, 'visible')
    expect(second.notifications.some((n) => n.message.includes('twin hopper'))).toBe(false)
  })

  test('installing a feeder resets the strain so the next tier must be earned again', () => {
    const overloaded = FEEDER_PROFILES.rotary.supportsResidents
    const { state, sim } = stockedTank({ seed: 722, residents: overloaded, feeder: 'drip' })
    state.developments.add('dripFeederOffered')
    sim.advanceElapsed(400, 'visible')
    expect(state.developments.has('twinHopperOffered')).toBe(true)

    expect(sim.buy('twinHopper').ok).toBe(true)

    expect(state.equipment.feeder).toBe('twin')
    expect(state.care.feederShortfallSeconds).toBe(0)
    expect(state.developments.has('rotaryFeederOffered')).toBe(false)

    // The twin hopper must fall behind on its own before the rotary appears.
    sim.advanceElapsed(400, 'visible')
    expect(state.developments.has('rotaryFeederOffered')).toBe(true)
  })

  test('buying equipment the shop is not offering is refused as unavailable', () => {
    const { state, sim } = stockedTank({ seed: 724, residents: 2, feeder: 'none' })
    state.coins = 100_000

    // Staged equipment makes this a real path: the rotary feeder exists as an
    // id long before the tank has earned it.
    expect(sim.buy('rotaryFeeder')).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(sim.buy('spongeFilter')).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(state.equipment.feeder).toBe('none')
    expect(state.equipment.filter).toBe('none')
  })

  test('only the next feeder stage is ever offered', () => {
    const { state, sim } = stockedTank({ seed: 723, residents: 4, feeder: 'drip' })
    state.developments.add('twinHopperOffered')
    state.developments.add('rotaryFeederOffered')

    const ids = sim.shopOffers().map((offer) => offer.id)

    expect(ids).toContain('twinHopper')
    expect(ids).not.toContain('rotaryFeeder')
    expect(ids).not.toContain('dripFeeder')
  })
})

describe('filtration', () => {
  test('repeated siphoning reveals the sponge filter, once', () => {
    const { state, sim } = stockedTank({ seed: 730, residents: 2, feeder: 'none' })
    state.equipment.siphon = true

    for (let i = 0; i < TUNING.filterOfferedAfterSiphonUses; i += 1) {
      sim.siphonAt(400, TANK.sandTop - 10)
    }
    const first = sim.advanceElapsed(1, 'visible')

    expect(state.developments.has('spongeFilterOffered')).toBe(true)
    expect(first.notifications.some((n) => n.message.includes('sponge filter'))).toBe(true)
    expect(sim.shopOffers().map((offer) => offer.id)).toContain('spongeFilter')

    const second = sim.advanceElapsed(1, 'visible')
    expect(second.notifications.some((n) => n.message.includes('sponge filter'))).toBe(false)
  })

  test('a filter is not offered before the player owns a siphon', () => {
    const { state, sim } = stockedTank({ seed: 736, residents: 2, feeder: 'none' })
    state.water.cells.fill(0.9)

    sim.advanceElapsed(TUNING.filterOfferedAfterPollutedSeconds + 60, 'visible')

    expect(state.equipment.siphon).toBe(false)
    expect(state.developments.has('spongeFilterOffered')).toBe(false)
  })

  test('a tank that keeps greening up reveals the filter even without siphoning', () => {
    const { state, sim } = stockedTank({ seed: 731, residents: 2, feeder: 'none' })
    state.equipment.siphon = true
    // Droppings the player never lifts out: the murk has a standing source,
    // which is what "sustained maintenance pressure" actually looks like.
    for (let i = 0; i < 10; i += 1) {
      addEntity(state, {
        position: { x: 150 + i * 100, y: TANK.sandTop - 6 },
        velocity: { x: 0, y: 0 },
        // Piles big enough to outlive the whole murky stretch: debris now
        // breaks down in minutes, and this scenario is about a standing
        // source the player never lifts out.
        waste: { size: 8, restingOnSand: true },
      })
    }

    sim.advanceElapsed(TUNING.filterOfferedAfterPollutedSeconds + 120, 'visible')

    expect(state.care.siphonUses).toBe(0)
    expect(state.care.pollutedSeconds).toBeGreaterThan(TUNING.filterOfferedAfterPollutedSeconds)
    expect(state.developments.has('spongeFilterOffered')).toBe(true)
  })

  test('a sponge filter clears dispersed pollution faster than water alone', () => {
    const build = (filter: 'none' | 'sponge') => {
      const { state, sim } = stockedTank({ seed: 732, residents: 1, feeder: 'none' })
      state.equipment.filter = filter
      state.water.cells.fill(0.6)
      sim.advanceElapsed(120, 'visible')
      return Math.max(...state.water.cells)
    }

    expect(build('sponge')).toBeLessThan(build('none'))
  })

  test('a filter does not remove solid waste, which still needs the siphon', () => {
    const { state, sim } = stockedTank({ seed: 733, residents: 1, feeder: 'none' })
    state.equipment.filter = 'sponge'
    state.equipment.siphon = true
    for (const x of [300, 400, 500]) {
      addEntity(state, {
        position: { x, y: TANK.sandTop - 6 },
        velocity: { x: 0, y: 0 },
        waste: { size: 2, restingOnSand: true },
      })
    }

    sim.advanceElapsed(120, 'visible')

    // The droppings are still there; only a sweep removes them.
    expect([...state.world.with('waste')].length).toBeGreaterThan(0)
    expect(sim.siphonAt(400, TANK.sandTop - 6).ok).toBe(true)
    expect([...state.world.with('waste')].length).toBeLessThan(3)
  })

  test('a clogged filter works measurably worse than a clean one', () => {
    const build = (debris: number) => {
      const { state, sim } = stockedTank({ seed: 734, residents: 1, feeder: 'none' })
      state.equipment.filter = 'sponge'
      state.water.cells.fill(0.5)
      for (let i = 0; i < debris; i += 1) {
        addEntity(state, {
          // Parked off to one side so their own pollution does not dominate
          // the cell being measured.
          position: { x: 60 + i * 8, y: TANK.sandTop - 6 },
          velocity: { x: 0, y: 0 },
          waste: { size: 2, restingOnSand: true },
        })
      }
      sim.advanceElapsed(60, 'visible')
      return state.water.cells[state.water.cells.length - 1]
    }

    expect(build(FILTER_PROFILES.sponge.cloggingDebris * 3)).toBeGreaterThan(build(0))
  })

  test('absence stays recoverable, and the filter helps while the player is away', () => {
    const build = (filter: 'none' | 'sponge') => {
      const { state, sim } = stockedTank({ seed: 735, residents: 2, feeder: 'drip' })
      withoutBreeding(state)
      state.equipment.filter = filter
      state.water.cells.fill(0.7)
      sim.advanceOffline(3 * 3600)
      return state
    }

    const filtered = build('sponge')
    const unfiltered = build('none')

    // Away time never kills, whatever the water did meanwhile.
    expect([...filtered.world.with('resident')]).toHaveLength(2)
    expect(filtered.gameOver).toBe(false)
    // And the filter measurably improved the water the player comes back to.
    const average = (state: GameState) =>
      state.water.cells.reduce((sum, cell) => sum + cell, 0) / state.water.cells.length
    expect(average(filtered)).toBeLessThan(average(unfiltered))
  })
})

describe('developments are durable across a reload', () => {
  test('a discovered development does not replay after save and load', () => {
    const { state, sim } = stockedTank({ seed: 740, residents: 3, feeder: 'none' })
    const first = sim.advanceElapsed(1, 'visible')
    expect(first.notifications.some((n) => n.message.includes('drip feeder'))).toBe(true)

    const result = decodeSave(JSON.stringify(sim.toSave(1_000)))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    const resumed = new GameSim(hydrate(result.document))

    expect(resumed.read.developments.has('dripFeederOffered')).toBe(true)
    const after = resumed.advanceElapsed(5, 'visible')
    expect(after.notifications.some((n) => n.message.includes('drip feeder'))).toBe(false)
    expect(state.developments.has('dripFeederOffered')).toBe(true)
  })

  test('equipment and care history survive a save/load round-trip', () => {
    const { state, sim } = stockedTank({ seed: 741, residents: 4, feeder: 'twin' })
    state.equipment.siphon = true
    state.equipment.filter = 'sponge'
    sim.siphonAt(400, TANK.sandTop - 10)
    sim.advanceElapsed(30, 'visible')

    const saved = sim.toSave(1_000)
    const result = decodeSave(JSON.stringify(saved))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    const resumed = new GameSim(hydrate(result.document))

    expect(resumed.read.equipment).toEqual({
      siphon: true,
      feeder: 'twin',
      filter: 'sponge',
      habitat: 'starter',
    })
    expect(resumed.read.care.siphonUses).toBe(state.care.siphonUses)
    expect(resumed.toSave(1_000)).toEqual(saved)
  })
})

describe('habitat expansion', () => {
  test('a stable, healthy tank at capacity reveals the expansion once', () => {
    const sim = createDevScenario('thriving-full-tank', 820)
    const state = sim.read

    const result = sim.advanceElapsed(TUNING.expansionStableSeconds + 30, 'visible')
    expect(state.developments.has('habitatExpansionOffered')).toBe(true)
    expect(
      result.notifications.some(
        (n) => n.tone === 'development' && /habitat expansion/i.test(n.message),
      ),
    ).toBe(true)
    expect(sim.shopOffers().map((offer) => offer.id)).toContain('habitatExpansion')

    // One-shot: it never re-announces.
    const again = sim.advanceElapsed(30, 'visible')
    expect(
      again.notifications.some((n) => /habitat expansion/i.test(n.message)),
    ).toBe(false)
  })

  test('the stability streak restarts when the water fouls', () => {
    const sim = createDevScenario('thriving-full-tank', 821)
    const state = sim.read as unknown as GameState

    sim.advanceElapsed(TUNING.expansionStableSeconds / 2, 'visible')
    expect(state.care.stableFullSeconds).toBeGreaterThan(0)

    state.water.cells.fill(TUNING.expansionMaxMurk + 0.2)
    sim.advanceElapsed(1, 'visible')
    expect(state.care.stableFullSeconds).toBe(0)
    expect(state.developments.has('habitatExpansionOffered')).toBe(false)
  })

  test('a tank below capacity never reveals the expansion', () => {
    const { state, sim } = stockedTank({ seed: 822, residents: 6, feeder: 'rotary' })
    sim.advanceElapsed(TUNING.expansionStableSeconds * 2, 'visible')
    expect(state.developments.has('habitatExpansionOffered')).toBe(false)
  })

  test('buying the expansion enlarges the tank, raises capacity, and reopens breeding', () => {
    const sim = createDevScenario('thriving-full-tank', 823)
    const state = sim.read as unknown as GameState
    state.coins = HABITAT_PROFILES.expanded.cost + 500
    state.developments.add('habitatExpansionOffered')

    expect(sim.buy('habitatExpansion').ok).toBe(true)
    expect(state.equipment.habitat).toBe('expanded')
    expect(tankBoundsFor(state.equipment.habitat).width).toBeGreaterThan(TANK.width)

    // The fish shop no longer refuses at twelve.
    const fishOffer = sim.shopOffers().find((offer) => offer.id === 'fish')
    expect(fishOffer?.atCapacity).toBe(false)

    // Breeding reopens: a healthy full tank courts and lays within minutes.
    sim.advanceElapsed(120, 'visible')
    const population =
      [...state.world.with('resident')].length + [...state.world.with('egg')].length
    expect(population).toBeGreaterThan(capacityFor('starter'))

    // And the whole expanded state survives a save/load round-trip.
    const result = decodeSave(JSON.stringify(sim.toSave(1_000)))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    const resumed = new GameSim(hydrate(result.document))
    expect(resumed.read.equipment.habitat).toBe('expanded')
    expect(resumed.toSave(1_000)).toEqual(sim.toSave(1_000))
  })
})
