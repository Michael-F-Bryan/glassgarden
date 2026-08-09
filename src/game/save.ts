import { World } from 'miniplex'

import type { Entity, JournalEntry, Unlocks } from './model'
import { createRng } from './rng'
import {
  checkSemantics,
  migrateV1ToCurrent,
  normalizeSemantics,
  SaveV1Schema,
  type WireEntity,
  type WireFish,
} from './save-schema'
import type { GameState } from './state'

export const SAVE_KEY = 'glassgarden-save'

/** The canonical, fully-migrated save document. Only `hydrate()` may turn
 * this into a GameState — reaching hydrate always goes through decodeSave's
 * validation first, whether directly or via the deprecated deserialize(). */
export type SaveFile = {
  version: 1
  savedAtMs: number
  time: number
  coins: number
  ownsSiphon: boolean
  ownsFeeder: boolean
  feederLastDropAt: number
  fishPurchased: number
  retiredNames: string[]
  unlocks: Unlocks
  waterCells: number[]
  rngState: number
  nextEntityId: number
  gameOver: boolean
  entities: WireEntity[]
  journal: JournalEntry[]
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; document: SaveFile }
  | { kind: 'invalid'; raw: string; issues: string[] }
  | { kind: 'unsupported'; raw: string; version: unknown }

/**
 * Runtime entity → wire entity. Residents collapse into the V1 `fish` blob;
 * everything else is already wire-shaped.
 */
function toWire(entity: Entity): WireEntity {
  const base = {
    id: entity.id,
    position: { ...entity.position },
    velocity: { ...entity.velocity },
  }
  if (entity.resident && entity.genome && entity.physiology && entity.behaviour && entity.breeding) {
    return {
      ...base,
      fish: {
        name: entity.resident.name,
        genome: { ...entity.genome },
        weight: entity.physiology.weight,
        hunger: entity.physiology.hunger,
        sickness: entity.physiology.sickness,
        health: entity.physiology.health,
        ageSeconds: entity.physiology.ageSeconds,
        generation: entity.resident.generation,
        parents: entity.resident.parents ? [...entity.resident.parents] : undefined,
        hatchedInMurkyWater: entity.resident.hatchedInMurkyWater,
        digesting: entity.physiology.digesting,
        breedingCooldownUntil: entity.breeding.cooldownUntil,
        activity: structuredClone(entity.behaviour.activity),
        criticalSince: entity.physiology.criticalSince,
        lastWarningAt: entity.physiology.lastWarningAt,
        facing: entity.behaviour.facing,
      },
    }
  }
  if (entity.remains) {
    // V1 stores a whole fish inside remains. A corpse only animates from its
    // name, colours, and size, so the rest is written as neutral filler; a
    // legacy corpse's stale body values normalise away on first load.
    return {
      ...base,
      remains: {
        expiresAt: entity.remains.expiresAt,
        fish: {
          name: entity.remains.name,
          genome: { ...entity.remains.genome },
          weight: entity.remains.weight,
          hunger: 0,
          sickness: 0,
          health: 0,
          ageSeconds: 0,
          generation: 1,
          hatchedInMurkyWater: false,
          digesting: 0,
          breedingCooldownUntil: 0,
          activity: { kind: 'distress' },
          facing: 1,
        },
      },
    }
  }
  if (entity.food) return { ...base, food: { ...entity.food } }
  if (entity.waste) return { ...base, waste: { ...entity.waste } }
  if (entity.egg) return { ...base, egg: structuredClone(entity.egg) }
  throw new Error(`serialize: entity ${entity.id} has no archetype component`)
}

/** Wire entity → runtime entity, expanding the `fish` blob into components. */
function fromWire(wire: WireEntity): Entity {
  const base: Entity = {
    id: wire.id,
    position: { ...wire.position },
    velocity: { ...wire.velocity },
  }
  const fish: WireFish | undefined = wire.fish
  if (fish) {
    return {
      ...base,
      resident: {
        name: fish.name,
        generation: fish.generation,
        parents: fish.parents ? [fish.parents[0], fish.parents[1]] : undefined,
        hatchedInMurkyWater: fish.hatchedInMurkyWater,
      },
      genome: { ...fish.genome },
      physiology: {
        weight: fish.weight,
        hunger: fish.hunger,
        sickness: fish.sickness,
        health: fish.health,
        ageSeconds: fish.ageSeconds,
        digesting: fish.digesting,
        criticalSince: fish.criticalSince,
        lastWarningAt: fish.lastWarningAt,
      },
      behaviour: { activity: structuredClone(fish.activity), facing: fish.facing },
      breeding: { cooldownUntil: fish.breedingCooldownUntil },
    }
  }
  if (wire.remains) {
    return {
      ...base,
      remains: {
        name: wire.remains.fish.name,
        genome: { ...wire.remains.fish.genome },
        weight: wire.remains.fish.weight,
        expiresAt: wire.remains.expiresAt,
      },
    }
  }
  if (wire.food) return { ...base, food: { ...wire.food } }
  if (wire.waste) return { ...base, waste: { ...wire.waste } }
  if (wire.egg) return { ...base, egg: structuredClone(wire.egg) }
  throw new Error(`hydrate: entity ${wire.id} has no archetype component`)
}

export function serialize(state: GameState, savedAtMs: number): SaveFile {
  return {
    version: 1,
    savedAtMs,
    time: state.time,
    coins: state.coins,
    ownsSiphon: state.ownsSiphon,
    ownsFeeder: state.ownsFeeder,
    feederLastDropAt: state.feederLastDropAt,
    fishPurchased: state.fishPurchased,
    retiredNames: state.retiredNames.slice(),
    unlocks: { ...state.unlocks },
    waterCells: state.water.cells.slice(),
    rngState: state.rng.state(),
    nextEntityId: state.nextEntityId,
    gameOver: state.gameOver,
    entities: [...state.world.entities].sort((a, b) => a.id - b.id).map(toWire),
    journal: state.journal.map((entry) => ({ ...entry })),
  }
}

/** Build runtime ECS/domain state from an already-validated document. Never
 * call with unchecked JSON — go through decodeSave() first. */
export function hydrate(document: SaveFile): GameState {
  const world = new World<Entity>()
  const byId = new Map<number, Entity>()
  for (const raw of document.entities) {
    const entity = fromWire(raw)
    world.add(entity)
    byId.set(entity.id, entity)
  }
  return {
    world,
    byId,
    nextEntityId: document.nextEntityId,
    time: document.time,
    coins: document.coins,
    ownsSiphon: document.ownsSiphon,
    ownsFeeder: document.ownsFeeder,
    feederLastDropAt: document.feederLastDropAt,
    fishPurchased: document.fishPurchased,
    retiredNames: document.retiredNames.slice(),
    unlocks: { ...document.unlocks },
    water: { cells: document.waterCells.slice() },
    rng: createRng(document.rngState),
    // Notifications are deliberately not durable: the internal collector
    // starts empty and the journal carries the permanent history.
    events: [],
    journal: document.journal.map((entry) => ({ ...entry })),
    gameOver: document.gameOver,
  }
}

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

/** Validate and normalise a value already parsed from JSON (or handed in
 * directly by the deprecated deserialize()) into a loadable document. */
function decodeParsed(parsed: unknown, raw: string): LoadResult {
  if (typeof parsed !== 'object' || parsed === null) {
    return { kind: 'invalid', raw, issues: ['save is not a JSON object'] }
  }
  const version = (parsed as { version?: unknown }).version
  if (version !== 1) {
    return { kind: 'unsupported', raw, version }
  }
  const structural = SaveV1Schema.safeParse(parsed)
  if (!structural.success) {
    return { kind: 'invalid', raw, issues: structural.error.issues.map(formatIssue) }
  }
  const semanticIssues = checkSemantics(structural.data)
  if (semanticIssues.length > 0) {
    return { kind: 'invalid', raw, issues: semanticIssues }
  }
  const normalized = normalizeSemantics(structural.data)
  const document = migrateV1ToCurrent(normalized)
  return { kind: 'loaded', document }
}

/** Parse and validate a stored save. Distinguishes an empty slot (no save
 * yet) from data that is malformed (`invalid`) or from a version this build
 * cannot read (`unsupported`) — callers must not treat those as "start
 * fresh" without telling the player, since autosave can then destroy the
 * only copy of a recoverable tank. */
export function decodeSave(raw: string | null): LoadResult {
  if (raw === null) return { kind: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', raw, issues: ['save is not valid JSON'] }
  }
  return decodeParsed(parsed, raw)
}

/** @deprecated use decodeSave(); kept so GameRoot still typechecks until it
 * is rewired to browser-save.ts's loadFromStorage(). */
export function parseSave(json: string): SaveFile | undefined {
  const result = decodeSave(json)
  return result.kind === 'loaded' ? result.document : undefined
}

/** @deprecated use decodeSave() + hydrate(); kept so GameRoot and existing
 * tests still typecheck. Unlike hydrate(), this re-validates and migrates
 * its input, so it also accepts legacy-shaped/partial SaveFile objects. */
export function deserialize(save: SaveFile): GameState {
  const result = decodeParsed(save, '')
  if (result.kind !== 'loaded') {
    throw new Error(`deserialize: save is ${result.kind}`)
  }
  return hydrate(result.document)
}
