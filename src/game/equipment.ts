/**
 * Equipment the player owns, as typed stages rather than booleans.
 *
 * Each stage is concrete executable data: cost, throughput, and what it
 * unlocks next. Systems and balance tests read the same profiles, so a
 * feeder's advertised capacity is the number the simulation actually
 * delivers. Adding a stage means adding a profile entry, not a branch in
 * every module.
 */

import { TANK, type TankBounds } from './model'

export type FeederStage = 'none' | 'drip' | 'twin' | 'rotary'
export type FilterStage = 'none' | 'sponge'
export type HabitatStage = 'starter' | 'expanded'
export type FoodStage = 'flake' | 'crumb' | 'pellet'

export type Equipment = {
  siphon: boolean
  feeder: FeederStage
  filter: FilterStage
  habitat: HabitatStage
  /** What every drop — hand or feeder — puts in the water. */
  food: FoodStage
}

export function createEquipment(): Equipment {
  return { siphon: false, feeder: 'none', filter: 'none', habitat: 'starter', food: 'flake' }
}

export type FoodProfile = {
  /** Nutrition per dropped morsel: hunger relief, growth, and digestion all
   * scale by it (see TUNING.hungerRelievedPerNutrition and friends). */
  nutrition: number
  /** One-time shop cost of switching the tank to this food. */
  cost: number
  /** What every drop of it costs — by hand or from a feeder. Richer food is
   * dearer per morsel, so feeding stays a real operating expense even once
   * automation is doing the dropping. */
  unitCost: number
}

/**
 * Food is the opening's pacing valve, and its rungs are the sawtooth.
 *
 * Starter flakes are deliberately tiny: a peckish fish is satisfied for
 * seconds rather than half a minute, so a fresh tank is a run of small
 * feed-and-eat moments rather than one pellet and a wait. Crumbs are the
 * first relief — roughly a third of the feeding frequency for twice the coin
 * — and hearty pellets restore the one-drop-per-meal economy once the tank
 * has real workload. Every feeder capacity rating (FEEDER_PROFILES) assumes
 * pellets.
 */
export const FOOD_PROFILES: Record<FoodStage, FoodProfile> = {
  flake: { nutrition: 0.15, cost: 0, unitCost: 1 },
  crumb: { nutrition: 0.4, cost: 30, unitCost: 2 },
  pellet: { nutrition: 1, cost: 80, unitCost: 4 },
}

export function nextFoodStage(stage: FoodStage): Exclude<FoodStage, 'flake'> | undefined {
  if (stage === 'flake') return 'crumb'
  if (stage === 'crumb') return 'pellet'
  return undefined
}

export function foodProfile(stage: FoodStage): FoodProfile {
  return FOOD_PROFILES[stage]
}

export type HabitatProfile = {
  cost: number
  /** Residents (plus incubating eggs) the habitat responsibly holds; the
   * breeding valve and the fish shop both stop at this number. */
  capacity: number
  bounds: TankBounds
}

/**
 * The habitat is the capacity valve: expanding it opens space, population,
 * and the ecological load that comes with both. Both stages are 16:9 so the
 * canvas keeps its aspect and an expansion reads as the view pulling back
 * from a genuinely larger tank. Proportions (waterline, sand band) match the
 * starter tank, so nothing already resting on the sand ends up mid-water by
 * more than a short re-settle.
 */
export const HABITAT_PROFILES: Record<HabitatStage, HabitatProfile> = {
  starter: { cost: 0, capacity: 12, bounds: TANK },
  expanded: {
    cost: 6_000,
    capacity: 20,
    bounds: { width: 1600, height: 900, waterTop: 64, sandTop: 820 },
  },
}

export function tankBoundsFor(stage: HabitatStage): TankBounds {
  return HABITAT_PROFILES[stage].bounds
}

export function capacityFor(stage: HabitatStage): number {
  return HABITAT_PROFILES[stage].capacity
}

export function nextHabitatStage(stage: HabitatStage): Exclude<HabitatStage, 'starter'> | undefined {
  return stage === 'starter' ? 'expanded' : undefined
}

export type FeederProfile = {
  /** Sim seconds between pellets when fish are hungry enough to need one. */
  dropSeconds: number
  cost: number
  /** Mature residents this throughput is designed to hold below distress.
   * Balance tests assert against this number, so it cannot drift silently. */
  supportsResidents: number
  /**
   * How many points along the tank the feeder drops from. Rate alone is not
   * enough: a single spout feeds whichever fish happen to live near it while
   * one at the far end starves in a tank that is overall well fed. Bigger
   * equipment spreads its food as well as dropping it faster.
   */
  spouts: number
}

/**
 * A mature resident gains hunger at `hungerPerSecondAdult` and each hearty
 * pellet relieves `hungerRelievedPerNutrition`, so one resident needs a
 * pellet roughly every 11 seconds. The drop intervals below are chosen to
 * cover their stated populations with a small margin — on hearty pellets;
 * a feeder still running crumbs or flakes visibly strains sooner, which only
 * hurries the shop's next offer along.
 *
 * `supportsResidents` is the *measured* safe band, not an aspiration: each
 * tier is asserted to hold that many mature residents below distress for ten
 * simulated minutes (tests/progression.test.ts). The rotary already covers
 * the expanded habitat, which is why the ladder stops there.
 */
export const FEEDER_PROFILES: Record<Exclude<FeederStage, 'none'>, FeederProfile> = {
  drip: { dropSeconds: 3, cost: 250, supportsResidents: 4, spouts: 1 },
  twin: { dropSeconds: 1.5, cost: 650, supportsResidents: 12, spouts: 2 },
  rotary: { dropSeconds: 0.75, cost: 1_500, supportsResidents: 20, spouts: 4 },
}

/**
 * Where the next pellet falls. A single-spout feeder always drips into the
 * same corner, so fish must come to it; wider equipment has spouts spread
 * across the tank and uses the one nearest the fish that needs feeding.
 */
export function feederDropX(profile: FeederProfile, towardX: number, tankWidth: number): number {
  if (profile.spouts <= 1) return tankWidth - 80
  const margin = 120
  const span = tankWidth - margin * 2
  const step = span / (profile.spouts - 1)
  const index = Math.round((towardX - margin) / step)
  return margin + step * Math.min(profile.spouts - 1, Math.max(0, index))
}

export type FilterProfile = {
  cost: number
  /** Pollution removed from every water cell per second at full efficiency. */
  clearPerSecond: number
  /** Debris count at which efficiency halves — filters clog, so solid waste
   * still has to be siphoned rather than left for the filter to swallow. */
  cloggingDebris: number
}

/**
 * Clearance is sized against a real tank's load: a dozen fed residents leave
 * well over a hundred droppings, each leaching pollution every second. The
 * clogging point is set from that same reality — a tidy tank runs the sponge
 * near its rated rate, while a neglected one chokes it, so the siphon keeps
 * mattering instead of being replaced by the filter.
 */
export const FILTER_PROFILES: Record<Exclude<FilterStage, 'none'>, FilterProfile> = {
  sponge: { cost: 550, clearPerSecond: 0.016, cloggingDebris: 45 },
}

/** The next stage up, or undefined when the line is complete. */
export function nextFeederStage(stage: FeederStage): Exclude<FeederStage, 'none'> | undefined {
  if (stage === 'none') return 'drip'
  if (stage === 'drip') return 'twin'
  if (stage === 'twin') return 'rotary'
  return undefined
}

export function nextFilterStage(stage: FilterStage): Exclude<FilterStage, 'none'> | undefined {
  return stage === 'none' ? 'sponge' : undefined
}

export function feederProfile(stage: FeederStage): FeederProfile | undefined {
  return stage === 'none' ? undefined : FEEDER_PROFILES[stage]
}

export function filterProfile(stage: FilterStage): FilterProfile | undefined {
  return stage === 'none' ? undefined : FILTER_PROFILES[stage]
}
