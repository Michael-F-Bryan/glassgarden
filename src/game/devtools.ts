import { TANK, type GameEvent, type OfflineSummary, type Unlocks } from './model'
import { GameSim, type ShopItem } from './sim'
import { addEntity } from './state'

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
  shop: ShopItem[]
  pendingEvents: GameEvent[]
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

type DevToolsBindings = {
  getSim(): GameSim
  replaceSim(sim: GameSim): void
  getSpeed(): number
  setSpeed(speed: number): void
  save(): void
}

export function normaliseDevSpeed(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 1
  return Math.min(16, value)
}

export function createDevSnapshot(sim: GameSim, speed = 1): DevSnapshot {
  const state = sim.state
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
    fish: [...state.world.with('fish')]
      .sort((a, b) => a.id - b.id)
      .map((entity) => ({
        ...position(entity),
        name: entity.fish.name,
        weight: entity.fish.weight,
        hunger: entity.fish.hunger,
        sickness: entity.fish.sickness,
        health: entity.fish.health,
        generation: entity.fish.generation,
        parents: entity.fish.parents ? [...entity.fish.parents] : undefined,
        activity: entity.fish.activity.kind,
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
    shop: sim.shopItems().map((item) => ({ ...item })),
    pendingEvents: state.events.map((event) => structuredClone(event)),
  }
}

export function createDevScenario(name: DevScenario, seed = DEFAULT_DEV_SEED): GameSim {
  const sim = GameSim.fresh(seed)
  if (name === 'fresh') return sim

  const fish = [...sim.state.world.with('fish')][0]
  if (name === 'starving-rescuable') {
    fish.fish.hunger = 1
    fish.fish.health = 0.4
    fish.fish.activity = { kind: 'distress' }
    return sim
  }

  sim.state.coins = 100
  sim.state.ownsSiphon = true
  sim.state.unlocks.siphonInShop = true
  sim.state.unlocks.noticedPollution = true
  sim.state.water.cells.fill(0.4)
  fish.fish.sickness = 0.35
  for (const x of [360, 600, 840]) {
    addEntity(sim.state, {
      position: { x, y: TANK.sandTop - 6 },
      velocity: { x: 0, y: 0 },
      waste: { size: 2, restingOnSand: true },
    })
  }
  return sim
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
      const sim = bindings.getSim()
      const stepSeconds = 0.25
      for (let elapsed = 0; elapsed < seconds; elapsed += stepSeconds) {
        sim.step(Math.min(stepSeconds, seconds - elapsed), true)
      }
      bindings.save()
      return createDevSnapshot(sim, bindings.getSpeed())
    },
    simulateAway: (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new RangeError('away seconds must be a non-negative finite number')
      }
      const summary = bindings.getSim().advanceOffline(seconds)
      bindings.save()
      return summary
    },
  }
}
