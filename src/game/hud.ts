import { TUNING, type Fish, type JournalKind } from './model'
import type { GameSim, ShopItem } from './sim'
import { pollutionAt } from './water'

/**
 * The HUD view model: an immutable snapshot of everything the page renders,
 * derived from the sim each publish tick. Pure derivation — no browser or
 * lifecycle concerns here.
 */
export type HudSnapshot = {
  coins: number
  incomePerSecond: number
  fishCount: number
  distressedCount: number
  criticalNames: string[]
  ownsSiphon: boolean
  gameOver: boolean
  /** False only until the player's very first pellet; drives the feed hint. */
  fedOnce: boolean
  waterQuality: WaterTier
  /** Worst water cell in [0, 1], driving the quality meter's fill. */
  worstPollution: number
  /** Tank Journal entries, newest first, ages pre-formatted for display. */
  journal: { kind: JournalKind; message: string; age: string }[]
  shopItems: ShopItem[]
  residents: {
    id: number
    name: string
    hue: number
    saturation: number
    weightGrams: number
    mood: string
    moodEmoji: string
  }[]
  selectedFish?: {
    id: number
    name: string
    generation: number
    stage: string
    mood: string
    weightGrams: number
    age: string
    origin: 'arrived' | 'hatched'
    parents?: [string, string]
    hatchedInMurkyWater: boolean
  }
}

export const EMPTY_HUD: HudSnapshot = {
  coins: 0,
  incomePerSecond: 0,
  fishCount: 0,
  distressedCount: 0,
  criticalNames: [],
  ownsSiphon: false,
  gameOver: false,
  fedOnce: true, // no hint until the real sim reports otherwise
  waterQuality: 'clear',
  worstPollution: 0,
  journal: [],
  shopItems: [],
  residents: [],
}

function describeMood(fish: Fish, pollution = 0): string {
  if (fish.hunger >= 0.999) return 'starving'
  if (fish.sickness >= 0.75) return 'gravely ill'
  if (fish.sickness > 0.4) return 'sick'
  if (fish.hunger > 0.85) return 'very hungry'
  if (fish.hunger > 0.5) return 'peckish'
  if (pollution > TUNING.sicknessAbovePollution) return 'uneasy in the murk'
  if (fish.activity.kind === 'court') return 'smitten'
  return 'content'
}

function moodEmoji(fish: Fish, pollution = 0): string {
  if (fish.sickness >= 0.75) return '🤢'
  if (fish.sickness > 0.4) return '🤒'
  if (fish.hunger >= 0.999) return '😫'
  if (fish.hunger > 0.85) return '😟'
  if (fish.hunger > 0.5) return '😐'
  if (pollution > TUNING.sicknessAbovePollution) return '😖'
  if (fish.activity.kind === 'court') return '🥰'
  if (fish.activity.kind === 'distress') return '😰'
  return '😊'
}

function describeStage(fish: Fish): string {
  const maturity = fish.weight / fish.genome.maxWeight
  if (maturity < 0.2) return 'fry'
  if (maturity < TUNING.breedingMinWeightFraction) return 'juvenile'
  return 'adult'
}

const WATER_TIERS = [
  { tier: 'clear', below: 0.12 },
  { tier: 'tinged', below: 0.3 },
  { tier: 'murky', below: 0.5 },
  { tier: 'foul', below: Infinity },
] as const

export type WaterTier = (typeof WATER_TIERS)[number]['tier']

/** Sticky tiering: needs to cross a boundary by a margin to change, so the
 * pill doesn't flicker while pollution hovers at a threshold. */
function describeWater(worstPollution: number, previous: WaterTier): WaterTier {
  const index = WATER_TIERS.findIndex((entry) => worstPollution < entry.below)
  const previousIndex = WATER_TIERS.findIndex((entry) => entry.tier === previous)
  if (index > previousIndex) {
    const boundary = WATER_TIERS[index - 1].below
    if (worstPollution < boundary + 0.04) return previous
  } else if (index < previousIndex) {
    const boundary = WATER_TIERS[index].below
    if (worstPollution > boundary - 0.04) return previous
  }
  return WATER_TIERS[index].tier
}

function formatAge(seconds: number): string {
  if (seconds < 90) return 'moments ago'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`
}

export function formatAway(seconds: number): string {
  if (seconds < 120) return `${Math.round(seconds)} seconds`
  if (seconds < 7200) return `${Math.round(seconds / 60)} minutes`
  return `${(seconds / 3600).toFixed(1)} hours`
}

export function buildHudSnapshot(
  sim: GameSim,
  selectedFishId: number | undefined,
  previousWater: WaterTier,
): HudSnapshot {
  const state = sim.state
  const fishEntities = [...state.world.with('fish')].sort((a, b) => a.id - b.id)
  const selected = selectedFishId !== undefined ? state.byId.get(selectedFishId) : undefined
  return {
    coins: Math.floor(state.coins),
    incomePerSecond: sim.incomePerSecond(),
    fishCount: fishEntities.length,
    distressedCount: fishEntities.filter(
      (entity) =>
        entity.fish.hunger > TUNING.distressHungerAbove ||
        entity.fish.sickness > TUNING.distressSicknessAbove,
    ).length,
    criticalNames: fishEntities
      .filter((entity) => entity.fish.hunger >= 0.999 || entity.fish.sickness >= 0.75)
      .map((entity) => entity.fish.name),
    ownsSiphon: state.ownsSiphon,
    gameOver: state.gameOver,
    fedOnce: state.unlocks.fedOnce,
    waterQuality: describeWater(sim.worstPollution(), previousWater),
    worstPollution: sim.worstPollution(),
    journal: [...state.journal]
      .reverse()
      .map((entry) => ({
        kind: entry.kind,
        message: entry.message,
        age: formatAge(state.time - entry.atSim),
      })),
    shopItems: sim.shopItems(),
    residents: fishEntities.map((entity) => {
      const pollution = pollutionAt(state.water, entity.position)
      return {
        id: entity.id,
        name: entity.fish.name,
        hue: entity.fish.genome.hue,
        saturation: entity.fish.genome.saturation,
        weightGrams: entity.fish.weight,
        mood: describeMood(entity.fish, pollution),
        moodEmoji: moodEmoji(entity.fish, pollution),
      }
    }),
    selectedFish: selected?.fish
      ? {
          id: selected.id,
          name: selected.fish.name,
          generation: selected.fish.generation,
          stage: describeStage(selected.fish),
          mood: describeMood(selected.fish, pollutionAt(state.water, selected.position)),
          weightGrams: selected.fish.weight,
          age: formatAge(selected.fish.ageSeconds),
          origin: selected.fish.parents ? 'hatched' : 'arrived',
          parents: selected.fish.parents,
          hatchedInMurkyWater: selected.fish.hatchedInMurkyWater,
        }
      : undefined,
  }
}
