import {
  capacityFor,
  FEEDER_PROFILES,
  FILTER_PROFILES,
  FOOD_PROFILES,
  foodProfile,
  HABITAT_PROFILES,
  nextFeederStage,
  nextFilterStage,
  nextFoodStage,
  nextHabitatStage,
  type FeederStage,
  type FoodStage,
} from './equipment'
import { generateName, randomGenome } from './genome'
import {
  fishPrice,
  TUNING,
  type DevelopmentId,
  type Entity,
  type GameEvent,
  type OfflineSummary,
  type StepReport,
  type UiNotification,
} from './model'
import { serialize, type SaveFile } from './save'
import {
  createFreshGame,
  discover,
  hasDiscovered,
  livingFish,
  recordJournal,
  removeEntity,
  residentCount,
  spawnFish,
  spawnPellet,
  takenNames,
  tankBounds,
  type GameReadModel,
  type GameState,
} from './state'
import { stepTick, type SimulationMode } from './systems'
import { averagePollution, cellIndexAt, clearPollutionNear } from './water'

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
  id:
    | 'siphon'
    | 'crumbFood'
    | 'heartyFood'
    | 'dripFeeder'
    | 'twinHopper'
    | 'rotaryFeeder'
    | 'spongeFilter'
    | 'habitatExpansion'
    | 'fish'
    | 'starterFish'
  cost: number
  affordable: boolean
  /** Fish offer only: the tank cannot responsibly hold another resident. */
  atCapacity?: boolean
}

export type ShopOfferId = ShopOffer['id']

type FeederOfferId = 'dripFeeder' | 'twinHopper' | 'rotaryFeeder'
type FeederStageName = Exclude<FeederStage, 'none'>
type FoodOfferId = 'crumbFood' | 'heartyFood'
type FoodStageName = Exclude<FoodStage, 'flake'>

/** The food ladder's rungs, as one table: which offer sells each rung, which
 * hidden development reveals it, and what the tin looks like afterwards. */
const FOOD_OFFER_IDS: Record<FoodStageName, FoodOfferId> = {
  crumb: 'crumbFood',
  pellet: 'heartyFood',
}

const FOOD_STAGE_BY_OFFER: Record<FoodOfferId, FoodStageName> = {
  crumbFood: 'crumb',
  heartyFood: 'pellet',
}

const FOOD_DEVELOPMENTS: Record<FoodStageName, DevelopmentId> = {
  crumb: 'crumbFoodOffered',
  pellet: 'heartyFoodOffered',
}

const FOOD_PURCHASE_COPY: Record<FoodStageName, { notice: string; name: string }> = {
  crumb: {
    name: 'crumbs',
    notice:
      'Coarse crumbs fill the food tin now — a pinch goes properly further than the flakes did, and costs a little more.',
  },
  pellet: {
    name: 'hearty pellets',
    notice:
      'Hearty pellets fill the food tin now — one drop makes a proper meal where crumbs only took the edge off.',
  },
}

/** Each feeder stage's shop id, the development that reveals it, and the
 * copy shown when it is installed — one table instead of a branch per tier. */
const FEEDER_OFFER_IDS: Record<FeederStageName, FeederOfferId> = {
  drip: 'dripFeeder',
  twin: 'twinHopper',
  rotary: 'rotaryFeeder',
}

const FEEDER_STAGE_BY_OFFER: Record<FeederOfferId, FeederStageName> = {
  dripFeeder: 'drip',
  twinHopper: 'twin',
  rotaryFeeder: 'rotary',
}

const FEEDER_DEVELOPMENTS: Record<FeederStageName, DevelopmentId> = {
  drip: 'dripFeederOffered',
  twin: 'twinHopperOffered',
  rotary: 'rotaryFeederOffered',
}

const FEEDER_LABELS: Record<FeederStageName, string> = {
  drip: 'A drip feeder',
  twin: 'A twin hopper',
  rotary: 'A rotary feeder',
}

const FEEDER_PURCHASE_COPY: Record<FeederStageName, string> = {
  drip:
    'Drip feeder installed above the tank. It uses the current food and pays its price for every drop.',
  twin:
    'The twin hopper takes over — two chambers, twice the rounds. It still uses the current food and pays for every drop.',
  rotary:
    'The rotary feeder turns steadily above the tank, enough for a full house. It still uses the current food and pays for every drop.',
}

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
      companion: livingFish(this.state)[0]?.resident.name,
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

  /** Worst single water cell — the sand under a pile of droppings. */
  worstPollution(): number {
    return Math.max(...this.state.water.cells)
  }

  /**
   * Overall murk, for the HUD's diegetic quality pill. Averaged rather than
   * worst-cell: debris resting on the sand pins one cell at maximum in any
   * mature tank, which would leave the meter reading "foul" forever and hide
   * the difference filtration makes. This matches what the renderer tints.
   */
  murkiness(): number {
    return averagePollution(this.state.water)
  }

  incomePerSecond(): number {
    const totalWeight = livingFish(this.state).reduce((sum, e) => sum + e.physiology.weight, 0)
    return TUNING.incomeFloor + TUNING.incomePerGram * totalWeight
  }

  /** Drop a morsel of the owned food into the water near x, by hand. */
  dropFood(x: number): ActionResult<number> {
    if (this.state.gameOver) return { ok: false, reason: 'gameOver' }
    const unitCost = foodProfile(this.state.equipment.food).unitCost
    if (this.state.coins < unitCost) return { ok: false, reason: 'unaffordable' }
    this.state.coins -= unitCost
    discover(this.state, 'fedOnce')
    spawnPellet(this.state, x, { manual: true })
    return { ok: true, value: unitCost, notifications: [] }
  }

  /**
   * Use the gravel siphon at a point: removes waste, spoiled food, and fresh
   * food that has settled on the sand (gone, not refunded — a real gravel
   * vac cannot tell dinner from debris), and pulls some green out of the
   * local water. Food still falling or drifting mid-water is left alone.
   * The value is how many bits of debris were removed.
   *
   * A sweep only earns a cleaning credit when it did something a keeper
   * would recognise as work — lifted debris, or measurably cleared the local
   * water — and at most once per cell per `siphonCreditCooldownSeconds`. The
   * gesture pulses several times a second while held, so without both rules
   * a two-second hold over clean sand would reveal the sponge filter.
   */
  siphonAt(x: number, y: number): ActionResult<number> {
    if (!this.state.equipment.siphon) return { ok: false, reason: 'unowned' }
    const bounds = tankBounds(this.state)
    const cell = cellIndexAt({ x, y }, bounds)
    const murkBefore = this.state.water.cells[cell]

    let removed = 0
    const debris = [
      ...this.state.world.with('waste'),
      ...[...this.state.world.with('food')].filter((e) => e.food.spoiled || e.food.restingOnSand),
    ]
    for (const entity of debris) {
      const distance = Math.hypot(entity.position.x - x, entity.position.y - y)
      if (distance <= TUNING.siphonRadius) {
        removeEntity(this.state, entity)
        removed += 1
      }
    }
    clearPollutionNear(this.state.water, { x, y }, TUNING.siphonPollutionClear, bounds)

    const cleared = murkBefore - this.state.water.cells[cell]
    const didWork = removed > 0 || cleared >= TUNING.siphonCreditPollutionDrop
    const lastCredit = this.state.siphonCreditAt.get(cell)
    const settled =
      lastCredit === undefined ||
      this.state.time - lastCredit >= TUNING.siphonCreditCooldownSeconds
    if (didWork && settled) {
      this.state.care.cleaningCredits += 1
      this.state.siphonCreditAt.set(cell, this.state.time)
    }
    return { ok: true, value: removed, notifications: [] }
  }

  shopOffers(): ShopOffer[] {
    const offers: ShopOffer[] = []
    const coins = this.state.coins
    const { equipment } = this.state
    if (hasDiscovered(this.state, 'siphonOffered') && !equipment.siphon) {
      offers.push({
        id: 'siphon',
        cost: TUNING.siphonCost,
        affordable: coins >= TUNING.siphonCost,
      })
    }
    // Exactly one food offer at a time: the next rung up, once its own
    // hidden development has been revealed.
    const foodUpgrade = nextFoodStage(equipment.food)
    if (foodUpgrade && hasDiscovered(this.state, FOOD_DEVELOPMENTS[foodUpgrade])) {
      const profile = FOOD_PROFILES[foodUpgrade]
      offers.push({
        id: FOOD_OFFER_IDS[foodUpgrade],
        cost: profile.cost,
        affordable: coins >= profile.cost,
      })
    }
    // Exactly one feeder offer at a time: the next stage up, once its own
    // hidden development has been revealed.
    const feederUpgrade = nextFeederStage(equipment.feeder)
    if (feederUpgrade && hasDiscovered(this.state, FEEDER_DEVELOPMENTS[feederUpgrade])) {
      const profile = FEEDER_PROFILES[feederUpgrade]
      offers.push({
        id: FEEDER_OFFER_IDS[feederUpgrade],
        cost: profile.cost,
        affordable: coins >= profile.cost,
      })
    }
    const filterUpgrade = nextFilterStage(equipment.filter)
    if (filterUpgrade && hasDiscovered(this.state, 'spongeFilterOffered')) {
      const profile = FILTER_PROFILES[filterUpgrade]
      offers.push({
        id: 'spongeFilter',
        cost: profile.cost,
        affordable: coins >= profile.cost,
      })
    }
    const habitatUpgrade = nextHabitatStage(equipment.habitat)
    if (habitatUpgrade && hasDiscovered(this.state, 'habitatExpansionOffered')) {
      const profile = HABITAT_PROFILES[habitatUpgrade]
      offers.push({
        id: 'habitatExpansion',
        cost: profile.cost,
        affordable: coins >= profile.cost,
      })
    }
    if (hasDiscovered(this.state, 'fishOffered') && !this.state.gameOver) {
      const cost = fishPrice(this.state.fishPurchased)
      const population = residentCount(this.state) + this.state.world.with('egg').entities.length
      const atCapacity = population >= capacityFor(equipment.habitat)
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
      this.state.equipment.siphon = true
      notifications.push({
        tone: 'info',
        message: 'Gravel siphon acquired. Select it, then hold and sweep the sand to clean.',
      })
      recordJournal(this.state, 'purchase', `Bought a gravel siphon for ◉${offer.cost}.`)
    } else if (offer.id === 'crumbFood' || offer.id === 'heartyFood') {
      const stage = FOOD_STAGE_BY_OFFER[offer.id]
      const copy = FOOD_PURCHASE_COPY[stage]
      this.state.equipment.food = stage
      notifications.push({ tone: 'info', message: copy.notice })
      recordJournal(this.state, 'purchase', `Switched the tank to ${copy.name} for ◉${offer.cost}.`)
    } else if (offer.id === 'dripFeeder' || offer.id === 'twinHopper' || offer.id === 'rotaryFeeder') {
      const stage = FEEDER_STAGE_BY_OFFER[offer.id]
      this.state.equipment.feeder = stage
      // Each tier earns its own upgrade: the strain that revealed this one is
      // spent here rather than carrying over to the next.
      this.state.care.feederStrainSeconds = 0
      this.state.feederLastDropAt = this.state.time
      notifications.push({ tone: 'info', message: FEEDER_PURCHASE_COPY[stage] })
      recordJournal(
        this.state,
        'purchase',
        `Installed ${FEEDER_LABELS[stage].toLowerCase()} for ◉${offer.cost}.`,
      )
    } else if (offer.id === 'habitatExpansion') {
      this.state.equipment.habitat = 'expanded'
      notifications.push({
        tone: 'development',
        message:
          'The fitters have been and gone: your aquarium opens into a far larger habitat — new ground to the east, fresh kelp taking root, and room for a real community.',
      })
      recordJournal(
        this.state,
        'purchase',
        `The habitat was expanded for ◉${offer.cost} — room for ${capacityFor('expanded')} residents.`,
      )
    } else if (offer.id === 'spongeFilter') {
      this.state.equipment.filter = 'sponge'
      notifications.push({
        tone: 'info',
        message:
          'The sponge filter hums away in the corner, working the water. It clogs as debris piles up, so keep the sand clear.',
      })
      recordJournal(this.state, 'purchase', `Installed a sponge filter for ◉${offer.cost}.`)
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
      notifications.push({ tone: 'info', message: `${fish.resident.name} has joined the tank.` })
      recordJournal(
        this.state,
        'arrival',
        `${fish.resident.name} joined the tank for ◉${offer.cost}.`,
      )
    } else {
      this.state.gameOver = false
      const fish = spawnFish(this.state, {
        genome: randomGenome(this.state.rng, TUNING.starterMaxWeight),
        name: generateName(this.state.rng, takenNames(this.state)),
        weight: TUNING.starterWeight,
        generation: 1,
        hunger: 0.5,
      })
      notifications.push({
        tone: 'info',
        message: `${fish.resident.name} settles into the quiet tank.`,
      })
      recordJournal(
        this.state,
        'arrival',
        `${fish.resident.name} settled into the quiet tank — a new beginning.`,
      )
    }
    return { ok: true, value: undefined, notifications }
  }

  fishAt(x: number, y: number): Entity | undefined {
    let best: Entity | undefined
    let bestDistance = Infinity
    for (const entity of this.state.world.with('resident', 'physiology')) {
      const distance = Math.hypot(entity.position.x - x, entity.position.y - y)
      const reach = Math.max(30, entity.physiology.weight * 2)
      if (distance < reach && distance < bestDistance) {
        best = entity
        bestDistance = distance
      }
    }
    return best
  }
}
