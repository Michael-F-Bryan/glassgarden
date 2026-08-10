import { tankBoundsFor, type Equipment } from './equipment'
import {
  TANK,
  type CareHistory,
  type DevelopmentId,
  type OfflineSummary,
  type TankBounds,
} from './model'
import { GameSim, type ShopOffer } from './sim'
import { generateName, randomGenome } from './genome'
import { addEntity, createFreshGame, spawnFish, takenNames } from './state'

export const DEV_TOOLS_VERSION = 1 as const
export const DEFAULT_DEV_SEED = 42

export type DevScenario =
  | 'fresh'
  | 'dirty-tank'
  | 'starving-rescuable'
  | 'growing-tank'
  | 'thriving-full-tank'

export type DevFishSnapshot = {
  id: number
  name: string
  x: number
  y: number
  weight: number
  hunger: number
  sickness: number
  health: number
  generation: number
  parents?: [string, string]
  /** Durable mate's name, once bonded. */
  partner?: string
  hatchedInMurkyWater: boolean
  activity: string
}

export type DevEntitySnapshot = {
  id: number
  x: number
  y: number
}

export type DevFoodSnapshot = DevEntitySnapshot & {
  spoiled: boolean
}

export type DevSnapshot = {
  version: typeof DEV_TOOLS_VERSION
  speed: number
  /** The live habitat's bounds — tests convert logical coordinates with this. */
  tank: TankBounds
  time: number
  coins: number
  incomePerSecond: number
  equipment: Equipment
  gameOver: boolean
  developments: DevelopmentId[]
  care: CareHistory
  fish: DevFishSnapshot[]
  food: DevFoodSnapshot[]
  waste: DevEntitySnapshot[]
  eggs: DevEntitySnapshot[]
  water: {
    worstPollution: number
    meanPollution: number
  }
  shop: ShopOffer[]
}

export type GlassgardenDevTools = {
  readonly version: typeof DEV_TOOLS_VERSION
  snapshot(): DevSnapshot
  reset(seed?: number): DevSnapshot
  loadScenario(name: DevScenario, seed?: number): DevSnapshot
  setSpeed(multiplier: number): number
  advance(seconds: number): DevSnapshot
  simulateAway(seconds: number): OfflineSummary
}

declare global {
  interface Window {
    __glassgardenDev?: GlassgardenDevTools
  }
}

/** Operations the runtime lends to the dev tools. Advancing time goes
 * through the runtime so notifications and away summaries reach the page
 * exactly as they would in normal play. */
type DevToolsBindings = {
  getSim(): GameSim
  replaceSim(sim: GameSim): void
  getSpeed(): number
  setSpeed(speed: number): void
  advanceElapsed(seconds: number): void
  simulateAway(seconds: number): OfflineSummary
  save(): void
}

export function normaliseDevSpeed(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 1
  return Math.min(16, value)
}

export function createDevSnapshot(sim: GameSim, speed = 1): DevSnapshot {
  const state = sim.read
  const cells = state.water.cells
  const meanPollution = cells.reduce((sum, cell) => sum + cell, 0) / cells.length
  const position = (entity: { id: number; position: { x: number; y: number } }) => ({
    id: entity.id,
    x: entity.position.x,
    y: entity.position.y,
  })

  return {
    version: DEV_TOOLS_VERSION,
    speed,
    tank: { ...tankBoundsFor(state.equipment.habitat) },
    time: state.time,
    coins: state.coins,
    incomePerSecond: sim.incomePerSecond(),
    equipment: { ...state.equipment },
    gameOver: state.gameOver,
    developments: [...state.developments].sort(),
    care: { ...state.care },
    fish: [...state.world.with('resident', 'physiology', 'behaviour')]
      .sort((a, b) => a.id - b.id)
      .map((entity) => ({
        ...position(entity),
        name: entity.resident.name,
        weight: entity.physiology.weight,
        hunger: entity.physiology.hunger,
        sickness: entity.physiology.sickness,
        health: entity.physiology.health,
        generation: entity.resident.generation,
        parents: entity.resident.parents ? ([...entity.resident.parents] as [string, string]) : undefined,
        partner:
          entity.breeding?.partnerId !== undefined
            ? state.byId.get(entity.breeding.partnerId)?.resident?.name
            : undefined,
        hatchedInMurkyWater: entity.resident.hatchedInMurkyWater,
        activity: entity.behaviour.activity.kind,
      })),
    food: [...state.world.with('food')]
      .sort((a, b) => a.id - b.id)
      .map((entity) => ({ ...position(entity), spoiled: entity.food.spoiled })),
    waste: [...state.world.with('waste')].sort((a, b) => a.id - b.id).map(position),
    eggs: [...state.world.with('egg')].sort((a, b) => a.id - b.id).map(position),
    water: {
      worstPollution: sim.worstPollution(),
      meanPollution,
    },
    shop: sim.shopOffers().map((offer) => ({ ...offer })),
  }
}

/** Scenarios shape the state before the sim takes ownership of it; after
 * `new GameSim(state)` nothing outside the core can mutate the tank. */
export function createDevScenario(name: DevScenario, seed = DEFAULT_DEV_SEED): GameSim {
  const state = createFreshGame(seed)
  if (name === 'fresh') return new GameSim(state)

  if (name === 'growing-tank') {
    // A tank that has already earned its early developments: several mature
    // residents, a siphon, a drip feeder, and coins to run them. This is the
    // "developed save" starting point for progression playtesting.
    state.coins = 900
    state.equipment.siphon = true
    state.equipment.feeder = 'drip'
    for (const id of [
      'fedOnce',
      'growthNoticed',
      'pollutionNoticed',
      'siphonOffered',
      'fishOffered',
      'dripFeederOffered',
    ] as const) {
      state.developments.add(id)
    }
    const starter = [...state.world.with('physiology')][0]
    starter.physiology.weight = 22
    for (let i = 0; i < 5; i += 1) {
      spawnFish(state, {
        genome: randomGenome(state.rng, state.rng.range(20, 30)),
        name: generateName(state.rng, takenNames(state)),
        weight: state.rng.range(16, 24),
        generation: 1,
        hunger: state.rng.range(0.2, 0.45),
      })
    }
    return new GameSim(state)
  }

  if (name === 'thriving-full-tank') {
    // A starter habitat at capacity and in good health: every earlier
    // development earned, top-tier equipment installed, water clean. This is
    // the boundary just before the habitat-expansion arc — advance it a few
    // stable minutes and the expansion should reveal itself.
    state.coins = 1_500
    state.equipment.siphon = true
    state.equipment.feeder = 'rotary'
    state.equipment.filter = 'sponge'
    for (const id of [
      'fedOnce',
      'growthNoticed',
      'pollutionNoticed',
      'siphonOffered',
      'fishOffered',
      'eggSeen',
      'dripFeederOffered',
      'twinHopperOffered',
      'rotaryFeederOffered',
      'spongeFilterOffered',
    ] as const) {
      state.developments.add(id)
    }
    const starter = [...state.world.with('physiology')][0]
    starter.physiology.weight = 24
    for (let i = 0; i < 11; i += 1) {
      spawnFish(state, {
        genome: randomGenome(state.rng, state.rng.range(22, 30)),
        name: generateName(state.rng, takenNames(state)),
        weight: state.rng.range(16, 26),
        generation: i < 6 ? 1 : 2,
        hunger: state.rng.range(0.2, 0.4),
      })
    }
    return new GameSim(state)
  }

  const fish = [...state.world.with('physiology', 'behaviour')][0]
  if (name === 'starving-rescuable') {
    fish.physiology.hunger = 1
    fish.physiology.health = 0.4
    fish.behaviour.activity = { kind: 'distress' }
    return new GameSim(state)
  }

  state.coins = 100
  state.equipment.siphon = true
  state.developments.add('siphonOffered')
  state.developments.add('pollutionNoticed')
  state.water.cells.fill(0.4)
  fish.physiology.sickness = 0.35
  for (const x of [360, 600, 840]) {
    addEntity(state, {
      position: { x, y: TANK.sandTop - 6 },
      velocity: { x: 0, y: 0 },
      waste: { size: 2, restingOnSand: true },
    })
  }
  return new GameSim(state)
}

export function createGlassgardenDevTools(bindings: DevToolsBindings): GlassgardenDevTools {
  const replace = (sim: GameSim) => {
    bindings.replaceSim(sim)
    bindings.save()
    return createDevSnapshot(sim, bindings.getSpeed())
  }

  return {
    version: DEV_TOOLS_VERSION,
    snapshot: () => createDevSnapshot(bindings.getSim(), bindings.getSpeed()),
    reset: (seed = DEFAULT_DEV_SEED) => replace(createDevScenario('fresh', seed)),
    loadScenario: (name, seed = DEFAULT_DEV_SEED) => replace(createDevScenario(name, seed)),
    setSpeed: (multiplier) => {
      const speed = normaliseDevSpeed(multiplier)
      bindings.setSpeed(speed)
      return speed
    },
    advance: (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) {
        throw new RangeError('advance seconds must be between 0 and 3600')
      }
      bindings.advanceElapsed(seconds)
      bindings.save()
      return createDevSnapshot(bindings.getSim(), bindings.getSpeed())
    },
    simulateAway: (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new RangeError('away seconds must be a non-negative finite number')
      }
      const summary = bindings.simulateAway(seconds)
      bindings.save()
      return summary
    },
  }
}
