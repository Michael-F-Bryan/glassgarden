import { capacityFor, tankBoundsFor } from './equipment'
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
  /** Residents the owned habitat responsibly holds — the roster's "of". */
  capacity: number
  /** Live logical tank size, for pointer-to-tank coordinate conversion. */
  tank: { width: number; height: number }
  distressedCount: number
  criticalNames: string[]
  ownsSiphon: boolean
  gameOver: boolean
  /** False only until the player's very first pellet; drives the feed hint. */
  fedOnce: boolean
  waterQuality: WaterTier
  /** Overall murk in [0, 1], driving the quality meter's fill. Averaged, not
   * worst-cell: debris on the sand pins one cell at maximum in any mature
   * tank, which would leave the meter reading "foul" forever. */
  murkiness: number
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
    /** The durable mate's name, once this fish has one. */
    partner?: string
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
  dripFeeder: {
    label: 'Drip feeder',
    description: 'Drops a pellet for hungry fish while you are busy elsewhere. Suits a small tank. Uses your coins.',
  },
  twinHopper: {
    label: 'Twin hopper',
    description: 'Two chambers, twice the rounds — enough for a busy tank. Still a coin per pellet.',
  },
  rotaryFeeder: {
    label: 'Rotary feeder',
    description: 'Turns steadily all day and can keep a full tank fed. Still a coin per pellet.',
  },
  spongeFilter: {
    label: 'Sponge filter',
    description:
      'Works the dispersed green out of the water between your visits. Clogs as debris builds up on the sand.',
  },
  habitatExpansion: {
    label: 'Habitat expansion',
    description:
      'Rebuild the aquarium into a far larger habitat — new ground, fresh planting, and room for about twenty residents.',
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
  capacity: capacityFor('starter'),
  tank: { width: tankBoundsFor('starter').width, height: tankBoundsFor('starter').height },
  distressedCount: 0,
  criticalNames: [],
  ownsSiphon: false,
  gameOver: false,
  fedOnce: true, // no hint until the real sim reports otherwise
  waterQuality: 'clear',
  murkiness: 0,
  journal: [],
  shopItems: [],
  residents: [],
}

/**
 * One ordered table for both the label and the emoji, so a resident can
 * never be described as starving while wearing the sick face. The first
 * matching row wins; rows are ordered most urgent first.
 */
const MOODS: {
  label: string
  emoji: string
  matches: (body: Physiology, behaviour: Behaviour, pollution: number) => boolean
}[] = [
  { label: 'starving', emoji: '😫', matches: (body) => body.hunger >= 0.999 },
  { label: 'gravely ill', emoji: '🤢', matches: (body) => body.sickness >= 0.75 },
  { label: 'sick', emoji: '🤒', matches: (body) => body.sickness > 0.4 },
  { label: 'very hungry', emoji: '😟', matches: (body) => body.hunger > 0.85 },
  { label: 'peckish', emoji: '😐', matches: (body) => body.hunger > 0.5 },
  {
    label: 'uneasy in the murk',
    emoji: '😖',
    matches: (_body, _behaviour, pollution) => pollution > TUNING.sicknessAbovePollution,
  },
  {
    label: 'smitten',
    emoji: '🥰',
    matches: (_body, behaviour) => behaviour.activity.kind === 'court',
  },
  {
    label: 'unsettled',
    emoji: '😰',
    matches: (_body, behaviour) => behaviour.activity.kind === 'distress',
  },
  { label: 'content', emoji: '😊', matches: () => true },
]

function describeMood(body: Physiology, behaviour: Behaviour, pollution = 0) {
  return MOODS.find((mood) => mood.matches(body, behaviour, pollution))!
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
  const bounds = tankBoundsFor(state.equipment.habitat)
  const fishEntities = [...state.world.with('resident', 'genome', 'physiology', 'behaviour')].sort(
    (a, b) => a.id - b.id,
  )
  const selected = selectedFishId !== undefined ? state.byId.get(selectedFishId) : undefined
  return {
    coins: Math.floor(state.coins),
    incomePerSecond: sim.incomePerSecond(),
    fishCount: fishEntities.length,
    capacity: capacityFor(state.equipment.habitat),
    tank: { width: bounds.width, height: bounds.height },
    distressedCount: fishEntities.filter(
      (entity) =>
        entity.physiology.hunger > TUNING.distressHungerAbove ||
        entity.physiology.sickness > TUNING.distressSicknessAbove,
    ).length,
    criticalNames: fishEntities
      .filter((entity) => entity.physiology.hunger >= 0.999 || entity.physiology.sickness >= 0.75)
      .map((entity) => entity.resident.name),
    ownsSiphon: state.equipment.siphon,
    gameOver: state.gameOver,
    fedOnce: state.developments.has('fedOnce'),
    waterQuality: describeWater(sim.murkiness(), previousWater),
    murkiness: sim.murkiness(),
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
      const pollution = pollutionAt(state.water, entity.position, bounds)
      return {
        id: entity.id,
        name: entity.resident.name,
        hue: entity.genome.hue,
        saturation: entity.genome.saturation,
        weightGrams: entity.physiology.weight,
        mood: describeMood(entity.physiology, entity.behaviour, pollution).label,
        moodEmoji: describeMood(entity.physiology, entity.behaviour, pollution).emoji,
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
              pollutionAt(state.water, selected.position, bounds),
            ).label,
            weightGrams: selected.physiology.weight,
            age: formatAge(selected.physiology.ageSeconds),
            origin: selected.resident.parents ? 'hatched' : 'arrived',
            parents: selected.resident.parents,
            partner:
              selected.breeding?.partnerId !== undefined
                ? state.byId.get(selected.breeding.partnerId)?.resident?.name
                : undefined,
            hatchedInMurkyWater: selected.resident.hatchedInMurkyWater,
          }
        : undefined,
  }
}
