/**
 * Domain model and tuning for the Glassgarden simulation.
 *
 * All gameplay numbers live in TUNING so pacing can be adjusted in one place
 * and referenced from tests. Distances are in logical tank pixels, weights in
 * grams, times in sim seconds, hunger/sickness/health in [0, 1].
 */

export type Vec2 = { x: number; y: number }

/** The playable volume: glass, waterline, and sand. Which bounds are live
 * depends on the owned habitat stage — see HABITAT_PROFILES (equipment.ts)
 * and tankBoundsFor(). */
export type TankBounds = {
  width: number
  height: number
  waterTop: number
  sandTop: number
}

/** The starter habitat's bounds (16:9). Also the fallback when no simulation
 * exists yet (empty HUD, presenter aspect). Live code should prefer
 * tankBoundsFor(equipment.habitat). */
export const TANK = {
  width: 1200,
  height: 675,
  waterTop: 48,
  sandTop: 615,
} as const

export type FinShape = 'fan' | 'forked' | 'veil'
export type BodyPattern = 'plain' | 'stripes' | 'spots'

/** Heritable characteristics. Offspring blend parent values with noise. */
export type Genome = {
  hue: number // 0..360
  saturation: number // 0.45..0.95
  maxWeight: number // adult asymptote, grams
  finShape: FinShape
  finFlair: number // 0..1, fin size and ornateness
  bodyAspect: number // height/length ratio, 0.3..0.6
  pattern: BodyPattern
  patternIntensity: number // 0..1
  speed: number // cruise speed, px/s
  resilience: number // 0..1, resistance to polluted water
}

export type FishActivity =
  | { kind: 'wander'; target: Vec2; idleUntil: number }
  | { kind: 'seekFood'; foodId: number }
  | { kind: 'court'; partnerId: number; until: number }
  | { kind: 'distress' }

/**
 * Resident components. A living fish carries all five together — see
 * RESIDENT_COMPONENTS and the state invariants — but each system queries
 * only the ones it actually reads or writes, so a new lifecycle or social
 * component later does not widen the systems that ignore it.
 */

/** Who this fish is: the parts that never change after hatching. */
export type Resident = {
  name: string
  generation: number
  parents?: [string, string]
  hatchedInMurkyWater: boolean
}

/** Body state: hunger, condition, growth, and the warned-death clock. */
export type Physiology = {
  weight: number
  hunger: number // 0 sated .. 1 starving
  sickness: number // 0 healthy .. 1 gravely ill
  health: number // 1 fine .. 0 dead
  ageSeconds: number
  digesting: number // nutrition awaiting conversion to waste
  /** Sim time hunger last climbed into appetite (seekFoodAbove). The
   * renderer shows a brief cue at this moment, so returning interest in food
   * is visible without a permanent icon; cleared when hunger drops back. */
  appetiteSince?: number
  /** Sim time when this fish entered critical condition, for warned death. */
  criticalSince?: number
  /** Last time a distress warning toast fired for this fish. */
  lastWarningAt?: number
}

/** What the fish is doing and which way it is pointing. */
export type Behaviour = {
  activity: FishActivity
  /** Facing: 1 rightward, -1 leftward (renderer + movement). */
  facing: 1 | -1
}

/** Readiness to court again, and who this fish courts. */
export type Breeding = {
  cooldownUntil: number
  /**
   * Entity id of a durable mate. Set for both fish when a pair leaves their
   * first egg together; from then on each only courts the other, so broods
   * come from lasting pairs rather than whoever drifted past. Cleared when
   * the partner dies, after which a widowed fish may eventually pair again.
   */
  partnerId?: number
}

/** Corpse animation: a fish that died, floating up and fading out. Carries
 * its own copy of what the renderer needs, so the dead entity does not keep
 * a resident's live components. */
export type Remains = {
  name: string
  genome: Genome
  weight: number
  expiresAt: number
}

/** Every component a living resident must have, for queries and invariants. */
export const RESIDENT_COMPONENTS = [
  'resident',
  'genome',
  'physiology',
  'behaviour',
  'breeding',
] as const

export type Food = {
  nutrition: number
  /** Sim time the pellet spoils and stops being edible. */
  spoilsAt: number
  spoiled: boolean
  restingOnSand: boolean
  /** True when the player dropped this morsel by hand. Hand-feeding becoming
   * a chore is what reveals the drip feeder, so a feeder's own drops must
   * never advance that evidence. */
  manual: boolean
}

export type Waste = {
  size: number // pollution emission scale
  restingOnSand: boolean
}

export type Egg = {
  hatchAt: number
  genome: Genome
  parents: [string, string]
  generation: number
  /** Peak pollution experienced while incubating; shapes the hatchling. */
  peakPollution: number
}

export type Entity = {
  id: number
  position: Vec2
  velocity: Vec2
  resident?: Resident
  genome?: Genome
  physiology?: Physiology
  behaviour?: Behaviour
  breeding?: Breeding
  food?: Food
  waste?: Waste
  egg?: Egg
  remains?: Remains
}

/** A living resident, with the components every fish system can rely on. */
export type ResidentEntity = Entity &
  Required<Pick<Entity, 'resident' | 'genome' | 'physiology' | 'behaviour' | 'breeding'>>

export type OfflineSummary = {
  awaySeconds: number
  simulatedSeconds: number
  coinsEarned: number
  births: string[]
  developments: string[]
  /** A resident to mention in the away panel's flavour line. */
  companion?: string
}

export type JournalKind = 'arrival' | 'birth' | 'death' | 'development' | 'purchase' | 'away'

/** One line in the Tank Journal: the permanent chronicle of the tank's life,
 * unlike toasts, which evaporate in seconds. Timestamped in sim seconds. */
export type JournalEntry = {
  atSim: number
  kind: JournalKind
  message: string
}

/** An intentional player-facing transient notice, returned to the caller by
 * advances and intents — never read back out of mutable state. */
export type UiNotification = {
  tone: 'development' | 'info' | 'warning'
  message: string
}

/** Facts one advance produced, for offline aggregation and runtime policy.
 * Durable history is the journal; this is the per-advance report. */
export type StepReport = {
  births: string[]
  deaths: string[]
  /** True when this advance ended the tank (last fish died, no eggs left). */
  gameOver: boolean
}

/** Internal collector entries the systems emit during a tick; drained and
 * projected into StepReport + UiNotification by GameSim.advanceElapsed().
 * Not persisted and not visible outside the simulation core. */
export type GameEvent =
  | ({ type: 'toast' } & UiNotification)
  | { type: 'death'; name: string }
  | { type: 'birth'; name: string }
  | { type: 'gameOver' }

/**
 * A hidden development the tank has revealed. Durable and one-shot: once an
 * id is discovered it stays discovered, so a development never re-announces
 * itself after a reload. Ids are the save's vocabulary — renaming one is a
 * save migration, not a refactor.
 */
export type DevelopmentId =
  | 'fedOnce'
  | 'growthNoticed'
  | 'pollutionNoticed'
  | 'siphonOffered'
  | 'fishOffered'
  | 'eggSeen'
  | 'dripFeederOffered'
  | 'twinHopperOffered'
  | 'rotaryFeederOffered'
  | 'spongeFilterOffered'
  | 'habitatExpansionOffered'
  | 'bondSeen'
  | 'heartyFoodOffered'
  | 'crumbFoodOffered'

export const DEVELOPMENT_IDS: readonly DevelopmentId[] = [
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
  'habitatExpansionOffered',
  'bondSeen',
  'heartyFoodOffered',
  'crumbFoodOffered',
]

/** Stable V5 wire/runtime bound. Exact meal batches normally number in the
 * hundreds; this leaves ample headroom while preventing an unbounded save. */
export const MEAL_HISTORY_BATCH_LIMIT = 4_096

/** A slice of one simulation tick, counting morsels the tank actually ate. */
export type MealBucket = {
  /** Exact sim time at which this batch of morsels was eaten. */
  at: number
  /** Morsels eaten during the tick, whatever put them in the water. */
  eaten: number
  /** Of those, the ones the player dropped by hand. */
  manual: number
}

/**
 * The evidence hidden developments actually consult — nothing speculative.
 * These are pressures the player creates by playing, so an unlock can be
 * explained by what they were doing rather than by a formula on screen.
 */
export type CareHistory = {
  /**
   * Net sim seconds the current feeder has spent behind its tank. It climbs
   * only while a resident is genuinely hungry with nothing earmarked for it
   * (TUNING.feederStrainHungerAbove) and decays while the feeder is coping,
   * so a comfortable tank never reveals an upgrade merely by running. Spent
   * when a feeder is installed, so each tier is judged on its own strain.
   */
  feederStrainSeconds: number
  /** Siphon sweeps that did real work — lifted debris or visibly cleared
   * local murk — rate-limited per water cell so a held gesture cannot farm
   * them. Sweeping clean sand credits nothing. */
  cleaningCredits: number
  /** Continuous sim seconds the tank's *visible* average murk has stayed at
   * or above TUNING.filterMurkAtLeast — the same quantity the HUD meter
   * shows. Resets the moment the water reads clear again. */
  murkySeconds: number
  /** Continuous sim seconds the tank has been at capacity with every
   * resident comfortable and the water clean — the evidence that reveals the
   * habitat expansion. Resets whenever the streak breaks. */
  stableFullSeconds: number
  /** Rolling record of eaten morsels, oldest first, pruned to
   * TUNING.mealHistorySeconds. Food dropped but missed, spoiled, or siphoned
   * away never appears here. */
  meals: MealBucket[]
}

export function createCareHistory(): CareHistory {
  return {
    feederStrainSeconds: 0,
    cleaningCredits: 0,
    murkySeconds: 0,
    stableFullSeconds: 0,
    meals: [],
  }
}

export const TUNING = {
  startingCoins: 30,
  /** What a drop costs belongs to the food, not to the game: see
   * FOOD_PROFILES[stage].unitCost (equipment.ts). Richer morsels cost more,
   * so feeding stays a visible operating expense as a tank grows. */
  siphonCost: 60,
  /** Feeders drop a pellet for a fish this hungry. Set well below distress:
   * a fish still has to swim to the pellet, and hunger keeps climbing while
   * it does, so feeding at the last moment leaves automated tanks hovering
   * at the distress warning. Drop intervals and costs live in
   * FEEDER_PROFILES (equipment.ts). */
  feederFeedsAbove: 0.4,
  /** Escalating fish shop prices; breeding must take over after these. */
  fishPrices: [120, 300, 750, 1900],
  fishPriceBeyond: 4500,
  starterFishCost: 25,
  /** Coins per second: floor + rate * total fish weight in grams. The floor
   * carries the opening, where there is barely any fish mass to earn from. */
  incomeFloor: 0.28,
  incomePerGram: 0.055,

  /** Nutrition per dropped morsel lives in FOOD_PROFILES (equipment.ts):
   * starter flakes are weak on purpose, so the opening is a run of small
   * satisfying feeds rather than one pellet and a long wait. */
  pelletSpoilSeconds: 45,
  /** Weight gained per nutrition eaten, scaled by remaining growth headroom. */
  growthPerNutrition: 1.15,
  starterMaxWeight: 26,
  starterWeight: 1.2,
  /** Peckish enough for a short opening run of mouthfuls before appetite
   * lapses, and still nowhere near a crisis. */
  starterHunger: 0.42,
  babyWeight: 1.0,
  /** Hunger accumulated per second by a full-grown fish (smaller fish less).
   * Recently fed fish (hunger < satiationBelow) digest at satiationFactor. */
  hungerPerSecondAdult: 1 / 30,
  satiationBelow: 0.5,
  satiationFactor: 0.45,
  hungerRelievedPerNutrition: 0.38,
  /** Against a starter flake's small mouthful, a higher threshold ends the
   * opening feeding episode after two bites; at 0.20 those flakes form a run
   * of care rather than isolated nibbles. */
  seekFoodAbove: 0.2,
  /**
   * digesting >= this spawns a dropping. Measured before tuning (see
   * tests/e2e/debugging.spec.ts "mature full tank"): at one dropping per two
   * pellets and a ~15-minute breakdown, a fed twelve-resident tank settled at
   * ~200 standing droppings — an unreadable carpet that clogged the sponge
   * filter to ~18% of its rated clearance and made siphoning futile. Two
   * pellets' worth of digestion per dropping puts the first real debris near
   * the opening instead of several minutes into it; the faster breakdown
   * below (wasteBreakdownPerSecond) keeps the mature standing count inside
   * the same legible band.
   */
  digestionPerDropping: 2,

  wastePollutionPerSecond: 0.03, // per unit of waste size
  spoiledFoodPollutionPerSecond: 0.008,
  pollutionDecayPerSecond: 0.0018,
  pollutionDiffusionPerSecond: 0.04,
  sicknessAbovePollution: 0.3,
  sicknessPerSecondAtFullPollution: 1 / 45,
  sicknessRecoveryPerSecond: 1 / 90,
  /** Debris self-degrades (after leaching pollution) so entities stay bounded.
   * Paired with digestionPerDropping above: droppings now appear twice as
   * often, and breaking down in ~3.5 minutes rather than ~6 holds a fed
   * twelve-resident tank near the same ~50 standing droppings — visibly
   * worth siphoning, never a carpet. */
  wasteBreakdownPerSecond: 0.008,
  spoiledFoodLingerSeconds: 180,
  siphonRadius: 70,
  siphonPollutionClear: 0.35, // fraction of local cell pollution removed per use
  /** A sweep earns a cleaning credit only when it did something: lifted
   * debris, or pulled at least this much pollution out of the local cell. */
  siphonCreditPollutionDrop: 0.05,
  /** …and at most one credit per water cell in this many sim seconds, so
   * holding the siphon still — or scrubbing a tiny loop — cannot farm it. */
  siphonCreditCooldownSeconds: 1.5,

  distressHungerAbove: 0.85,
  distressSicknessAbove: 0.6,
  /** Health lost per second while starving or gravely sick (page visible). */
  healthLossPerSecond: 1 / 240,
  healthRegenPerSecond: 1 / 120,
  /** Continuous critical time before death is permitted. */
  warningGraceSeconds: 60,
  remainsLingerSeconds: 12,

  breedingMinWeightFraction: 0.55,
  breedingMaxHunger: 0.45,
  breedingMaxSickness: 0.25,
  breedingMaxPollution: 0.2,
  breedingCooldownSeconds: 240,
  /** A courting fish ignores food, and hunger climbs the whole time, so the
   * dance must be short enough that romance never starves a resident. */
  courtshipSeconds: 10,
  eggHatchSeconds: 60,
  /** Eggs incubating above this pollution hatch stunted, less resilient fry.
   * Set above the transient greening any egg picks up lying on working sand
   * — with droppings leaching harder per unit, 0.4 stunted most broods in a
   * well-kept automated tank. Only genuinely foul ground does it now. */
  murkyEggPollution: 0.75,

  /** Hidden development thresholds. */
  growthNoticedAtMultiple: 2, // starter weight vs its hatch weight
  pollutionNoticedAt: 0.18,
  fishUnlockWeight: 8,

  /** The longest workload window — the drip feeder's — sets retention. */
  mealHistorySeconds: 480,
  /** Crumbs answer a stretch of steady hand-feeding in a tank with enough
   * mass to be worth the step up; the grams gate keeps a newly arrived fry
   * from qualifying on the strength of someone else's meals. */
  crumbFoodWindowSeconds: 360,
  crumbFoodEatenInWindow: 40,
  crumbFoodAtTankGrams: 6,
  /** Hearty pellets need the same busy mealtimes plus a tank that has really
   * grown: heavy residents, or simply enough of them. */
  heartyFoodWindowSeconds: 360,
  heartyFoodEatenInWindow: 40,
  heartyFoodAtTankGrams: 40,
  heartyFoodAtResidents: 4,
  /** The drip feeder answers hand-feeding that has become a chore: several
   * residents, and this many morsels the player dropped *by hand* and the
   * tank actually ate inside the window. */
  feederOfferedAtResidents: 3,
  feederManualWindowSeconds: 480,
  feederManualEatenInWindow: 60,
  /** A resident this hungry with nothing earmarked for it is one the feeder
   * is failing, not one it is about to serve. */
  feederStrainHungerAbove: 0.65,
  /** Strain given back per sim second while nobody is behind, so a coping
   * feeder trends to zero instead of eventually crossing on uptime alone. */
  feederStrainDecayPerSecond: 0.5,
  /** Net sim seconds behind before the next tier is offered. */
  feederStrainForNextTier: 45,
  /** Either real cleaning work or long-running *visible* murk reveals the
   * filter, once the player owns a siphon. Both routes are measured the way
   * the player experiences them: sweeps that removed something, and the
   * average murk the HUD actually shows. */
  filterOfferedAfterCleanings: 8,
  filterMurkAtLeast: 0.14,
  filterOfferedAfterMurkySeconds: 420,
  /** The habitat expansion is revealed by a tank at capacity that stays
   * comfortable this long without interruption: no distressed resident and
   * the overall murk below expansionMaxMurk — a standard a full tank only
   * meets with real feeding and filtration in place. */
  expansionStableSeconds: 300,
  expansionMaxMurk: 0.15,

  /** Oldest journal entries fall off past this, bounding the save file. */
  journalMaxEntries: 120,

  /** Away-time contract: slowed and capped, and always survivable. */
  offlineRate: 0.2,
  offlineMaxSimSeconds: 20 * 60,
  offlineHungerCeiling: 0.8,
  offlineSicknessCeiling: 0.5,

  /**
   * The one fixed simulation quantum: every mode (visible/background/offline)
   * advances in whole steps of this size, so equal elapsed time always
   * produces the same state regardless of how callers partition it.
   * Benchmarked at 1200 sim-seconds of offline catch-up (a dozen fish, 20
   * waste) on dev hardware: ~979ms at 1/30s vs ~1852ms at 1/60s — 1/30 is
   * not "comfortably fast" enough to justify the finer quantum, so it stays
   * the default (see tests/time-contract.test.ts for the benchmark).
   */
  simTickSeconds: 1 / 30,
} as const

export function fishLength(weight: number): number {
  // Length scales with the cube root of mass; tuned so 1 g reads as a small
  // fry and 25 g as a substantial resident at tank scale.
  return 26 * Math.cbrt(weight)
}

export function fishPrice(purchasedSoFar: number): number {
  return (
    TUNING.fishPrices[purchasedSoFar] ?? TUNING.fishPriceBeyond
  )
}
