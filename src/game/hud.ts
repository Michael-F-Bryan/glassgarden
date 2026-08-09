import { TUNING, type Behaviour, type Genome, type JournalKind, type Physiology } from './model'
import type { GameSim, ShopOfferId } from './sim'
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
  shopItems: ShopItemView[]
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

/** A shop offer dressed for display. The sim provides the domain offer
 * (id, cost, availability, reason); the copy lives here, with the UI. */
export type ShopItemView = {
  id: ShopOfferId
  label: string
  description: string
  cost: number
  affordable: boolean
}

const SHOP_COPY: Record<ShopOfferId, { label: string; description: string }> = {
  siphon: {
    label: 'Gravel siphon',
    description: 'Clean up droppings and spoiled food before they foul the water.',
  },
  feeder: {
    label: 'Drip feeder',
    description: 'Drops a pellet for hungry fish while you are busy elsewhere. Uses your coins.',
  },
  fish: {
    label: 'Young glimmerfin',
    description: 'A new resident for the tank. Each one is harder to source than the last.',
  },
  starterFish: {
    label: 'Starter glimmerfin',
    description: 'Begin again. Your coins and equipment remain yours.',
  },
}

const FISH_AT_CAPACITY_COPY =
  'The tank is at capacity — no responsible shop would add another fish.'

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

function describeMood(body: Physiology, behaviour: Behaviour, pollution = 0): string {
  if (body.hunger >= 0.999) return 'starving'
  if (body.sickness >= 0.75) return 'gravely ill'
  if (body.sickness > 0.4) return 'sick'
  if (body.hunger > 0.85) return 'very hungry'
  if (body.hunger > 0.5) return 'peckish'
  if (pollution > TUNING.sicknessAbovePollution) return 'uneasy in the murk'
  if (behaviour.activity.kind === 'court') return 'smitten'
  return 'content'
}

function moodEmoji(body: Physiology, behaviour: Behaviour, pollution = 0): string {
  if (body.sickness >= 0.75) return '🤢'
  if (body.sickness > 0.4) return '🤒'
  if (body.hunger >= 0.999) return '😫'
  if (body.hunger > 0.85) return '😟'
  if (body.hunger > 0.5) return '😐'
  if (pollution > TUNING.sicknessAbovePollution) return '😖'
  if (behaviour.activity.kind === 'court') return '🥰'
  if (behaviour.activity.kind === 'distress') return '😰'
  return '😊'
}

function describeStage(body: Physiology, genome: Genome): string {
  const maturity = body.weight / genome.maxWeight
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
  const state = sim.read
  const fishEntities = [...state.world.with('resident', 'genome', 'physiology', 'behaviour')].sort(
    (a, b) => a.id - b.id,
  )
  const selected = selectedFishId !== undefined ? state.byId.get(selectedFishId) : undefined
  return {
    coins: Math.floor(state.coins),
    incomePerSecond: sim.incomePerSecond(),
    fishCount: fishEntities.length,
    distressedCount: fishEntities.filter(
      (entity) =>
        entity.physiology.hunger > TUNING.distressHungerAbove ||
        entity.physiology.sickness > TUNING.distressSicknessAbove,
    ).length,
    criticalNames: fishEntities
      .filter((entity) => entity.physiology.hunger >= 0.999 || entity.physiology.sickness >= 0.75)
      .map((entity) => entity.resident.name),
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
    shopItems: sim.shopOffers().map((offer) => ({
      id: offer.id,
      label: SHOP_COPY[offer.id].label,
      description: offer.atCapacity ? FISH_AT_CAPACITY_COPY : SHOP_COPY[offer.id].description,
      cost: offer.cost,
      affordable: offer.affordable,
    })),
    residents: fishEntities.map((entity) => {
      const pollution = pollutionAt(state.water, entity.position)
      return {
        id: entity.id,
        name: entity.resident.name,
        hue: entity.genome.hue,
        saturation: entity.genome.saturation,
        weightGrams: entity.physiology.weight,
        mood: describeMood(entity.physiology, entity.behaviour, pollution),
        moodEmoji: moodEmoji(entity.physiology, entity.behaviour, pollution),
      }
    }),
    selectedFish:
      selected?.resident && selected.genome && selected.physiology && selected.behaviour
        ? {
            id: selected.id,
            name: selected.resident.name,
            generation: selected.resident.generation,
            stage: describeStage(selected.physiology, selected.genome),
            mood: describeMood(
              selected.physiology,
              selected.behaviour,
              pollutionAt(state.water, selected.position),
            ),
            weightGrams: selected.physiology.weight,
            age: formatAge(selected.physiology.ageSeconds),
            origin: selected.resident.parents ? 'hatched' : 'arrived',
            parents: selected.resident.parents,
            hatchedInMurkyWater: selected.resident.hatchedInMurkyWater,
          }
        : undefined,
  }
}
