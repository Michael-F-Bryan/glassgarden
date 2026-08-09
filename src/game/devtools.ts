import { TANK, type OfflineSummary, type Unlocks } from './model'
import { GameSim, type ShopOffer } from './sim'
import { addEntity, createFreshGame } from './state'

export const DEV_TOOLS_VERSION = 1 as const
export const DEFAULT_DEV_SEED = 42

export type DevScenario = 'fresh' | 'dirty-tank' | 'starving-rescuable'

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
  tank: typeof TANK
  time: number
  coins: number
  incomePerSecond: number
  ownsSiphon: boolean
  ownsFeeder: boolean
  gameOver: boolean
  unlocks: Unlocks
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
    tank: { ...TANK },
    time: state.time,
    coins: state.coins,
    incomePerSecond: sim.incomePerSecond(),
    ownsSiphon: state.ownsSiphon,
    ownsFeeder: state.ownsFeeder,
    gameOver: state.gameOver,
    unlocks: { ...state.unlocks },
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
        activity: entity.behaviour.activity.kind,
      })),
    food: [...state.world.with('food')]
      .sort((a, b) => a.id - b.id)
      .map((entity) => ({ ...position(entity), spoiled: entity.food.spoiled })),
    waste: [...state.world.with('waste')].sort((a, b) => a.id - b.id).map(position),
    eggs: [...state.world.with('egg')].sort((a, b) => a.id - b.id).map(position),
    water: {
      worstPollution: Math.max(...cells),
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

  const fish = [...state.world.with('physiology', 'behaviour')][0]
  if (name === 'starving-rescuable') {
    fish.physiology.hunger = 1
    fish.physiology.health = 0.4
    fish.behaviour.activity = { kind: 'distress' }
    return new GameSim(state)
  }

  state.coins = 100
  state.ownsSiphon = true
  state.unlocks.siphonInShop = true
  state.unlocks.noticedPollution = true
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
