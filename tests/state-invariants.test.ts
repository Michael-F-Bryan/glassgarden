import { describe, expect, test } from 'vitest'

import { randomGenome } from '@/game/genome'
import { RESIDENT_COMPONENTS, TANK, TUNING, type Entity } from '@/game/model'
import { decodeSave, hydrate } from '@/game/save'
import { GameSim } from '@/game/sim'
import {
  addEntity,
  assertStateInvariants,
  createFreshGame,
  createState,
  spawnFish,
  type GameState,
} from '@/game/state'

/**
 * assertStateInvariants is the promise the rest of the game relies on but no
 * single call site can see being broken (byId/world agreement, id hygiene,
 * exactly one archetype per entity, finite positions, fish stats in range,
 * water cells in range). These tests exercise it across the lifecycle
 * moments the ECS-encapsulation review flagged: spawn, removal, death,
 * hatch, cleanup, and save/load — plus two deliberately corrupted states to
 * prove it actually catches something.
 */

/** Two adults that meet every breeding condition in a clean tank — mirrors
 * game-sim.test.ts's pairedState. */
function pairedState(seed: number): GameState {
  const state = createState(seed)
  for (const name of ['Ada', 'Bez'] as const) {
    spawnFish(state, {
      genome: randomGenome(state.rng, 26),
      name,
      weight: 20,
      generation: 1,
      hunger: 0.1,
    })
  }
  return state
}

/** Mirrors createDevScenario('dirty-tank') in src/game/devtools.ts: an owned
 * siphon and a few waste droppings resting on the sand, built here on a
 * retained state so the invariant check can inspect it directly. */
function dirtyTankState(seed: number): GameState {
  const state = createFreshGame(seed)
  state.coins = 100
  state.equipment.siphon = true
  state.developments.add('siphonOffered')
  for (const x of [360, 600, 840]) {
    addEntity(state, {
      position: { x, y: TANK.sandTop - 6 },
      velocity: { x: 0, y: 0 },
      waste: { size: 2, restingOnSand: true },
    })
  }
  return state
}

describe('construction and growth', () => {
  test('hold on a freshly created game', () => {
    const state = createFreshGame(1)
    assertStateInvariants(state)
  })

  test('hold after spawning pellets and buying fish', () => {
    const state = createFreshGame(11)
    const sim = new GameSim(state)
    assertStateInvariants(state)

    sim.dropFood(TANK.width / 2)
    sim.dropFood(TANK.width / 2 + 40)
    assertStateInvariants(state)

    state.developments.add('fishOffered')
    state.coins = 10_000
    expect(sim.buy('fish').ok).toBe(true)
    expect(sim.buy('fish').ok).toBe(true)
    assertStateInvariants(state)

    sim.advanceElapsed(5, 'visible')
    assertStateInvariants(state)
  })
})

describe('removal', () => {
  test('hold after the siphon sweeps debris off the sand', () => {
    const state = dirtyTankState(21)
    const sim = new GameSim(state)
    assertStateInvariants(state)

    for (const x of [360, 600, 840]) {
      expect(sim.siphonAt(x, TANK.sandTop - 6)).toMatchObject({ ok: true, value: 1 })
    }
    expect([...state.world.with('waste')]).toHaveLength(0)
    assertStateInvariants(state)
  })
})

describe('death and remains', () => {
  test('hold immediately after a fish dies and again once remains finish lingering', () => {
    const state = createFreshGame(31)
    const sim = new GameSim(state)
    const fish = [...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')][0]
    fish.physiology.hunger = 1
    fish.physiology.health = 0
    fish.physiology.criticalSince = -TUNING.warningGraceSeconds
    assertStateInvariants(state)

    sim.advanceElapsed(TUNING.simTickSeconds * 2, 'visible')
    expect([...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')]).toHaveLength(0)
    expect([...state.world.with('remains')]).toHaveLength(1)
    assertStateInvariants(state)

    sim.advanceElapsed(TUNING.remainsLingerSeconds + 1, 'visible')
    expect([...state.world.with('remains')]).toHaveLength(0)
    assertStateInvariants(state)
  })
})

describe('breeding: courtship, egg, and hatch', () => {
  test('hold through courtship, egg-laying, and hatching', () => {
    const state = pairedState(41)
    const sim = new GameSim(state)
    assertStateInvariants(state)

    // A tick pairs the two eligible adults into courtship.
    sim.advanceElapsed(TUNING.simTickSeconds, 'visible')
    expect([...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')].some((e) => e.behaviour.activity.kind === 'court')).toBe(true)
    assertStateInvariants(state)

    // Courtship completes and an egg is laid.
    sim.advanceElapsed(TUNING.courtshipSeconds + 1, 'visible')
    expect([...state.world.with('egg')]).toHaveLength(1)
    assertStateInvariants(state)

    // The egg hatches into a generation-2 fry.
    sim.advanceElapsed(TUNING.eggHatchSeconds + 1, 'visible')
    expect([...state.world.with('egg')]).toHaveLength(0)
    expect([...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')].some((e) => e.resident.generation === 2)).toBe(true)
    assertStateInvariants(state)
  })
})

describe('remains across a reload', () => {
  test('a corpse mid-animation survives a save/load and still expires', () => {
  const state = createFreshGame(909)
  const sim = new GameSim(state)
  const fish = [...state.world.with('physiology', 'resident')][0]
  const name = fish.resident.name
  fish.physiology.hunger = 1
  fish.physiology.health = 0.0001
  fish.physiology.criticalSince = -TUNING.warningGraceSeconds
  sim.advanceElapsed(1, 'visible')

  const remains = [...state.world.with('remains')]
  expect(remains).toHaveLength(1)
  expect(remains[0].remains.name).toBe(name)

  const result = decodeSave(JSON.stringify(sim.toSave(1000)))
  expect(result.kind).toBe('loaded')
  if (result.kind !== 'loaded') return
  const resumed = new GameSim(hydrate(result.document))
  const carried = [...resumed.read.world.with('remains')]
  expect(carried).toHaveLength(1)
  expect(carried[0].remains.name).toBe(name)
  expect(carried[0].remains.genome.hue).toBeCloseTo(remains[0].remains.genome.hue)

  resumed.advanceElapsed(TUNING.remainsLingerSeconds + 2, 'visible')
  expect([...resumed.read.world.with('remains')]).toHaveLength(0)
  expect(resumed.read.gameOver).toBe(true)
})
})

describe('persistence round-trip', () => {
  test('hold after serialize -> decodeSave -> hydrate', () => {
    const state = dirtyTankState(51)
    const sim = new GameSim(state)
    sim.advanceElapsed(3, 'visible')

    const json = JSON.stringify(sim.toSave(1_000))
    const result = decodeSave(json)
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const hydrated = hydrate(result.document)
    assertStateInvariants(hydrated)
  })
})

describe('corruption is caught', () => {
  test('a duplicate entity id trips the byId/world agreement check', () => {
    const state = createFreshGame(61)
    const original = [...state.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')][0]
    // Bypass addEntity: push a second entity sharing the same id straight
    // into the world without updating byId or nextEntityId.
    const duplicate: Entity = {
      ...original,
      position: { ...original.position },
      velocity: { ...original.velocity },
    }
    state.world.add(duplicate)

    expect(() => assertStateInvariants(state)).toThrow(/state invariant violated/)
  })

  test('a stale nextEntityId trips the id-collision check', () => {
    const state = createFreshGame(62)
    const maxId = Math.max(...state.world.entities.map((entity) => entity.id))
    state.nextEntityId = maxId

    expect(() => assertStateInvariants(state)).toThrow(/state invariant violated/)
  })

  test('a resident missing one of its components is rejected', () => {
    const state = createFreshGame(63)
    const resident = [...state.world.with('resident')][0]
    delete (resident as Entity).breeding

    expect(() => assertStateInvariants(state)).toThrow(/missing breeding/)
  })

  test('a resident that also carries a debris component is rejected', () => {
    const state = createFreshGame(64)
    const resident = [...state.world.with('resident')][0]
    ;(resident as Entity).waste = { size: 1, restingOnSand: false }

    expect(() => assertStateInvariants(state)).toThrow(/also carries waste/)
  })
})

describe('resident components', () => {
  test('a spawned resident carries exactly the five resident components', () => {
    const state = createFreshGame(65)
    const resident = [...state.world.with('resident')][0]

    for (const component of RESIDENT_COMPONENTS) {
      expect(resident[component]).toBeDefined()
    }
    expect(resident.food).toBeUndefined()
    expect(resident.waste).toBeUndefined()
    expect(resident.egg).toBeUndefined()
    expect(resident.remains).toBeUndefined()
    assertStateInvariants(state)
  })

  test('death replaces the live components with remains that keep only what is drawn', () => {
    const state = createFreshGame(66)
    const sim = new GameSim(state)
    const resident = [...state.world.with('resident', 'genome', 'physiology')][0]
    const { name } = resident.resident
    const genomeHue = resident.genome.hue
    resident.physiology.hunger = 1
    resident.physiology.health = 0.001
    resident.physiology.criticalSince = -TUNING.warningGraceSeconds

    sim.advanceElapsed(2, 'visible')

    expect([...state.world.with('resident')]).toHaveLength(0)
    const remains = [...state.world.with('remains')][0]
    expect(remains.remains.name).toBe(name)
    expect(remains.remains.genome.hue).toBe(genomeHue)
    // The corpse keeps no live body, behaviour, or breeding state.
    expect(remains.physiology).toBeUndefined()
    expect(remains.behaviour).toBeUndefined()
    expect(remains.breeding).toBeUndefined()
    assertStateInvariants(state)
  })
})
