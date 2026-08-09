import { describe, expect, test } from 'vitest'

import { loadFromStorage, RECOVERY_KEY, saveToStorage } from '@/game/browser-save'
import { decodeSave, hydrate, SAVE_KEY, serialize } from '@/game/save'
import { GameSim } from '@/game/sim'

/** Minimal in-memory Storage fake — no jsdom/localStorage mock theatre. */
function memoryStorage(overrides?: Partial<Storage>): Storage {
  const data = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key)
    },
    setItem: (key, value) => {
      data.set(key, value)
    },
    ...overrides,
  }
  return storage
}

/** A complete, valid V1 save as the pre-equipment build wrote them: one
 * resident and one pellet. Tests mutate a copy to describe the tank they
 * mean, so migration is proven against the real historical shape rather
 * than against something the current serializer produced. */
function v1Fixture() {
  return {
    version: 1 as const,
    savedAtMs: 1_000,
    time: 12.5,
    coins: 42.5,
    ownsSiphon: false,
    ownsFeeder: false as boolean | undefined,
    feederLastDropAt: 0 as number | undefined,
    fishPurchased: 0,
    retiredNames: [] as string[] | undefined,
    unlocks: {
      fedOnce: false as boolean | undefined,
      noticedGrowth: false,
      noticedPollution: false,
      siphonInShop: false,
      fishInShop: false,
      feederInShop: false as boolean | undefined,
      seenEgg: false,
    },
    waterCells: new Array(84).fill(0.05) as number[],
    rngState: 123_456,
    nextEntityId: 3,
    gameOver: false,
    journal: [] as { atSim: number; kind: string; message: string }[] | undefined,
    entities: [
      {
        position: { x: 600, y: 300 },
        velocity: { x: 1, y: 0 },
        fish: {
          name: 'Pella',
          genome: {
            hue: 200,
            saturation: 0.7,
            maxWeight: 26,
            finShape: 'fan',
            finFlair: 0.5,
            bodyAspect: 0.45,
            pattern: 'plain',
            patternIntensity: 0.2,
            speed: 40,
            resilience: 0.5,
          },
          weight: 4,
          hunger: 0.3,
          sickness: 0,
          health: 1,
          ageSeconds: 30,
          generation: 1,
          hatchedInMurkyWater: false,
          digesting: 0.5,
          breedingCooldownUntil: 0,
          activity: { kind: 'wander', target: { x: 700, y: 300 }, idleUntil: 20 },
          facing: 1,
        },
        id: 1,
      },
      {
        position: { x: 500, y: 100 },
        velocity: { x: 0, y: 0 },
        food: { nutrition: 1, spoilsAt: 50, spoiled: false, restingOnSand: false },
        id: 2,
      },
    ],
  }
}

describe('decodeSave: regressions from the persistence boundary probe', () => {
  test('a null fish genome decodes as invalid, not a document that crashes the next step', () => {
    const save = GameSim.fresh(99).toSave(1_000)
    ;(save.entities[0].fish as { genome: unknown }).genome = null
    const json = JSON.stringify(save)

    const result = decodeSave(json)

    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') {
      expect(result.issues.length).toBeGreaterThan(0)
      expect(result.raw).toBe(json)
    }
  })

  test('a stale nextEntityId is corrected on hydrate, so a new pellet cannot overwrite the fish in byId', () => {
    const save = GameSim.fresh(100).toSave(1_000)
    const fishId = save.entities[0].id
    save.nextEntityId = fishId

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    expect(result.document.nextEntityId).toBeGreaterThan(fishId)

    const resumed = new GameSim(hydrate(result.document))
    expect(resumed.dropFood(600).ok).toBe(true)
    expect([...resumed.read.world.entities].filter((entity) => entity.id === fishId)).toHaveLength(1)
    expect(resumed.read.byId.get(fishId)?.resident).toBeDefined()
  })
})

describe('decodeSave: structural and semantic validation', () => {
  test('empty, garbage, and wrong-version inputs are distinguishable', () => {
    expect(decodeSave(null)).toEqual({ kind: 'empty' })
    expect(decodeSave('not json').kind).toBe('invalid')
    expect(decodeSave('null').kind).toBe('invalid')
    expect(decodeSave('42').kind).toBe('invalid')

    const unsupported = decodeSave(JSON.stringify({ version: 3 }))
    expect(unsupported).toMatchObject({ kind: 'unsupported', version: 3 })
  })

  test('duplicate entity ids are rejected', () => {
    const save = GameSim.fresh(101).toSave(1_000)
    const clone = { ...save.entities[0], id: save.entities[0].id }
    save.entities.push(clone)

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') {
      expect(result.issues.some((issue) => issue.includes('duplicate'))).toBe(true)
    }
  })

  test('an entity with more than one archetype component is rejected', () => {
    const save = GameSim.fresh(102).toSave(1_000)
    const fishEntity = save.entities.find((entity) => entity.fish)!
    ;(fishEntity as unknown as { waste: unknown }).waste = { size: 1, restingOnSand: false }

    expect(decodeSave(JSON.stringify(save)).kind).toBe('invalid')
  })

  test('a water grid of the wrong length is rejected', () => {
    const save = GameSim.fresh(103).toSave(1_000)
    save.waterCells = save.waterCells.slice(1)

    expect(decodeSave(JSON.stringify(save)).kind).toBe('invalid')
  })

  test('a fish activity referencing a food entity that no longer exists normalises to wander instead of rejecting', () => {
    const sim = GameSim.fresh(104)
    const fish = [...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')][0]
    fish.behaviour.activity = { kind: 'seekFood', foodId: 999_999 }
    const save = sim.toSave(1_000)

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const resumedFish = result.document.entities.find((entity) => entity.id === fish.id)!
    expect(resumedFish.fish!.activity.kind).toBe('wander')
  })

  test('a fish courting a partner that no longer exists normalises to wander instead of rejecting', () => {
    const sim = GameSim.fresh(105)
    const fish = [...sim.read.world.with('resident', 'genome', 'physiology', 'behaviour', 'breeding')][0]
    fish.behaviour.activity = { kind: 'court', partnerId: 999_999, until: 100 }
    const save = sim.toSave(1_000)

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const resumedFish = result.document.entities.find((entity) => entity.id === fish.id)!
    expect(resumedFish.fish!.activity.kind).toBe('wander')
  })
})

describe('the wire format is independent of runtime components', () => {
  test('a resident is still persisted as one V1 fish blob', () => {
    const sim = GameSim.fresh(210)
    const document = sim.toSave(1_000)
    const wireFish = document.entities.find((entity) => entity.fish)!

    // The runtime splits residents into components; the wire keeps V1's
    // single blob, so existing saves stay readable without a version bump.
    expect(wireFish.fish).toMatchObject({
      name: expect.any(String),
      weight: expect.any(Number),
      hunger: expect.any(Number),
      breedingCooldownUntil: expect.any(Number),
      facing: expect.any(Number),
    })
    expect(wireFish.fish!.genome.hue).toEqual(expect.any(Number))
    expect(wireFish).not.toHaveProperty('resident')
    expect(wireFish).not.toHaveProperty('physiology')
    expect(document.version).toBe(2)
  })

  test('a V1 save written before the component split still loads and runs', () => {
    const result = decodeSave(JSON.stringify(v1Fixture()))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const state = hydrate(result.document)
    const resident = [...state.world.with('resident')][0]
    expect(resident.resident.name).toBe('Pella')
    expect(resident.physiology!.weight).toBe(4)
    expect(resident.behaviour!.activity.kind).toBe('wander')
    expect(resident.breeding!.cooldownUntil).toBe(0)

    // It keeps simulating, and writing it back produces the current format.
    const sim = new GameSim(state)
    sim.advanceElapsed(1, 'visible')
    expect(sim.toSave(2_000).entities.find((entity) => entity.fish)!.fish!.name).toBe('Pella')
  })
})

describe('round-trip and migration determinism', () => {
  test('serialize -> JSON -> decodeSave -> hydrate -> serialize is deterministic and equal', () => {
    const sim = GameSim.fresh(200)
    sim.dropFood(600)
    for (let t = 0; t < 30; t += 0.25) sim.advanceElapsed(0.25, 'visible')

    const saved = sim.toSave(5_000)
    const result = decodeSave(JSON.stringify(saved))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const resumed = hydrate(result.document)
    expect(serialize(resumed, 5_000)).toEqual(saved)
  })

  test('a legacy save carrying pendingEvents is accepted, and the field is dropped', () => {
    const save = GameSim.fresh(204).toSave(1_000)
    const legacyRaw = JSON.stringify({
      ...save,
      pendingEvents: [{ type: 'toast', tone: 'info', message: 'stale' }],
    })

    const result = decodeSave(legacyRaw)
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    expect(result.document).not.toHaveProperty('pendingEvents')
  })

  test('a minimal V1 save with no journal, feeder fields, or fedOnce migrates with documented defaults', () => {
    const save = v1Fixture()
    delete save.journal
    delete save.retiredNames
    delete save.feederLastDropAt
    delete save.ownsFeeder
    delete save.unlocks.feederInShop
    delete save.unlocks.fedOnce

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    expect(result.document.version).toBe(2)
    expect(result.document.journal).toEqual([])
    expect(result.document.retiredNames).toEqual([])
    expect(result.document.feederLastDropAt).toBe(0)
    expect(result.document.equipment).toEqual({ siphon: false, feeder: 'none', filter: 'none' })
    expect(result.document.developments).not.toContain('dripFeederOffered')
    // No noticedGrowth either in this fixture, so fedOnce infers false.
    expect(result.document.developments).not.toContain('fedOnce')
    expect(result.document.care).toEqual({
      feederShortfallSeconds: 0,
      siphonUses: 0,
      pollutedSeconds: 0,
    })

    // Re-migrating the same fixture reaches the identical document.
    expect(decodeSave(JSON.stringify(save))).toEqual(result)
  })

  test('a V1 save with noticedGrowth but no fedOnce infers fedOnce', () => {
    const save = v1Fixture()
    save.unlocks.noticedGrowth = true
    delete save.unlocks.fedOnce

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    expect(result.document.developments).toContain('fedOnce')
    expect(result.document.developments).toContain('growthNoticed')
  })

  test('a developed V1 tank keeps its equipment, unlocks, residents, and history', () => {
    const save = v1Fixture()
    save.ownsSiphon = true
    save.ownsFeeder = true
    save.coins = 812.5
    save.fishPurchased = 2
    save.retiredNames = ['Wisp']
    save.journal = [{ atSim: 5, kind: 'arrival', message: 'Pella arrived in the bare tank.' }]
    save.unlocks = {
      fedOnce: true,
      noticedGrowth: true,
      noticedPollution: true,
      siphonInShop: true,
      fishInShop: true,
      feederInShop: true,
      seenEgg: true,
    }

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    const document = result.document

    // Equipment carries over as typed stages; a V1 feeder is the drip stage.
    expect(document.equipment).toEqual({ siphon: true, feeder: 'drip', filter: 'none' })
    expect(document.developments).toEqual([
      'fedOnce',
      'growthNoticed',
      'pollutionNoticed',
      'siphonOffered',
      'fishOffered',
      'eggSeen',
      'dripFeederOffered',
    ])
    expect(document.coins).toBe(812.5)
    expect(document.fishPurchased).toBe(2)
    expect(document.retiredNames).toEqual(['Wisp'])
    expect(document.journal).toHaveLength(1)
    expect(document.entities).toHaveLength(save.entities.length)

    // The migrated tank is playable and re-saves in the current format.
    const sim = new GameSim(hydrate(document))
    sim.advanceElapsed(1, 'visible')
    expect(sim.toSave(2_000).version).toBe(2)
    expect(sim.read.equipment.feeder).toBe('drip')

    // Migration is deterministic: the same V1 bytes always land identically.
    expect(decodeSave(JSON.stringify(save))).toEqual(result)
  })

  test('a V1 tank that never owned a feeder does not inherit one', () => {
    const save = v1Fixture()
    save.ownsFeeder = false
    save.unlocks.feederInShop = false

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    expect(result.document.equipment.feeder).toBe('none')
    expect(result.document.developments).not.toContain('dripFeederOffered')
  })
})

describe('browser-save: dependency-injected storage adapter', () => {
  test('loadFromStorage reports empty when nothing is stored', () => {
    const storage = memoryStorage()
    expect(loadFromStorage(storage)).toEqual({ kind: 'empty' })
  })

  test('loadFromStorage round-trips a save written by saveToStorage', () => {
    const storage = memoryStorage()
    const save = GameSim.fresh(300).toSave(1_000)

    expect(saveToStorage(storage, save)).toBe(true)
    const result = loadFromStorage(storage)
    expect(result.kind).toBe('loaded')
    if (result.kind === 'loaded') expect(result.document).toEqual(save)
  })

  test('a quota-throwing setItem returns failure instead of throwing', () => {
    const storage = memoryStorage({
      setItem: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      },
    })
    const save = GameSim.fresh(301).toSave(1_000)

    expect(saveToStorage(storage, save)).toBe(false)
  })

  test('a getItem that throws (e.g. storage disabled) is reported as invalid, not thrown', () => {
    const storage = memoryStorage({
      getItem: () => {
        throw new Error('storage disabled')
      },
    })
    expect(loadFromStorage(storage).kind).toBe('invalid')
  })

  test('invalid stored data is preserved under the recovery key before any caller could overwrite it', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, 'not json')

    const result = loadFromStorage(storage)
    expect(result.kind).toBe('invalid')
    expect(storage.getItem(RECOVERY_KEY)).toBe('not json')

    // A subsequent autosave must not have destroyed the recovery copy.
    const fresh = GameSim.fresh(302).toSave(2_000)
    saveToStorage(storage, fresh)
    expect(storage.getItem(RECOVERY_KEY)).toBe('not json')
  })

  test('unsupported-version stored data is also preserved under the recovery key', () => {
    const storage = memoryStorage()
    const raw = JSON.stringify({ version: 7, entities: [] })
    storage.setItem(SAVE_KEY, raw)

    const result = loadFromStorage(storage)
    expect(result.kind).toBe('unsupported')
    expect(storage.getItem(RECOVERY_KEY)).toBe(raw)
  })
})
