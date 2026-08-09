import { describe, expect, test } from 'vitest'

import { loadFromStorage, RECOVERY_KEY, saveToStorage } from '@/game/browser-save'
import { decodeSave, hydrate, SAVE_KEY, serialize, type SaveFile } from '@/game/save'
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
    expect(resumed.dropFood(600)).toBe(true)
    expect([...resumed.read.world.entities].filter((entity) => entity.id === fishId)).toHaveLength(1)
    expect(resumed.read.byId.get(fishId)?.fish).toBeDefined()
  })
})

describe('decodeSave: structural and semantic validation', () => {
  test('empty, garbage, and wrong-version inputs are distinguishable', () => {
    expect(decodeSave(null)).toEqual({ kind: 'empty' })
    expect(decodeSave('not json').kind).toBe('invalid')
    expect(decodeSave('null').kind).toBe('invalid')
    expect(decodeSave('42').kind).toBe('invalid')

    const unsupported = decodeSave(JSON.stringify({ version: 2 }))
    expect(unsupported).toMatchObject({ kind: 'unsupported', version: 2 })
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
    const fish = [...sim.read.world.with('fish')][0]
    fish.fish.activity = { kind: 'seekFood', foodId: 999_999 }
    const save = sim.toSave(1_000)

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const resumedFish = result.document.entities.find((entity) => entity.id === fish.id)!
    expect(resumedFish.fish!.activity.kind).toBe('wander')
  })

  test('a fish courting a partner that no longer exists normalises to wander instead of rejecting', () => {
    const sim = GameSim.fresh(105)
    const fish = [...sim.read.world.with('fish')][0]
    fish.fish.activity = { kind: 'court', partnerId: 999_999, until: 100 }
    const save = sim.toSave(1_000)

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const resumedFish = result.document.entities.find((entity) => entity.id === fish.id)!
    expect(resumedFish.fish!.activity.kind).toBe('wander')
  })
})

describe('round-trip and migration determinism', () => {
  test('serialize -> JSON -> decodeSave -> hydrate -> serialize is deterministic and equal', () => {
    const sim = GameSim.fresh(200)
    sim.dropFood(600)
    for (let t = 0; t < 30; t += 0.25) sim.step(0.25, true)

    const saved = sim.toSave(5_000)
    const result = decodeSave(JSON.stringify(saved))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    const resumed = hydrate(result.document)
    expect(serialize(resumed, 5_000)).toEqual(saved)
  })

  test('a historical minimal V1 fixture with no journal, feeder fields, or fedOnce migrates with documented defaults', () => {
    const save = GameSim.fresh(201).toSave(1_000) as Partial<SaveFile>
    delete save.journal
    delete save.pendingEvents
    delete save.retiredNames
    delete save.feederLastDropAt
    delete save.ownsFeeder
    delete (save.unlocks as Partial<SaveFile['unlocks']>).feederInShop
    delete (save.unlocks as Partial<SaveFile['unlocks']>).fedOnce

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return

    expect(result.document.journal).toEqual([])
    expect(result.document.pendingEvents).toEqual([])
    expect(result.document.retiredNames).toEqual([])
    expect(result.document.feederLastDropAt).toBe(0)
    expect(result.document.ownsFeeder).toBe(false)
    expect(result.document.unlocks.feederInShop).toBe(false)
    // No noticedGrowth either in this fixture, so fedOnce infers false.
    expect(result.document.unlocks.fedOnce).toBe(false)

    // Re-migrating the same fixture again reaches the identical document.
    const again = decodeSave(JSON.stringify(save))
    expect(again).toEqual(result)
  })

  test('a historical fixture with noticedGrowth but no fedOnce infers fedOnce true', () => {
    const save = GameSim.fresh(202).toSave(1_000) as Partial<SaveFile>
    save.unlocks!.noticedGrowth = true
    delete (save.unlocks as Partial<SaveFile['unlocks']>).fedOnce

    const result = decodeSave(JSON.stringify(save))
    expect(result.kind).toBe('loaded')
    if (result.kind !== 'loaded') return
    expect(result.document.unlocks.fedOnce).toBe(true)
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
