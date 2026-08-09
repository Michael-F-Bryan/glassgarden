import { generateName, randomGenome } from './genome'
import {
  fishPrice,
  TUNING,
  type Entity,
  type GameEvent,
  type OfflineSummary,
} from './model'
import {
  createFreshGame,
  emit,
  livingFish,
  recordJournal,
  removeEntity,
  spawnFish,
  spawnPellet,
  takenNames,
  type GameState,
} from './state'
import { stepTick, type SimulationMode } from './systems'
import { clearPollutionNear } from './water'

export type { OfflineSummary } from './model'
export type { SimulationMode } from './systems'

/** A tiny guard against floating-point noise near an exact tick boundary,
 * far smaller than any real elapsed-time difference this simulation cares
 * about (the quantum itself is ~0.033s/0.017s). Without it, summing the
 * same total elapsed time through different call sizes can round a hair
 * below vs. above a tick boundary and silently disagree by one tick. */
const TICK_BOUNDARY_EPSILON = 1e-9

export type ShopItem = {
  id: 'siphon' | 'feeder' | 'fish' | 'starterFish'
  label: string
  description: string
  cost: number
  affordable: boolean
}

/**
 * Facade over the ECS state: the UI calls step() from its animation loop,
 * issues player intents, and reads the state snapshot for rendering.
 * All rules live in the systems; intents only validate and apply changes
 * a player is allowed to make.
 */
export class GameSim {
  readonly state: GameState

  /**
   * Sub-tick remainder of elapsed time not yet simulated, in seconds —
   * always within [0, TUNING.simTickSeconds). This is deliberately NOT part
   * of the save format: a save captures whole-tick state only, so at most
   * one quantum of elapsed time is silently dropped across a save/load
   * cycle. Resuming a save starts a fresh accumulator at zero.
   */
  private accumulator = 0

  constructor(state: GameState) {
    this.state = state
  }

  static fresh(seed: number): GameSim {
    return new GameSim(createFreshGame(seed))
  }

  /**
   * The only path into the simulation's fixed tick. Accumulates `seconds`
   * of elapsed time and runs as many whole `TUNING.simTickSeconds` ticks as
   * have accrued, carrying any leftover remainder into the next call. The
   * quantum is identical in every mode — mode selects death/deterioration
   * policy (see `SimulationMode`), never how elapsed time is partitioned,
   * so equal elapsed time always reaches the same state regardless of how
   * a caller chops it up.
   */
  advanceElapsed(seconds: number, mode: SimulationMode): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError(
        `advanceElapsed: seconds must be a finite, non-negative number, got ${seconds}`,
      )
    }
    this.accumulator += seconds
    const quantum = TUNING.simTickSeconds
    // Compute the whole-tick count in one division rather than repeatedly
    // subtracting the quantum: repeated subtraction's rounding error grows
    // with the number of subtractions, which — right at an exact tick
    // boundary — can make a large single call (few, large subtractions)
    // disagree with many small calls (many, tiny subtractions) by one tick.
    const ticks = Math.floor(this.accumulator / quantum + TICK_BOUNDARY_EPSILON)
    for (let i = 0; i < ticks; i += 1) {
      stepTick(this.state, quantum, mode)
    }
    this.accumulator -= ticks * quantum
  }

  /**
   * @deprecated Call `advanceElapsed(realDt, visible ? 'visible' : 'background')` directly.
   */
  step(realDt: number, visible: boolean): void {
    this.advanceElapsed(realDt, visible ? 'visible' : 'background')
  }

  /**
   * Catch up after the page was closed or hidden: slowed and capped, with
   * deterioration clamped and death impossible. Returns a summary for the
   * "while you were away" panel; development toasts are re-queued so they
   * are announced when the player is back.
   */
  advanceOffline(awaySeconds: number): OfflineSummary {
    const simulatedSeconds = Math.min(
      awaySeconds * TUNING.offlineRate,
      TUNING.offlineMaxSimSeconds,
    )
    const coinsBefore = this.state.coins
    const pendingBefore = this.state.events.splice(0, this.state.events.length)

    this.advanceElapsed(simulatedSeconds, 'offline')

    const awayEvents = this.state.events.splice(0, this.state.events.length)
    const births = awayEvents.filter((e) => e.type === 'birth').map((e) => e.name)
    const developments = awayEvents
      .filter((e): e is Extract<GameEvent, { type: 'toast' }> => e.type === 'toast')
      .filter((e) => e.tone === 'development')
      .map((e) => e.message)
    this.state.events.push(...pendingBefore)
    for (const message of developments) {
      emit(this.state, { type: 'toast', tone: 'development', message })
    }
    const summary: OfflineSummary = {
      awaySeconds,
      simulatedSeconds,
      coinsEarned: this.state.coins - coinsBefore,
      births,
      developments,
      companion: livingFish(this.state)[0]?.fish!.name,
    }
    // Delivered as an event (and therefore persisted with pending events) so
    // the "while you were away" panel survives an immediate remount or reload.
    if (summary.simulatedSeconds > 10) {
      emit(this.state, { type: 'awaySummary', summary })
      recordJournal(
        this.state,
        'away',
        `The tank drifted on without you — ◉${Math.floor(summary.coinsEarned)} collected.`,
      )
    }
    return summary
  }

  drainEvents(): GameEvent[] {
    return this.state.events.splice(0, this.state.events.length)
  }

  /** Worst water cell, for the HUD's diegetic quality pill. */
  worstPollution(): number {
    return Math.max(...this.state.water.cells)
  }

  incomePerSecond(): number {
    const totalWeight = livingFish(this.state).reduce((sum, e) => sum + e.fish!.weight, 0)
    return TUNING.incomeFloor + TUNING.incomePerGram * totalWeight
  }

  /** Drop a food pellet into the water near x. Returns false if unaffordable. */
  dropFood(x: number): boolean {
    if (this.state.gameOver || this.state.coins < TUNING.pelletCost) return false
    this.state.coins -= TUNING.pelletCost
    this.state.unlocks.fedOnce = true
    spawnPellet(this.state, x)
    return true
  }

  /**
   * Use the gravel siphon at a point: removes waste and spoiled food within
   * reach and pulls some green out of the local water. Returns how many bits
   * of debris were removed, or undefined when the player has no siphon.
   */
  siphonAt(x: number, y: number): number | undefined {
    if (!this.state.ownsSiphon) return undefined
    let removed = 0
    const debris = [
      ...this.state.world.with('waste'),
      ...[...this.state.world.with('food')].filter((e) => e.food.spoiled),
    ]
    for (const entity of debris) {
      const distance = Math.hypot(entity.position.x - x, entity.position.y - y)
      if (distance <= TUNING.siphonRadius) {
        removeEntity(this.state, entity)
        removed += 1
      }
    }
    clearPollutionNear(this.state.water, { x, y }, TUNING.siphonPollutionClear)
    return removed
  }

  shopItems(): ShopItem[] {
    const items: ShopItem[] = []
    const coins = this.state.coins
    if (this.state.unlocks.siphonInShop && !this.state.ownsSiphon) {
      items.push({
        id: 'siphon',
        label: 'Gravel siphon',
        description: 'Clean up droppings and spoiled food before they foul the water.',
        cost: TUNING.siphonCost,
        affordable: coins >= TUNING.siphonCost,
      })
    }
    if (this.state.unlocks.feederInShop && !this.state.ownsFeeder) {
      items.push({
        id: 'feeder',
        label: 'Drip feeder',
        description:
          'Drops a pellet for hungry fish while you are busy elsewhere. Uses your coins.',
        cost: TUNING.feederCost,
        affordable: coins >= TUNING.feederCost,
      })
    }
    if (this.state.unlocks.fishInShop && !this.state.gameOver) {
      const cost = fishPrice(this.state.fishPurchased)
      const population =
        this.state.world.with('fish').entities.length + this.state.world.with('egg').entities.length
      const atCapacity = population >= TUNING.maxPopulation
      items.push({
        id: 'fish',
        label: 'Young glimmerfin',
        description: atCapacity
          ? 'The tank is at capacity — no responsible shop would add another fish.'
          : 'A new resident for the tank. Each one is harder to source than the last.',
        cost,
        affordable: !atCapacity && coins >= cost,
      })
    }
    if (this.state.gameOver) {
      items.push({
        id: 'starterFish',
        label: 'Starter glimmerfin',
        description: 'Begin again. Your coins and equipment remain yours.',
        cost: TUNING.starterFishCost,
        affordable: coins >= TUNING.starterFishCost,
      })
    }
    return items
  }

  buy(itemId: ShopItem['id']): boolean {
    const item = this.shopItems().find((candidate) => candidate.id === itemId)
    if (!item || !item.affordable) return false
    this.state.coins -= item.cost
    if (item.id === 'siphon') {
      this.state.ownsSiphon = true
      emit(this.state, {
        type: 'toast',
        tone: 'info',
        message: 'Gravel siphon acquired. Select it, then hold and sweep the sand to clean.',
      })
      recordJournal(this.state, 'purchase', `Bought a gravel siphon for ◉${item.cost}.`)
    } else if (item.id === 'feeder') {
      this.state.ownsFeeder = true
      emit(this.state, {
        type: 'toast',
        tone: 'info',
        message: 'Drip feeder installed above the tank. It spends a coin per pellet.',
      })
      recordJournal(this.state, 'purchase', `Installed a drip feeder for ◉${item.cost}.`)
    } else if (item.id === 'fish') {
      this.state.fishPurchased += 1
      const genome = randomGenome(this.state.rng, this.state.rng.range(18, 34))
      const fish = spawnFish(this.state, {
        genome,
        name: generateName(this.state.rng, takenNames(this.state)),
        weight: this.state.rng.range(1.5, 3),
        generation: 1,
        hunger: 0.15, // arrives well fed; a crisis on arrival reads as a rip-off
      })
      emit(this.state, {
        type: 'toast',
        tone: 'info',
        message: `${fish.fish!.name} has joined the tank.`,
      })
      recordJournal(this.state, 'arrival', `${fish.fish!.name} joined the tank for ◉${item.cost}.`)
    } else {
      this.state.gameOver = false
      const fish = spawnFish(this.state, {
        genome: randomGenome(this.state.rng, TUNING.starterMaxWeight),
        name: generateName(this.state.rng, takenNames(this.state)),
        weight: TUNING.starterWeight,
        generation: 1,
        hunger: 0.5,
      })
      emit(this.state, {
        type: 'toast',
        tone: 'info',
        message: `${fish.fish!.name} settles into the quiet tank.`,
      })
      recordJournal(this.state, 'arrival', `${fish.fish!.name} settled into the quiet tank — a new beginning.`)
    }
    return true
  }

  fishAt(x: number, y: number): Entity | undefined {
    let best: Entity | undefined
    let bestDistance = Infinity
    for (const entity of this.state.world.with('fish')) {
      const distance = Math.hypot(entity.position.x - x, entity.position.y - y)
      const reach = Math.max(30, entity.fish.weight * 2)
      if (distance < reach && distance < bestDistance) {
        best = entity
        bestDistance = distance
      }
    }
    return best
  }
}
