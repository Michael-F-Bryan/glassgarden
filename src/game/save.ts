import { World } from 'miniplex'

import type { Entity, JournalEntry, Unlocks } from './model'
import { createRng } from './rng'
import { checkSemantics, migrateV1ToCurrent, normalizeSemantics, SaveV1Schema } from './save-schema'
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
  entities: Entity[]
  journal: JournalEntry[]
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; document: SaveFile }
  | { kind: 'invalid'; raw: string; issues: string[] }
  | { kind: 'unsupported'; raw: string; version: unknown }

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
    entities: [...state.world.entities]
      .sort((a, b) => a.id - b.id)
      .map((entity) => structuredClone(entity)),
    journal: state.journal.map((entry) => ({ ...entry })),
  }
}

/** Build runtime ECS/domain state from an already-validated document. Never
 * call with unchecked JSON — go through decodeSave() first. */
export function hydrate(document: SaveFile): GameState {
  const world = new World<Entity>()
  const byId = new Map<number, Entity>()
  for (const raw of document.entities) {
    const entity = structuredClone(raw)
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
