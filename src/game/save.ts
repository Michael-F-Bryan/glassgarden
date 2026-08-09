import { World } from 'miniplex'

import type { Entity, GameEvent, JournalEntry, Unlocks } from './model'
import { createRng } from './rng'
import type { GameState } from './state'
import { WATER_COLS, WATER_ROWS } from './water'

export const SAVE_KEY = 'glassgarden-save'

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
  /** Undelivered events (toasts) so announcements survive a reload. */
  pendingEvents: GameEvent[]
  /** The Tank Journal; absent in saves from before it existed. */
  journal?: JournalEntry[]
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
    entities: [...state.world.entities]
      .sort((a, b) => a.id - b.id)
      .map((entity) => structuredClone(entity)),
    pendingEvents: state.events.map((event) => structuredClone(event)),
    journal: state.journal.map((entry) => ({ ...entry })),
  }
}

export function deserialize(save: SaveFile): GameState {
  const world = new World<Entity>()
  const byId = new Map<number, Entity>()
  for (const raw of save.entities) {
    const entity = structuredClone(raw)
    world.add(entity)
    byId.set(entity.id, entity)
  }
  return {
    world,
    byId,
    nextEntityId: save.nextEntityId,
    time: save.time,
    coins: save.coins,
    ownsSiphon: save.ownsSiphon,
    ownsFeeder: save.ownsFeeder ?? false,
    feederLastDropAt: save.feederLastDropAt ?? 0,
    fishPurchased: save.fishPurchased,
    retiredNames: (save.retiredNames ?? []).slice(),
    unlocks: {
      ...save.unlocks,
      feederInShop: save.unlocks.feederInShop ?? false,
      // Pre-flag saves have no fedOnce; a noticeably grown fish proves they fed.
      fedOnce: save.unlocks.fedOnce ?? save.unlocks.noticedGrowth,
    },
    water: { cells: save.waterCells.slice() },
    rng: createRng(save.rngState),
    events: (save.pendingEvents ?? []).map((event) => structuredClone(event)),
    journal: (save.journal ?? []).map((entry) => ({ ...entry })),
    gameOver: save.gameOver,
  }
}

/** Parse a stored save, rejecting anything malformed or from another version. */
export function parseSave(json: string): SaveFile | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const candidate = parsed as Partial<SaveFile>
  if (candidate.version !== 1) return undefined
  if (!Array.isArray(candidate.entities)) return undefined
  if (!Array.isArray(candidate.waterCells) || candidate.waterCells.length !== WATER_COLS * WATER_ROWS) {
    return undefined
  }
  if (typeof candidate.savedAtMs !== 'number' || typeof candidate.time !== 'number') return undefined
  if (typeof candidate.coins !== 'number' || typeof candidate.rngState !== 'number') return undefined
  if (!Number.isFinite(candidate.nextEntityId) || (candidate.nextEntityId as number) < 1) return undefined
  if (typeof candidate.unlocks !== 'object' || candidate.unlocks === null) return undefined
  if (!candidate.waterCells.every((cell) => Number.isFinite(cell))) return undefined
  if (!candidate.entities.every((entity) => Number.isFinite(entity?.id))) return undefined
  if (candidate.pendingEvents !== undefined && !Array.isArray(candidate.pendingEvents)) {
    return undefined
  }
  if (candidate.journal !== undefined && !Array.isArray(candidate.journal)) return undefined
  return candidate as SaveFile
}
