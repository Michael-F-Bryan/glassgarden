/**
 * Domain model and tuning for the Glassgarden simulation.
 *
 * All gameplay numbers live in TUNING so pacing can be adjusted in one place
 * and referenced from tests. Distances are in logical tank pixels, weights in
 * grams, times in sim seconds, hunger/sickness/health in [0, 1].
 */

export type Vec2 = { x: number; y: number }

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

/** Readiness to court again. */
export type Breeding = {
  cooldownUntil: number
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
]

/**
 * The evidence hidden developments actually consult — nothing speculative.
 * These are pressures the player creates by playing, so an unlock can be
 * explained by what they were doing rather than by a formula on screen.
 */
export type CareHistory = {
  /** Sim seconds the current feeder spent unable to keep up with demand.
   * Reset when a faster feeder is installed, so each tier is judged on its
   * own strain rather than inheriting the last one's. */
  feederShortfallSeconds: number
  /** How many times the player has swept the siphon. */
  siphonUses: number
  /** Sim seconds the tank has spent above the pollution the player noticed. */
  pollutedSeconds: number
}

export function createCareHistory(): CareHistory {
  return { feederShortfallSeconds: 0, siphonUses: 0, pollutedSeconds: 0 }
}

/** @deprecated Legacy V1 save shape only; the runtime uses DevelopmentId. */
export type Unlocks = {
  /** The player has dropped food at least once; gates the first-feed hint. */
  fedOnce: boolean
  /** Development milestones already announced, so each toast fires once. */
  noticedGrowth: boolean
  noticedPollution: boolean
  siphonInShop: boolean
  fishInShop: boolean
  feederInShop: boolean
  seenEgg: boolean
}

export const TUNING = {
  startingCoins: 30,
  pelletCost: 1,
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

  pelletNutrition: 1,
  pelletSpoilSeconds: 45,
  /** Weight gained per nutrition eaten, scaled by remaining growth headroom. */
  growthPerNutrition: 1.15,
  starterMaxWeight: 26,
  starterWeight: 1.2,
  /** Peckish enough to chase the tutorial pellet, far from a crisis. */
  starterHunger: 0.35,
  babyWeight: 1.0,
  /** Hunger accumulated per second by a full-grown fish (smaller fish less).
   * Recently fed fish (hunger < satiationBelow) digest at satiationFactor. */
  hungerPerSecondAdult: 1 / 30,
  satiationBelow: 0.5,
  satiationFactor: 0.45,
  hungerRelievedPerNutrition: 0.38,
  seekFoodAbove: 0.25,
  /** digesting >= this spawns a dropping. */
  digestionPerDropping: 2,

  wastePollutionPerSecond: 0.016, // per unit of waste size
  spoiledFoodPollutionPerSecond: 0.008,
  pollutionDecayPerSecond: 0.0018,
  pollutionDiffusionPerSecond: 0.04,
  sicknessAbovePollution: 0.3,
  sicknessPerSecondAtFullPollution: 1 / 45,
  sicknessRecoveryPerSecond: 1 / 90,
  /** Debris self-degrades (after leaching pollution) so entities stay bounded. */
  wasteBreakdownPerSecond: 0.002,
  spoiledFoodLingerSeconds: 180,
  siphonRadius: 70,
  siphonPollutionClear: 0.35, // fraction of local cell pollution removed per use

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
  /** Eggs incubating above this pollution hatch stunted, less resilient fry. */
  murkyEggPollution: 0.4,
  maxPopulation: 12,

  /** Hidden development thresholds. */
  growthNoticedAtMultiple: 2, // starter weight vs its hatch weight
  pollutionNoticedAt: 0.18,
  fishUnlockWeight: 8,
  /** The drip feeder is offered once the tank holds this many residents. */
  feederOfferedAtResidents: 3,
  /** Sim seconds of a feeder failing to keep up before the next tier is
   * offered. Measured per tier: installing a feeder resets the count. */
  feederStrainForNextTier: 75,
  /** Either repeated manual cleaning or long-running murk reveals the filter,
   * once the player owns a siphon. The murk route is deliberately slow: it
   * stands for a tank that keeps greening up despite maintenance. */
  filterOfferedAfterSiphonUses: 10,
  filterOfferedAfterPollutedSeconds: 900,

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
