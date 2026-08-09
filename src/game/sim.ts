import { generateName, randomGenome } from './genome'
import {
  fishPrice,
  TUNING,
  type Entity,
  type GameEvent,
  type OfflineSummary,
  type StepReport,
  type UiNotification,
} from './model'
import { serialize, type SaveFile } from './save'
import {
  createFreshGame,
  livingFish,
  recordJournal,
  removeEntity,
  spawnFish,
  spawnPellet,
  takenNames,
  type GameReadModel,
  type GameState,
} from './state'
import { stepTick, type SimulationMode } from './systems'
import { clearPollutionNear } from './water'

export type { OfflineSummary, StepReport, UiNotification } from './model'
export type { SimulationMode } from './systems'

/** Why a player intent was refused. Exhaustive, so the UI must decide a
 * presentation for every failure rather than reading mutable state after
 * the fact. */
export type ActionFailure = 'gameOver' | 'unaffordable' | 'unowned' | 'unavailable' | 'atCapacity'

export type ActionResult<T = void> =
  | { ok: true; value: T; notifications: UiNotification[] }
  | { ok: false; reason: ActionFailure }

/** What one advance returned: facts for aggregation/policy plus the
 * intentional player-facing notices it produced. */
export type AdvanceResult = {
  report: StepReport
  notifications: UiNotification[]
}

/** Project the systems' internal event collector into the typed advance
 * outcome. Exhaustive: a new event variant fails to compile until a policy
 * decision is made here. */
function projectEvents(events: GameEvent[]): AdvanceResult {
  const report: StepReport = { births: [], deaths: [], gameOver: false }
  const notifications: UiNotification[] = []
  for (const event of events) {
    switch (event.type) {
      case 'toast':
        notifications.push({ tone: event.tone, message: event.message })
        break
      case 'birth':
        report.births.push(event.name)
        break
      case 'death':
        report.deaths.push(event.name)
        break
      case 'gameOver':
        report.gameOver = true
        break
      default:
        event satisfies never
    }
  }
  return { report, notifications }
}

/** A tiny guard against floating-point noise near an exact tick boundary,
 * far smaller than any real elapsed-time difference this simulation cares
 * about (the quantum itself is ~0.033s/0.017s). Without it, summing the
 * same total elapsed time through different call sizes can round a hair
 * below vs. above a tick boundary and silently disagree by one tick. */
const TICK_BOUNDARY_EPSILON = 1e-9

/** A domain shop offer: what is purchasable and why it might not be. Labels
 * and descriptions are the UI's to own (see hud.ts). */
export type ShopOffer = {
  id: 'siphon' | 'feeder' | 'fish' | 'starterFish'
  cost: number
  affordable: boolean
  /** Fish offer only: the tank cannot responsibly hold another resident. */
  atCapacity?: boolean
}

export type ShopOfferId = ShopOffer['id']

/**
 * Facade over the ECS state: the runtime advances it from the frame loop,
 * issues player intents, and reads the GameReadModel for rendering.
 * All rules live in the systems; intents only validate and apply changes
 * a player is allowed to make. Constructing a GameSim transfers ownership of
 * the GameState into the core — from then on, outsiders only read.
 */
export class GameSim {
  private readonly state: GameState

  /** The read-only window for the runtime, renderer, HUD, and devtools. */
  get read(): GameReadModel {
    return this.state
  }

  /** Snapshot the whole session for persistence. */
  toSave(savedAtMs: number): SaveFile {
    return serialize(this.state, savedAtMs)
  }

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
  advanceElapsed(seconds: number, mode: SimulationMode): AdvanceResult {
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
    return projectEvents(this.state.events.splice(0, this.state.events.length))
  }

  /**
   * Catch up after the page was closed or hidden: slowed and capped, with
   * deterioration clamped and death impossible. Returns the summary for the
   * "while you were away" panel directly — nothing round-trips through a
   * queue. The caller decides how to announce it.
   */
  advanceOffline(awaySeconds: number): OfflineSummary {
    const simulatedSeconds = Math.min(
      awaySeconds * TUNING.offlineRate,
      TUNING.offlineMaxSimSeconds,
    )
    const coinsBefore = this.state.coins
    const { report, notifications } = this.advanceElapsed(simulatedSeconds, 'offline')
    const summary: OfflineSummary = {
      awaySeconds,
      simulatedSeconds,
      coinsEarned: this.state.coins - coinsBefore,
      births: report.births,
      developments: notifications
        .filter((notification) => notification.tone === 'development')
        .map((notification) => notification.message),
      companion: livingFish(this.state)[0]?.fish!.name,
    }
    if (summary.simulatedSeconds > 10) {
      recordJournal(
        this.state,
        'away',
        `The tank drifted on without you — ◉${Math.floor(summary.coinsEarned)} collected.`,
      )
    }
    return summary
  }

  /** Worst water cell, for the HUD's diegetic quality pill. */
  worstPollution(): number {
    return Math.max(...this.state.water.cells)
  }

  incomePerSecond(): number {
    const totalWeight = livingFish(this.state).reduce((sum, e) => sum + e.fish!.weight, 0)
    return TUNING.incomeFloor + TUNING.incomePerGram * totalWeight
  }

  /** Drop a food pellet into the water near x. */
  dropFood(x: number): ActionResult {
    if (this.state.gameOver) return { ok: false, reason: 'gameOver' }
    if (this.state.coins < TUNING.pelletCost) return { ok: false, reason: 'unaffordable' }
    this.state.coins -= TUNING.pelletCost
    this.state.unlocks.fedOnce = true
    spawnPellet(this.state, x)
    return { ok: true, value: undefined, notifications: [] }
  }

  /**
   * Use the gravel siphon at a point: removes waste and spoiled food within
   * reach and pulls some green out of the local water. The value is how many
   * bits of debris were removed.
   */
  siphonAt(x: number, y: number): ActionResult<number> {
    if (!this.state.ownsSiphon) return { ok: false, reason: 'unowned' }
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
    return { ok: true, value: removed, notifications: [] }
  }

  shopOffers(): ShopOffer[] {
    const offers: ShopOffer[] = []
    const coins = this.state.coins
    if (this.state.unlocks.siphonInShop && !this.state.ownsSiphon) {
      offers.push({
        id: 'siphon',
        cost: TUNING.siphonCost,
        affordable: coins >= TUNING.siphonCost,
      })
    }
    if (this.state.unlocks.feederInShop && !this.state.ownsFeeder) {
      offers.push({
        id: 'feeder',
        cost: TUNING.feederCost,
        affordable: coins >= TUNING.feederCost,
      })
    }
    if (this.state.unlocks.fishInShop && !this.state.gameOver) {
      const cost = fishPrice(this.state.fishPurchased)
      const population =
        this.state.world.with('fish').entities.length + this.state.world.with('egg').entities.length
      const atCapacity = population >= TUNING.maxPopulation
      offers.push({
        id: 'fish',
        cost,
        affordable: !atCapacity && coins >= cost,
        atCapacity,
      })
    }
    if (this.state.gameOver) {
      offers.push({
        id: 'starterFish',
        cost: TUNING.starterFishCost,
        affordable: coins >= TUNING.starterFishCost,
      })
    }
    return offers
  }

  buy(offerId: ShopOfferId): ActionResult {
    const offer = this.shopOffers().find((candidate) => candidate.id === offerId)
    if (!offer) return { ok: false, reason: 'unavailable' }
    if (offer.atCapacity) return { ok: false, reason: 'atCapacity' }
    if (!offer.affordable) return { ok: false, reason: 'unaffordable' }
    this.state.coins -= offer.cost
    const notifications: UiNotification[] = []
    if (offer.id === 'siphon') {
      this.state.ownsSiphon = true
      notifications.push({
        tone: 'info',
        message: 'Gravel siphon acquired. Select it, then hold and sweep the sand to clean.',
      })
      recordJournal(this.state, 'purchase', `Bought a gravel siphon for ◉${offer.cost}.`)
    } else if (offer.id === 'feeder') {
      this.state.ownsFeeder = true
      notifications.push({
        tone: 'info',
        message: 'Drip feeder installed above the tank. It spends a coin per pellet.',
      })
      recordJournal(this.state, 'purchase', `Installed a drip feeder for ◉${offer.cost}.`)
    } else if (offer.id === 'fish') {
      this.state.fishPurchased += 1
      const genome = randomGenome(this.state.rng, this.state.rng.range(18, 34))
      const fish = spawnFish(this.state, {
        genome,
        name: generateName(this.state.rng, takenNames(this.state)),
        weight: this.state.rng.range(1.5, 3),
        generation: 1,
        hunger: 0.15, // arrives well fed; a crisis on arrival reads as a rip-off
      })
      notifications.push({ tone: 'info', message: `${fish.fish!.name} has joined the tank.` })
      recordJournal(this.state, 'arrival', `${fish.fish!.name} joined the tank for ◉${offer.cost}.`)
    } else {
      this.state.gameOver = false
      const fish = spawnFish(this.state, {
        genome: randomGenome(this.state.rng, TUNING.starterMaxWeight),
        name: generateName(this.state.rng, takenNames(this.state)),
        weight: TUNING.starterWeight,
        generation: 1,
        hunger: 0.5,
      })
      notifications.push({ tone: 'info', message: `${fish.fish!.name} settles into the quiet tank.` })
      recordJournal(this.state, 'arrival', `${fish.fish!.name} settled into the quiet tank — a new beginning.`)
    }
    return { ok: true, value: undefined, notifications }
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
