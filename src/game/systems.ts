import {
  feederDropX,
  feederProfile,
  filterProfile,
  nextFeederStage,
  nextFilterStage,
} from './equipment'
import { generateName, inheritGenome } from './genome'
import {
  fishLength,
  TANK,
  TUNING,
  type Entity,
  type Vec2,
} from './model'
import {
  addEntity,
  discover,
  emit,
  hasDiscovered,
  livingFish,
  recordJournal,
  removeEntity,
  residentCount,
  spawnFish,
  spawnPellet,
  takenNames,
  type GameState,
} from './state'
import {
  addPollution,
  clearPollutionEverywhere,
  maxPollution,
  pollutionAt,
  randomWaterPoint,
  stepWater,
} from './water'

/**
 * The simulation's mode for one fixed tick. `'visible'` is the only mode
 * where fatal neglect can kill a fish. `'offline'` is slowed catch-up
 * simulation, which additionally clamps hunger/sickness deterioration so
 * absence is never catastrophic. `'background'` (a hidden/throttled tab)
 * runs the same numeric partitioning as `'visible'` but neither kills nor
 * clamps deterioration.
 */
export type SimulationMode = 'visible' | 'background' | 'offline'

/** Copy of a query's entities in id order, so iteration (and therefore RNG
 * consumption and float summation) is identical before and after save/load —
 * miniplex's swap-remove otherwise reorders the underlying arrays. */
function sortedById<T extends Entity>(query: Iterable<T>): T[] {
  return [...query].sort((a, b) => a.id - b.id)
}

export function stepTick(state: GameState, dt: number, mode: SimulationMode): void {
  state.time += dt
  hungerSystem(state, dt, mode)
  movementSystem(state, dt)
  eatingSystem(state)
  digestionSystem(state)
  waterSystem(state, dt)
  sicknessSystem(state, dt, mode)
  healthSystem(state, dt, mode)
  breedingSystem(state)
  feederSystem(state, dt)
  filtrationSystem(state, dt)
  economySystem(state, dt)
  developmentSystem(state, dt)
  cleanupSystem(state, dt)
}

function hungerSystem(state: GameState, dt: number, mode: SimulationMode): void {
  for (const entity of sortedById(state.world.with('physiology', 'genome'))) {
    const body = entity.physiology
    body.ageSeconds += dt
    const maturity = Math.min(1, body.weight / entity.genome.maxWeight)
    const satiation = body.hunger < TUNING.satiationBelow ? TUNING.satiationFactor : 1
    const rate = TUNING.hungerPerSecondAdult * (0.45 + 0.55 * maturity) * satiation
    const ceiling = mode === 'offline' ? TUNING.offlineHungerCeiling : 1
    body.hunger = Math.min(ceiling, body.hunger + rate * dt)
    if (body.hunger >= 1) {
      body.weight = Math.max(0.5, body.weight - 0.005 * dt)
    }
  }
}

const EAT_HUNGER_CUTOFF = 0.08

/** Hunger difference below which two fish count as equally hungry, so
 * proximity decides which of them chases a contested pellet. */
const HUNGER_PRIORITY_MARGIN = 0.05

function edibleFood(state: GameState): Entity[] {
  return sortedById(state.world.with('food')).filter((entity) => !entity.food!.spoiled)
}

/**
 * The pellet a fish should swim for: the nearest one it can win.
 *
 * Contested food goes to the hungrier fish. Distance alone is not enough —
 * a comfortable fish that happens to be nearer would otherwise intercept
 * every pellet the feeder dropped for a starving one, which starved a
 * resident in a tank that was overall well fed. A fish only defers to a
 * claimant that is closer *and* at least as hungry as it is.
 */
function nearestEdibleFood(
  state: GameState,
  seeker: SteerableEntity,
  claims: FoodClaims,
): Entity | undefined {
  const from = seeker.position
  const hunger = seeker.physiology.hunger
  let best: Entity | undefined
  let bestDistance = Infinity
  for (const entity of edibleFood(state)) {
    const distance = Math.hypot(entity.position.x - from.x, entity.position.y - from.y)
    if (distance >= bestDistance) continue
    const claimantId = claims.get(entity.id)
    if (claimantId !== undefined && claimantId !== seeker.id) {
      const claimant = state.byId.get(claimantId)
      const claimantHunger = claimant?.physiology?.hunger ?? 1
      const claimantDistance = claimant
        ? Math.hypot(entity.position.x - claimant.position.x, entity.position.y - claimant.position.y)
        : Infinity
      // Need comes first, proximity only breaks ties between equals.
      const claimantWins =
        claimantHunger > hunger + HUNGER_PRIORITY_MARGIN ||
        (Math.abs(claimantHunger - hunger) <= HUNGER_PRIORITY_MARGIN && claimantDistance < distance)
      if (claimantWins) continue
    }
    best = entity
    bestDistance = distance
  }
  return best
}

/** Displace whoever was heading for this pellet, so two fish never race for
 * the same one; the loser re-evaluates on the next tick. */
function displaceClaimant(state: GameState, claims: FoodClaims, foodId: number, winnerId: number): void {
  const loserId = claims.get(foodId)
  if (loserId === undefined || loserId === winnerId) return
  const loser = state.byId.get(loserId)
  if (loser?.behaviour?.activity.kind === 'seekFood' && loser.behaviour.activity.foodId === foodId) {
    loser.behaviour.activity = wanderActivity(state)
  }
}

/** Food ids already being swum towards this tick, keyed by the fish. */
type FoodClaims = Map<number, number>

function collectFoodClaims(state: GameState): FoodClaims {
  const claims: FoodClaims = new Map()
  // Id order, like every other system: if two fish ever pointed at the same
  // pellet, the winner must not depend on Miniplex's internal array order,
  // which swap-removes reshuffle and a reload rebuilds differently.
  for (const entity of sortedById(state.world.with('behaviour'))) {
    const activity = entity.behaviour.activity
    if (activity.kind === 'seekFood') claims.set(activity.foodId, entity.id)
  }
  return claims
}

/** Move a fish's claim to a new pellet (or drop it when it stops seeking). */
function reclaim(claims: FoodClaims, fishId: number, foodId: number | undefined): void {
  for (const [food, holder] of claims) {
    if (holder === fishId) claims.delete(food)
  }
  if (foodId !== undefined) claims.set(foodId, fishId)
}

function movementSystem(state: GameState, dt: number): void {
  const claims = collectFoodClaims(state)
  for (const entity of sortedById(state.world.with('behaviour', 'physiology', 'genome'))) {
    steerFish(state, entity, dt, claims)
  }
  for (const entity of state.world.with('food')) {
    sinkToSand(entity, dt, 26, TANK.sandTop + 6, () => (entity.food.restingOnSand = true))
  }
  for (const entity of state.world.with('waste')) {
    sinkToSand(entity, dt, 34, TANK.sandTop + 14, () => (entity.waste.restingOnSand = true))
  }
  for (const entity of state.world.with('egg')) {
    sinkToSand(entity, dt, 20, TANK.sandTop - 4, () => undefined)
  }
  for (const entity of state.world.with('remains')) {
    entity.position.y = Math.max(TANK.waterTop + 14, entity.position.y - 18 * dt)
  }
}

function sinkToSand(entity: Entity, dt: number, speed: number, restY: number, onLand: () => void): void {
  if (entity.position.y >= restY) {
    entity.position.y = restY
    entity.velocity.x = 0
    entity.velocity.y = 0
    onLand()
    return
  }
  entity.position.y += speed * dt
  entity.position.x += entity.velocity.x * dt
  entity.velocity.x *= 1 - Math.min(1, 0.6 * dt)
}

type SteerableEntity = Entity & Required<Pick<Entity, 'behaviour' | 'physiology' | 'genome'>>

function steerFish(
  state: GameState,
  entity: SteerableEntity,
  dt: number,
  claims: FoodClaims,
): void {
  const behaviour = entity.behaviour
  const body = entity.physiology
  const maturity = Math.min(1, body.weight / entity.genome.maxWeight)
  const speedScale = (0.55 + 0.45 * maturity) * (1 - 0.5 * body.sickness)
  const cruise = entity.genome.speed * speedScale

  // Re-evaluate what the fish wants to do. A starving fish must still chase
  // food — the death warning exists so the player can rescue it by feeding.
  const starving = body.hunger >= 0.999
  const gravelyIll = body.sickness >= 0.75
  if (starving || gravelyIll) {
    const food = starving ? nearestEdibleFood(state, entity, claims) : undefined
    if (food) displaceClaimant(state, claims, food.id, entity.id)
    behaviour.activity = food ? { kind: 'seekFood', foodId: food.id } : { kind: 'distress' }
    reclaim(claims, entity.id, food?.id)
  } else if (behaviour.activity.kind === 'court') {
    // Courtship yields to a real appetite: no fish should starve mid-dance.
    const partner = state.byId.get(behaviour.activity.partnerId)
    if (!partner?.resident || body.hunger > TUNING.distressHungerAbove) {
      behaviour.activity = wanderActivity(state)
    }
  } else if (body.hunger > TUNING.seekFoodAbove) {
    const food = nearestEdibleFood(state, entity, claims)
    if (food) {
      displaceClaimant(state, claims, food.id, entity.id)
      behaviour.activity = { kind: 'seekFood', foodId: food.id }
      reclaim(claims, entity.id, food.id)
    } else if (behaviour.activity.kind === 'seekFood') {
      behaviour.activity = wanderActivity(state)
      reclaim(claims, entity.id, undefined)
    }
  } else if (behaviour.activity.kind === 'seekFood' || behaviour.activity.kind === 'distress') {
    behaviour.activity = wanderActivity(state)
    reclaim(claims, entity.id, undefined)
  }

  let desired: Vec2 = { x: 0, y: 0 }
  const activity = behaviour.activity
  if (activity.kind === 'wander') {
    const distance = Math.hypot(activity.target.x - entity.position.x, activity.target.y - entity.position.y)
    if (distance < 24 && state.time >= activity.idleUntil) {
      behaviour.activity = wanderActivity(state)
    } else if (distance >= 24) {
      desired = toward(entity.position, activity.target, cruise * 0.5)
    }
  } else if (activity.kind === 'seekFood') {
    const food = state.byId.get(activity.foodId)
    if (food?.food && !food.food.spoiled) {
      desired = toward(entity.position, food.position, cruise)
    } else {
      behaviour.activity = wanderActivity(state)
    }
  } else if (activity.kind === 'court') {
    const partner = state.byId.get(activity.partnerId)
    if (partner) {
      const angle = state.time * 1.6 + entity.id
      const orbit = {
        x: partner.position.x + Math.cos(angle) * 46,
        y: partner.position.y + Math.sin(angle) * 30,
      }
      desired = toward(entity.position, orbit, cruise * 0.7)
    }
  } else if (activity.kind === 'distress') {
    const target = starving
      ? { x: entity.position.x, y: TANK.waterTop + 30 }
      : { x: entity.position.x, y: TANK.sandTop - 40 }
    desired = toward(entity.position, target, cruise * 0.3)
  }

  const smoothing = Math.min(1, 2.2 * dt)
  entity.velocity.x += (desired.x - entity.velocity.x) * smoothing
  entity.velocity.y += (desired.y - entity.velocity.y) * smoothing
  entity.position.x += entity.velocity.x * dt
  entity.position.y += entity.velocity.y * dt

  const halfLength = fishLength(body.weight) / 2
  entity.position.x = clamp(entity.position.x, halfLength, TANK.width - halfLength)
  entity.position.y = clamp(entity.position.y, TANK.waterTop + 20, TANK.sandTop - 10)
  if (Math.abs(entity.velocity.x) > 3) behaviour.facing = entity.velocity.x > 0 ? 1 : -1
}

function wanderActivity(state: GameState) {
  return {
    kind: 'wander' as const,
    target: randomWaterPoint(state.rng),
    idleUntil: state.time + state.rng.range(1.5, 5),
  }
}

function toward(from: Vec2, to: Vec2, speed: number): Vec2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy) || 1
  return { x: (dx / distance) * speed, y: (dy / distance) * speed }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function eatingSystem(state: GameState): void {
  for (const entity of sortedById(state.world.with('behaviour', 'physiology', 'genome'))) {
    const behaviour = entity.behaviour
    const body = entity.physiology
    if (behaviour.activity.kind !== 'seekFood' || body.hunger < EAT_HUNGER_CUTOFF) continue
    const food = state.byId.get(behaviour.activity.foodId)
    if (!food?.food || food.food.spoiled) continue
    const reach = Math.max(12, fishLength(body.weight) * 0.4)
    const distance = Math.hypot(food.position.x - entity.position.x, food.position.y - entity.position.y)
    if (distance > reach) continue

    const nutrition = food.food.nutrition
    removeEntity(state, food)
    body.hunger = Math.max(0, body.hunger - TUNING.hungerRelievedPerNutrition * nutrition)
    const headroom = Math.max(0, 1 - body.weight / entity.genome.maxWeight)
    const healthFactor = 1 - 0.6 * body.sickness
    body.weight += TUNING.growthPerNutrition * nutrition * headroom * healthFactor
    body.digesting += nutrition
    behaviour.activity = wanderActivity(state)
  }
}

function digestionSystem(state: GameState): void {
  for (const entity of sortedById(state.world.with('physiology'))) {
    const body = entity.physiology
    if (body.digesting < TUNING.digestionPerDropping) continue
    body.digesting -= TUNING.digestionPerDropping
    addEntity(state, {
      position: { x: entity.position.x, y: entity.position.y + 8 },
      velocity: { x: state.rng.range(-6, 6), y: 0 },
      waste: { size: 0.6 + body.weight * 0.05, restingOnSand: false },
    })
  }
}

function waterSystem(state: GameState, dt: number): void {
  for (const entity of sortedById(state.world.with('waste'))) {
    addPollution(state.water, entity.position, entity.waste.size * TUNING.wastePollutionPerSecond * dt)
  }
  for (const entity of sortedById(state.world.with('food'))) {
    const food = entity.food!
    if (!food.spoiled && state.time >= food.spoilsAt) food.spoiled = true
    if (food.spoiled) {
      addPollution(state.water, entity.position, food.nutrition * TUNING.spoiledFoodPollutionPerSecond * dt)
    }
  }
  stepWater(state.water, dt, TUNING.pollutionDiffusionPerSecond, TUNING.pollutionDecayPerSecond)
}

function sicknessSystem(state: GameState, dt: number, mode: SimulationMode): void {
  for (const entity of sortedById(state.world.with('physiology', 'genome'))) {
    const body = entity.physiology
    const pollution = pollutionAt(state.water, entity.position)
    if (pollution > TUNING.sicknessAbovePollution) {
      const exposure = (pollution - TUNING.sicknessAbovePollution) / (1 - TUNING.sicknessAbovePollution)
      const susceptibility = 1 - 0.7 * entity.genome.resilience
      const ceiling = mode === 'offline' ? TUNING.offlineSicknessCeiling : 1
      body.sickness = Math.min(
        ceiling,
        body.sickness + exposure * susceptibility * TUNING.sicknessPerSecondAtFullPollution * dt,
      )
    } else {
      body.sickness = Math.max(0, body.sickness - TUNING.sicknessRecoveryPerSecond * dt)
    }
  }
}

function healthSystem(state: GameState, dt: number, mode: SimulationMode): void {
  for (const entity of sortedById(state.world.with('physiology', 'resident', 'genome'))) {
    const body = entity.physiology
    const distressed =
      body.hunger > TUNING.distressHungerAbove || body.sickness > TUNING.distressSicknessAbove
    const critical = body.hunger >= 0.999 || body.sickness >= 0.75

    if (distressed && (body.lastWarningAt === undefined || state.time - body.lastWarningAt > 45)) {
      body.lastWarningAt = state.time
      const cause = body.hunger > TUNING.distressHungerAbove ? 'is starving — drop some food' : 'feels sick — the water needs cleaning'
      emit(state, { type: 'toast', tone: 'warning', message: `${entity.resident.name} ${cause}!` })
    }
    if (!distressed) body.lastWarningAt = undefined

    // Fatal neglect is gated to 'visible': the player must be able to see
    // the tank for a death to occur.
    if (critical && mode === 'visible') {
      if (body.criticalSince === undefined) body.criticalSince = state.time
      body.health = Math.max(0, body.health - TUNING.healthLossPerSecond * dt)
      const warnedLongEnough = state.time - body.criticalSince >= TUNING.warningGraceSeconds
      if (body.health <= 0 && warnedLongEnough) {
        dieOf(state, entity)
      }
    } else if (!critical) {
      body.criticalSince = undefined
      if (body.hunger < 0.5 && body.sickness < 0.3) {
        body.health = Math.min(1, body.health + TUNING.healthRegenPerSecond * dt)
      }
    }
  }
}

type DyingEntity = Entity & Required<Pick<Entity, 'resident' | 'physiology' | 'genome'>>

function dieOf(state: GameState, entity: DyingEntity): void {
  const name = entity.resident.name
  removeEntity(state, entity)
  // Remains keep only what the corpse animation draws; the live components
  // die with the fish.
  addEntity(state, {
    position: { ...entity.position },
    velocity: { x: 0, y: 0 },
    remains: {
      name,
      genome: entity.genome,
      weight: entity.physiology.weight,
      expiresAt: state.time + TUNING.remainsLingerSeconds,
    },
  })
  state.retiredNames.push(name)
  if (state.retiredNames.length > 40) state.retiredNames.shift()
  emit(state, { type: 'death', name })
  emit(state, { type: 'toast', tone: 'warning', message: `${name} has died.` })
  recordJournal(state, 'death', `${name} died.`)
  // An incubating egg means the tank is not actually lost yet.
  if (livingFish(state).length === 0 && state.world.with('egg').entities.length === 0) {
    state.gameOver = true
    emit(state, { type: 'gameOver' })
    recordJournal(state, 'death', 'The tank fell quiet — no fish remain.')
  }
}

function breedingSystem(state: GameState): void {
  // Hatch or advance incubating eggs.
  for (const entity of sortedById(state.world.with('egg'))) {
    const egg = entity.egg!
    egg.peakPollution = Math.max(egg.peakPollution, pollutionAt(state.water, entity.position))
    if (state.time < egg.hatchAt) continue
    removeEntity(state, entity)
    const murky = egg.peakPollution > TUNING.murkyEggPollution
    const genome = { ...egg.genome }
    if (murky) {
      genome.maxWeight *= 0.75
      genome.resilience *= 0.6
    }
    state.gameOver = false // defensive: a hatchling always means a living tank
    const baby = spawnFish(state, {
      genome,
      name: generateName(state.rng, takenNames(state)),
      weight: TUNING.babyWeight,
      generation: egg.generation,
      parents: egg.parents,
      hatchedInMurkyWater: murky,
      position: { x: entity.position.x, y: entity.position.y - 30 },
      hunger: 0.5,
    })
    emit(state, { type: 'birth', name: baby.resident.name })
    emit(state, {
      type: 'toast',
      tone: 'development',
      message: murky
        ? `The egg hatched — welcome, ${baby.resident.name}. The murky water has left them small and delicate.`
        : `The egg hatched — welcome, ${baby.resident.name}. You can see both parents in their colours.`,
    })
    recordJournal(
      state,
      'birth',
      `${baby.resident.name} hatched — child of ${egg.parents[0]} & ${egg.parents[1]}.${
        murky ? ' The murky water left them small and delicate.' : ''
      }`,
    )
  }

  // Complete courtships whose dance has finished.
  for (const entity of sortedById(state.world.with('behaviour', 'breeding', 'resident', 'genome'))) {
    const behaviour = entity.behaviour
    if (behaviour.activity.kind !== 'court' || state.time < behaviour.activity.until) continue
    const partner = state.byId.get(behaviour.activity.partnerId)
    const reciprocal =
      partner?.behaviour?.activity.kind === 'court' && partner.behaviour.activity.partnerId === entity.id
    if (!partner?.resident || !partner.behaviour || !partner.breeding || !partner.genome || !reciprocal) {
      behaviour.activity = { kind: 'wander', target: { ...entity.position }, idleUntil: 0 }
      continue
    }
    const midpoint = {
      x: (entity.position.x + partner.position.x) / 2,
      y: (entity.position.y + partner.position.y) / 2,
    }
    const generation = Math.max(entity.resident.generation, partner.resident.generation) + 1
    addEntity(state, {
      position: midpoint,
      velocity: { x: 0, y: 0 },
      egg: {
        hatchAt: state.time + TUNING.eggHatchSeconds,
        genome: inheritGenome(state.rng, entity.genome, partner.genome),
        parents: [entity.resident.name, partner.resident.name],
        generation,
        peakPollution: pollutionAt(state.water, midpoint),
      },
    })
    entity.breeding.cooldownUntil = state.time + TUNING.breedingCooldownSeconds
    partner.breeding.cooldownUntil = state.time + TUNING.breedingCooldownSeconds
    behaviour.activity = { kind: 'wander', target: { ...entity.position }, idleUntil: 0 }
    partner.behaviour.activity = { kind: 'wander', target: { ...partner.position }, idleUntil: 0 }
    if (discover(state, 'eggSeen')) {
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: 'Two of your fish have been circling each other… an egg now rests on the sand.',
      })
    } else {
      emit(state, { type: 'toast', tone: 'info', message: 'Another egg rests on the sand.' })
    }
    recordJournal(
      state,
      'development',
      `${entity.resident.name} & ${partner.resident.name} left an egg on the sand.`,
    )
  }

  // Pair up newly eligible couples.
  const population = residentCount(state) + state.world.with('egg').entities.length
  if (population >= TUNING.maxPopulation) return
  const eligible = livingFish(state).filter(
    (entity) =>
      entity.behaviour.activity.kind !== 'court' &&
      entity.physiology.weight >= entity.genome.maxWeight * TUNING.breedingMinWeightFraction &&
      entity.physiology.hunger < TUNING.breedingMaxHunger &&
      entity.physiology.sickness < TUNING.breedingMaxSickness &&
      state.time >= entity.breeding.cooldownUntil &&
      pollutionAt(state.water, entity.position) < TUNING.breedingMaxPollution,
  )
  if (eligible.length < 2) return
  const [a, b] = eligible
  const until = state.time + TUNING.courtshipSeconds
  a.behaviour.activity = { kind: 'court', partnerId: b.id, until }
  b.behaviour.activity = { kind: 'court', partnerId: a.id, until }
}

/**
 * The feeder drops a pellet for hungry fish, spending player coins. Faster
 * equipment shortens the interval but never scatters food: a pellet is only
 * dropped for a hungry fish that has not already earmarked one, so
 * automation does not become a pollution generator. Counting total pellets
 * instead would leave a fish waiting indefinitely whenever the food already
 * in the water is all spoken for by others.
 *
 * Every moment a hungry fish is left waiting is recorded as the shortfall
 * that eventually reveals the next feeder tier.
 */
function feederSystem(state: GameState, dt: number): void {
  const profile = feederProfile(state.equipment.feeder)
  if (!profile) return

  const waiting = livingFish(state).filter((entity) => {
    if (entity.physiology.hunger <= TUNING.feederFeedsAbove) return false
    const activity = entity.behaviour.activity
    if (activity.kind !== 'seekFood') return true
    const target = state.byId.get(activity.foodId)
    return !target?.food || target.food.spoiled
  })
  const behind = waiting.length > 0
  if (behind) state.care.feederShortfallSeconds += dt

  if (!behind || state.coins < TUNING.pelletCost) return
  if (state.time - state.feederLastDropAt < profile.dropSeconds) return
  state.coins -= TUNING.pelletCost
  state.feederLastDropAt = state.time
  // Drop from whichever spout is nearest the hungriest waiting fish, so food
  // arrives where it is needed instead of always in the same corner.
  const neediest = waiting.reduce((worst, entity) =>
    entity.physiology.hunger > worst.physiology.hunger ? entity : worst,
  )
  spawnPellet(state, feederDropX(profile, neediest.position.x, TANK.width))
  state.feederDropCount += 1
}

/**
 * A filter pulls dispersed pollution out of the water column. It clogs as
 * solid debris accumulates, so it buys headroom without retiring the siphon:
 * a tank left full of droppings filters at a fraction of its rated rate, and
 * the droppings themselves still have to be lifted out by hand.
 */
function filtrationSystem(state: GameState, dt: number): void {
  const profile = filterProfile(state.equipment.filter)
  if (!profile) return
  const debris =
    state.world.with('waste').entities.length +
    [...state.world.with('food')].filter((entity) => entity.food!.spoiled).length
  const efficiency = profile.cloggingDebris / (profile.cloggingDebris + debris)
  clearPollutionEverywhere(state.water, profile.clearPerSecond * efficiency * dt)
}

function economySystem(state: GameState, dt: number): void {
  const totalWeight = livingFish(state).reduce((sum, entity) => sum + entity.physiology.weight, 0)
  state.coins += (TUNING.incomeFloor + TUNING.incomePerGram * totalWeight) * dt
}

/**
 * The one place hidden developments are revealed. Every branch reads the
 * pressure the player created — growth, murk, population, a feeder falling
 * behind, repeated cleaning — and announces what changed in observable
 * terms. Thresholds and counters never appear in the copy: the player is
 * told the hopper empties as fast as it turns, not that they crossed 75
 * seconds of shortfall.
 */
function developmentSystem(state: GameState, dt: number): void {
  // Sustained murk is one of the two routes to filtration; record it before
  // anything else this tick can clear the water.
  if (maxPollution(state.water) >= TUNING.pollutionNoticedAt) {
    state.care.pollutedSeconds += dt
  }

  if (!hasDiscovered(state, 'growthNoticed')) {
    const grown = livingFish(state).find(
      (entity) =>
        entity.resident.generation === 1 &&
        entity.physiology.weight >= TUNING.starterWeight * TUNING.growthNoticedAtMultiple,
    )
    if (grown && discover(state, 'growthNoticed')) {
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: `${grown.resident.name} looks noticeably bigger than when they arrived. Bigger fish eat more — and leave more behind.`,
      })
      recordJournal(state, 'development', `${grown.resident.name} grew noticeably bigger.`)
    }
  }

  if (
    !hasDiscovered(state, 'pollutionNoticed') &&
    maxPollution(state.water) >= TUNING.pollutionNoticedAt
  ) {
    discover(state, 'pollutionNoticed')
    discover(state, 'siphonOffered')
    emit(state, {
      type: 'toast',
      tone: 'development',
      message: 'The water is taking on a green tinge where things settle on the sand.',
    })
    emit(state, {
      type: 'toast',
      tone: 'info',
      message: 'New in the shop: a gravel siphon, for cleaning up waste.',
    })
    recordJournal(state, 'development', 'The water took on its first green tinge.')
  }

  if (
    !hasDiscovered(state, 'dripFeederOffered') &&
    residentCount(state) >= TUNING.feederOfferedAtResidents
  ) {
    discover(state, 'dripFeederOffered')
    emit(state, {
      type: 'toast',
      tone: 'info',
      message: 'Feeding this many mouths by hand is becoming a chore. The shop has a drip feeder.',
    })
    recordJournal(state, 'development', 'The shop began offering a drip feeder.')
  }

  // Each feeder tier is revealed by the previous one visibly struggling.
  if (state.care.feederShortfallSeconds >= TUNING.feederStrainForNextTier) {
    const upgrade = nextFeederStage(state.equipment.feeder)
    if (upgrade === 'twin' && discover(state, 'twinHopperOffered')) {
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: 'The drip feeder empties almost as soon as it turns, and there are still hungry mouths waiting. A twin hopper would keep up.',
      })
      recordJournal(state, 'development', 'The drip feeder began falling behind the tank.')
    } else if (upgrade === 'rotary' && discover(state, 'rotaryFeederOffered')) {
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: 'Even the twin hopper runs dry between rounds now. A rotary feeder could serve a full tank.',
      })
      recordJournal(state, 'development', 'The twin hopper began falling behind the tank.')
    }
  }

  // Filtration follows either sustained murk or a player who keeps cleaning —
  // but only once they own a siphon. Offering a filter "for between
  // cleanings" to someone who has never cleaned makes no sense, and it would
  // jump the queue ahead of the siphon in the opening.
  if (
    !hasDiscovered(state, 'spongeFilterOffered') &&
    state.equipment.siphon &&
    nextFilterStage(state.equipment.filter)
  ) {
    const cleanedOften = state.care.siphonUses >= TUNING.filterOfferedAfterSiphonUses
    const murkPersists = state.care.pollutedSeconds >= TUNING.filterOfferedAfterPollutedSeconds
    if ((cleanedOften || murkPersists) && discover(state, 'spongeFilterOffered')) {
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: cleanedOften
          ? 'You have been cleaning this tank a great deal. A sponge filter would work the water between visits.'
          : 'The green never quite leaves the water now. A sponge filter would work at it continuously.',
      })
      recordJournal(state, 'development', 'The shop began offering a sponge filter.')
    }
  }

  if (!hasDiscovered(state, 'fishOffered')) {
    const thriving = livingFish(state).find(
      (entity) => entity.physiology.weight >= TUNING.fishUnlockWeight,
    )
    if (thriving && discover(state, 'fishOffered')) {
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: `Word is spreading about ${thriving.resident.name}. The shop can now source another glimmerfin.`,
      })
      recordJournal(
        state,
        'development',
        `Word spread about ${thriving.resident.name}; the shop can source another glimmerfin.`,
      )
    }
  }
}

function cleanupSystem(state: GameState, dt: number): void {
  for (const entity of [...state.world.with('remains')]) {
    if (state.time >= entity.remains.expiresAt) removeEntity(state, entity)
  }
  // Debris breaks down on its own (having already leached pollution), so a
  // neglected tank converts mess into water quality rather than accumulating
  // entities without bound over a long session.
  for (const entity of sortedById(state.world.with('waste'))) {
    entity.waste!.size -= TUNING.wasteBreakdownPerSecond * dt
    if (entity.waste!.size <= 0.15) removeEntity(state, entity)
  }
  for (const entity of sortedById(state.world.with('food'))) {
    if (entity.food!.spoiled && state.time >= entity.food!.spoilsAt + TUNING.spoiledFoodLingerSeconds) {
      removeEntity(state, entity)
    }
  }
}
