import { World } from 'miniplex'

import { generateName, randomGenome } from './genome'
import {
  TANK,
  TUNING,
  type Entity,
  type Fish,
  type GameEvent,
  type Genome,
  type JournalEntry,
  type JournalKind,
  type Unlocks,
  type Vec2,
} from './model'
import { createRng, type Rng } from './rng'
import { createWaterGrid, type WaterGrid } from './water'

/**
 * The whole mutable simulation: the ECS world plus singleton resources.
 * Systems mutate this; the UI only reads snapshots and issues intents.
 */
export type GameState = {
  world: World<Entity>
  byId: Map<number, Entity>
  nextEntityId: number
  /** Sim seconds since the aquarium began. */
  time: number
  coins: number
  ownsSiphon: boolean
  ownsFeeder: boolean
  feederLastDropAt: number
  fishPurchased: number
  /** Names of the departed, kept so newcomers don't wear them. */
  retiredNames: string[]
  unlocks: Unlocks
  water: WaterGrid
  rng: Rng
  events: GameEvent[]
  /** The Tank Journal: a permanent, capped chronicle of the tank's life. */
  journal: JournalEntry[]
  gameOver: boolean
}

export function createState(seed: number): GameState {
  return {
    world: new World<Entity>(),
    byId: new Map(),
    nextEntityId: 1,
    time: 0,
    coins: TUNING.startingCoins,
    ownsSiphon: false,
    ownsFeeder: false,
    feederLastDropAt: 0,
    fishPurchased: 0,
    retiredNames: [],
    unlocks: {
      fedOnce: false,
      noticedGrowth: false,
      noticedPollution: false,
      siphonInShop: false,
      fishInShop: false,
      feederInShop: false,
      seenEgg: false,
    },
    water: createWaterGrid(),
    rng: createRng(seed),
    events: [],
    journal: [],
    gameOver: false,
  }
}

export function recordJournal(state: GameState, kind: JournalKind, message: string): void {
  state.journal.push({ atSim: state.time, kind, message })
  if (state.journal.length > TUNING.journalMaxEntries) state.journal.shift()
}

export function addEntity(state: GameState, entity: Omit<Entity, 'id'>): Entity {
  const withId = { ...entity, id: state.nextEntityId } as Entity
  state.nextEntityId += 1
  state.world.add(withId)
  state.byId.set(withId.id, withId)
  return withId
}

export function removeEntity(state: GameState, entity: Entity): void {
  state.world.remove(entity)
  state.byId.delete(entity.id)
}

export function emit(state: GameState, event: GameEvent): void {
  state.events.push(event)
}

export function livingFish(state: GameState): Entity[] {
  // id order, so callers iterate identically before and after a save/load.
  return [...state.world.with('fish')].sort((a, b) => a.id - b.id)
}

export function takenNames(state: GameState): Set<string> {
  const names = new Set<string>(state.retiredNames)
  for (const entity of state.world.with('fish')) names.add(entity.fish.name)
  return names
}

/** Drop a pellet into the water near x — shared by the player and the feeder. */
export function spawnPellet(state: GameState, x: number): Entity {
  return addEntity(state, {
    position: {
      x: Math.min(TANK.width - 20, Math.max(20, x + state.rng.range(-10, 10))),
      y: TANK.waterTop + 6,
    },
    velocity: { x: state.rng.range(-8, 8), y: 0 },
    food: {
      nutrition: TUNING.pelletNutrition,
      spoilsAt: state.time + TUNING.pelletSpoilSeconds,
      spoiled: false,
      restingOnSand: false,
    },
  })
}

export type SpawnFishOptions = {
  genome: Genome
  name: string
  weight: number
  generation: number
  parents?: [string, string]
  hatchedInMurkyWater?: boolean
  position?: Vec2
  hunger?: number
}

export function spawnFish(state: GameState, options: SpawnFishOptions): Entity {
  const position = options.position ?? {
    x: state.rng.range(TANK.width * 0.3, TANK.width * 0.7),
    y: state.rng.range(TANK.waterTop + 100, TANK.sandTop - 120),
  }
  const fish: Fish = {
    name: options.name,
    genome: options.genome,
    weight: options.weight,
    hunger: options.hunger ?? 0.2,
    sickness: 0,
    health: 1,
    ageSeconds: 0,
    generation: options.generation,
    parents: options.parents,
    hatchedInMurkyWater: options.hatchedInMurkyWater ?? false,
    digesting: 0,
    breedingCooldownUntil: 0,
    activity: { kind: 'wander', target: { ...position }, idleUntil: 0 },
    facing: state.rng.next() < 0.5 ? 1 : -1,
  }
  return addEntity(state, { position, velocity: { x: 0, y: 0 }, fish })
}

/** The opening scenario: a bare tank and one small, gently peckish fish. */
export function spawnStarterFish(state: GameState): Entity {
  const genome = randomGenome(state.rng, TUNING.starterMaxWeight)
  return spawnFish(state, {
    genome,
    name: generateName(state.rng, takenNames(state)),
    weight: TUNING.starterWeight,
    generation: 1,
    hunger: TUNING.starterHunger,
  })
}

export function createFreshGame(seed: number): GameState {
  const state = createState(seed)
  const starter = spawnStarterFish(state)
  emit(state, {
    type: 'toast',
    tone: 'info',
    message: `A small glimmerfin named ${starter.fish!.name} settles into your bare tank. A pinch of food would be a warm welcome.`,
  })
  recordJournal(state, 'arrival', `${starter.fish!.name} arrived in the bare tank.`)
  return state
}
