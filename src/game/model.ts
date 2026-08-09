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

export type Fish = {
  name: string
  genome: Genome
  weight: number
  hunger: number // 0 sated .. 1 starving
  sickness: number // 0 healthy .. 1 gravely ill
  health: number // 1 fine .. 0 dead
  ageSeconds: number
  generation: number
  parents?: [string, string]
  hatchedInMurkyWater: boolean
  digesting: number // nutrition awaiting conversion to waste
  breedingCooldownUntil: number
  activity: FishActivity
  /** Sim time when this fish entered critical condition, for warned death. */
  criticalSince?: number
  /** Last time a distress warning toast fired for this fish. */
  lastWarningAt?: number
  /** Facing: 1 rightward, -1 leftward (renderer + movement). */
  facing: 1 | -1
}

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
  fish?: Fish
  food?: Food
  waste?: Waste
  egg?: Egg
  /** Corpse animation: fish that died, floating up and fading out. */
  remains?: { fish: Fish; expiresAt: number }
}

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

/** One-shot notifications the UI drains each frame. */
export type GameEvent =
  | { type: 'toast'; tone: 'development' | 'info' | 'warning'; message: string }
  | { type: 'death'; name: string }
  | { type: 'birth'; name: string }
  | { type: 'gameOver' }
  | { type: 'awaySummary'; summary: OfflineSummary }

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
  feederCost: 400,
  /** Drip feeder: one pellet per interval when a fish is hungry enough. */
  feederDropSeconds: 8,
  feederFeedsAbove: 0.55,
  /** Escalating fish shop prices; breeding must take over after these. */
  fishPrices: [120, 300, 750, 1900],
  fishPriceBeyond: 4500,
  starterFishCost: 25,
  /** Coins per second: floor + rate * total fish weight in grams. */
  incomeFloor: 0.12,
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
  courtshipSeconds: 20,
  eggHatchSeconds: 60,
  /** Eggs incubating above this pollution hatch stunted, less resilient fry. */
  murkyEggPollution: 0.4,
  maxPopulation: 12,

  /** Hidden development thresholds. */
  growthNoticedAtMultiple: 2, // starter weight vs its hatch weight
  pollutionNoticedAt: 0.18,
  fishUnlockWeight: 8,

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
