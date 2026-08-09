import { generateName, inheritGenome } from './genome'
import { fishLength, TANK, TUNING, type Entity, type Vec2 } from './model'
import {
  addEntity,
  emit,
  livingFish,
  recordJournal,
  removeEntity,
  spawnFish,
  spawnPellet,
  takenNames,
  type GameState,
} from './state'
import {
  addPollution,
  maxPollution,
  pollutionAt,
  randomWaterPoint,
  stepWater,
} from './water'

/**
 * Context for one fixed tick. `visible` gates fatal neglect (death may only
 * happen while the player can see the tank); `offline` marks slowed catch-up
 * simulation, which additionally clamps deterioration so absence is never
 * catastrophic.
 */
export type TickFlags = { visible: boolean; offline: boolean }

/** Copy of a query's entities in id order, so iteration (and therefore RNG
 * consumption and float summation) is identical before and after save/load —
 * miniplex's swap-remove otherwise reorders the underlying arrays. */
function sortedById<T extends Entity>(query: Iterable<T>): T[] {
  return [...query].sort((a, b) => a.id - b.id)
}

export function stepTick(state: GameState, dt: number, flags: TickFlags): void {
  state.time += dt
  hungerSystem(state, dt, flags)
  movementSystem(state, dt)
  eatingSystem(state)
  digestionSystem(state)
  waterSystem(state, dt)
  sicknessSystem(state, dt, flags)
  healthSystem(state, dt, flags)
  breedingSystem(state)
  feederSystem(state)
  economySystem(state, dt)
  developmentSystem(state)
  cleanupSystem(state, dt)
}

function hungerSystem(state: GameState, dt: number, flags: TickFlags): void {
  for (const entity of sortedById(state.world.with('fish'))) {
    const fish = entity.fish
    fish.ageSeconds += dt
    const maturity = Math.min(1, fish.weight / fish.genome.maxWeight)
    const satiation = fish.hunger < TUNING.satiationBelow ? TUNING.satiationFactor : 1
    const rate = TUNING.hungerPerSecondAdult * (0.45 + 0.55 * maturity) * satiation
    const ceiling = flags.offline ? TUNING.offlineHungerCeiling : 1
    fish.hunger = Math.min(ceiling, fish.hunger + rate * dt)
    if (fish.hunger >= 1) {
      fish.weight = Math.max(0.5, fish.weight - 0.005 * dt)
    }
  }
}

const EAT_HUNGER_CUTOFF = 0.08

function edibleFood(state: GameState): Entity[] {
  return sortedById(state.world.with('food')).filter((entity) => !entity.food!.spoiled)
}

function nearestEdibleFood(state: GameState, from: Vec2): Entity | undefined {
  let best: Entity | undefined
  let bestDistance = Infinity
  for (const entity of edibleFood(state)) {
    const distance = Math.hypot(entity.position.x - from.x, entity.position.y - from.y)
    if (distance < bestDistance) {
      best = entity
      bestDistance = distance
    }
  }
  return best
}

function movementSystem(state: GameState, dt: number): void {
  for (const entity of sortedById(state.world.with('fish'))) {
    steerFish(state, entity, dt)
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

function steerFish(state: GameState, entity: Entity, dt: number): void {
  const fish = entity.fish!
  const maturity = Math.min(1, fish.weight / fish.genome.maxWeight)
  const speedScale = (0.55 + 0.45 * maturity) * (1 - 0.5 * fish.sickness)
  const cruise = fish.genome.speed * speedScale

  // Re-evaluate what the fish wants to do. A starving fish must still chase
  // food — the death warning exists so the player can rescue it by feeding.
  const starving = fish.hunger >= 0.999
  const gravelyIll = fish.sickness >= 0.75
  if (starving || gravelyIll) {
    const food = starving ? nearestEdibleFood(state, entity.position) : undefined
    fish.activity = food ? { kind: 'seekFood', foodId: food.id } : { kind: 'distress' }
  } else if (fish.activity.kind === 'court') {
    const partner = state.byId.get(fish.activity.partnerId)
    if (!partner?.fish) fish.activity = wanderActivity(state)
  } else if (fish.hunger > TUNING.seekFoodAbove) {
    const food = nearestEdibleFood(state, entity.position)
    if (food) fish.activity = { kind: 'seekFood', foodId: food.id }
    else if (fish.activity.kind === 'seekFood') fish.activity = wanderActivity(state)
  } else if (fish.activity.kind === 'seekFood' || fish.activity.kind === 'distress') {
    fish.activity = wanderActivity(state)
  }

  let desired: Vec2 = { x: 0, y: 0 }
  const activity = fish.activity
  if (activity.kind === 'wander') {
    const distance = Math.hypot(activity.target.x - entity.position.x, activity.target.y - entity.position.y)
    if (distance < 24 && state.time >= activity.idleUntil) {
      fish.activity = wanderActivity(state)
    } else if (distance >= 24) {
      desired = toward(entity.position, activity.target, cruise * 0.5)
    }
  } else if (activity.kind === 'seekFood') {
    const food = state.byId.get(activity.foodId)
    if (food?.food && !food.food.spoiled) {
      desired = toward(entity.position, food.position, cruise)
    } else {
      fish.activity = wanderActivity(state)
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

  const halfLength = fishLength(fish.weight) / 2
  entity.position.x = clamp(entity.position.x, halfLength, TANK.width - halfLength)
  entity.position.y = clamp(entity.position.y, TANK.waterTop + 20, TANK.sandTop - 10)
  if (Math.abs(entity.velocity.x) > 3) fish.facing = entity.velocity.x > 0 ? 1 : -1
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
  for (const entity of sortedById(state.world.with('fish'))) {
    const fish = entity.fish
    if (fish.activity.kind !== 'seekFood' || fish.hunger < EAT_HUNGER_CUTOFF) continue
    const food = state.byId.get(fish.activity.foodId)
    if (!food?.food || food.food.spoiled) continue
    const reach = Math.max(12, fishLength(fish.weight) * 0.4)
    const distance = Math.hypot(food.position.x - entity.position.x, food.position.y - entity.position.y)
    if (distance > reach) continue

    const nutrition = food.food.nutrition
    removeEntity(state, food)
    fish.hunger = Math.max(0, fish.hunger - TUNING.hungerRelievedPerNutrition * nutrition)
    const headroom = Math.max(0, 1 - fish.weight / fish.genome.maxWeight)
    const healthFactor = 1 - 0.6 * fish.sickness
    fish.weight += TUNING.growthPerNutrition * nutrition * headroom * healthFactor
    fish.digesting += nutrition
    fish.activity = wanderActivity(state)
  }
}

function digestionSystem(state: GameState): void {
  for (const entity of sortedById(state.world.with('fish'))) {
    const fish = entity.fish
    if (fish.digesting < TUNING.digestionPerDropping) continue
    fish.digesting -= TUNING.digestionPerDropping
    addEntity(state, {
      position: { x: entity.position.x, y: entity.position.y + 8 },
      velocity: { x: state.rng.range(-6, 6), y: 0 },
      waste: { size: 0.6 + fish.weight * 0.05, restingOnSand: false },
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

function sicknessSystem(state: GameState, dt: number, flags: TickFlags): void {
  for (const entity of sortedById(state.world.with('fish'))) {
    const fish = entity.fish
    const pollution = pollutionAt(state.water, entity.position)
    if (pollution > TUNING.sicknessAbovePollution) {
      const exposure = (pollution - TUNING.sicknessAbovePollution) / (1 - TUNING.sicknessAbovePollution)
      const susceptibility = 1 - 0.7 * fish.genome.resilience
      const ceiling = flags.offline ? TUNING.offlineSicknessCeiling : 1
      fish.sickness = Math.min(
        ceiling,
        fish.sickness + exposure * susceptibility * TUNING.sicknessPerSecondAtFullPollution * dt,
      )
    } else {
      fish.sickness = Math.max(0, fish.sickness - TUNING.sicknessRecoveryPerSecond * dt)
    }
  }
}

function healthSystem(state: GameState, dt: number, flags: TickFlags): void {
  for (const entity of sortedById(state.world.with('fish'))) {
    const fish = entity.fish!
    const distressed =
      fish.hunger > TUNING.distressHungerAbove || fish.sickness > TUNING.distressSicknessAbove
    const critical = fish.hunger >= 0.999 || fish.sickness >= 0.75

    if (distressed && (fish.lastWarningAt === undefined || state.time - fish.lastWarningAt > 45)) {
      fish.lastWarningAt = state.time
      const cause = fish.hunger > TUNING.distressHungerAbove ? 'is starving — drop some food' : 'feels sick — the water needs cleaning'
      emit(state, { type: 'toast', tone: 'warning', message: `${fish.name} ${cause}!` })
    }
    if (!distressed) fish.lastWarningAt = undefined

    if (critical && flags.visible && !flags.offline) {
      if (fish.criticalSince === undefined) fish.criticalSince = state.time
      fish.health = Math.max(0, fish.health - TUNING.healthLossPerSecond * dt)
      const warnedLongEnough = state.time - fish.criticalSince >= TUNING.warningGraceSeconds
      if (fish.health <= 0 && warnedLongEnough) {
        dieOf(state, entity)
      }
    } else if (!critical) {
      fish.criticalSince = undefined
      if (fish.hunger < 0.5 && fish.sickness < 0.3) {
        fish.health = Math.min(1, fish.health + TUNING.healthRegenPerSecond * dt)
      }
    }
  }
}

function dieOf(state: GameState, entity: Entity): void {
  const fish = entity.fish!
  removeEntity(state, entity)
  addEntity(state, {
    position: { ...entity.position },
    velocity: { x: 0, y: 0 },
    remains: { fish, expiresAt: state.time + TUNING.remainsLingerSeconds },
  })
  state.retiredNames.push(fish.name)
  if (state.retiredNames.length > 40) state.retiredNames.shift()
  emit(state, { type: 'death', name: fish.name })
  emit(state, { type: 'toast', tone: 'warning', message: `${fish.name} has died.` })
  recordJournal(state, 'death', `${fish.name} died.`)
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
    emit(state, { type: 'birth', name: baby.fish!.name })
    emit(state, {
      type: 'toast',
      tone: 'development',
      message: murky
        ? `The egg hatched — welcome, ${baby.fish!.name}. The murky water has left them small and delicate.`
        : `The egg hatched — welcome, ${baby.fish!.name}. You can see both parents in their colours.`,
    })
    recordJournal(
      state,
      'birth',
      `${baby.fish!.name} hatched — child of ${egg.parents[0]} & ${egg.parents[1]}.${
        murky ? ' The murky water left them small and delicate.' : ''
      }`,
    )
  }

  // Complete courtships whose dance has finished.
  for (const entity of sortedById(state.world.with('fish'))) {
    const fish = entity.fish
    if (fish.activity.kind !== 'court' || state.time < fish.activity.until) continue
    const partner = state.byId.get(fish.activity.partnerId)
    const reciprocal =
      partner?.fish?.activity.kind === 'court' && partner.fish.activity.partnerId === entity.id
    if (!partner?.fish || !reciprocal) {
      fish.activity = { kind: 'wander', target: { ...entity.position }, idleUntil: 0 }
      continue
    }
    const midpoint = {
      x: (entity.position.x + partner.position.x) / 2,
      y: (entity.position.y + partner.position.y) / 2,
    }
    const generation = Math.max(fish.generation, partner.fish.generation) + 1
    addEntity(state, {
      position: midpoint,
      velocity: { x: 0, y: 0 },
      egg: {
        hatchAt: state.time + TUNING.eggHatchSeconds,
        genome: inheritGenome(state.rng, fish.genome, partner.fish.genome),
        parents: [fish.name, partner.fish.name],
        generation,
        peakPollution: pollutionAt(state.water, midpoint),
      },
    })
    fish.breedingCooldownUntil = state.time + TUNING.breedingCooldownSeconds
    partner.fish.breedingCooldownUntil = state.time + TUNING.breedingCooldownSeconds
    fish.activity = { kind: 'wander', target: { ...entity.position }, idleUntil: 0 }
    partner.fish.activity = { kind: 'wander', target: { ...partner.position }, idleUntil: 0 }
    if (!state.unlocks.seenEgg) {
      state.unlocks.seenEgg = true
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: 'Two of your fish have been circling each other… an egg now rests on the sand.',
      })
    } else {
      emit(state, { type: 'toast', tone: 'info', message: 'Another egg rests on the sand.' })
    }
    recordJournal(state, 'development', `${fish.name} & ${partner.fish.name} left an egg on the sand.`)
  }

  // Pair up newly eligible couples.
  const population = state.world.with('fish').entities.length + state.world.with('egg').entities.length
  if (population >= TUNING.maxPopulation) return
  const eligible = livingFish(state).filter((entity) => {
    const fish = entity.fish!
    return (
      fish.activity.kind !== 'court' &&
      fish.weight >= fish.genome.maxWeight * TUNING.breedingMinWeightFraction &&
      fish.hunger < TUNING.breedingMaxHunger &&
      fish.sickness < TUNING.breedingMaxSickness &&
      state.time >= fish.breedingCooldownUntil &&
      pollutionAt(state.water, entity.position) < TUNING.breedingMaxPollution
    )
  })
  if (eligible.length < 2) return
  const [a, b] = eligible
  const until = state.time + TUNING.courtshipSeconds
  a.fish!.activity = { kind: 'court', partnerId: b.id, until }
  b.fish!.activity = { kind: 'court', partnerId: a.id, until }
}

/** The drip feeder drops a pellet for hungry fish, spending player coins. */
function feederSystem(state: GameState): void {
  if (!state.ownsFeeder || state.coins < TUNING.pelletCost) return
  if (state.time - state.feederLastDropAt < TUNING.feederDropSeconds) return
  const hungry = livingFish(state).filter(
    (entity) => entity.fish!.hunger > TUNING.feederFeedsAbove,
  )
  if (hungry.length === 0) return
  const pellets = [...state.world.with('food')].filter((e) => !e.food.spoiled).length
  if (pellets >= hungry.length) return
  state.coins -= TUNING.pelletCost
  state.feederLastDropAt = state.time
  spawnPellet(state, TANK.width - 80)
}

function economySystem(state: GameState, dt: number): void {
  const totalWeight = livingFish(state).reduce((sum, entity) => sum + entity.fish!.weight, 0)
  state.coins += (TUNING.incomeFloor + TUNING.incomePerGram * totalWeight) * dt
}

function developmentSystem(state: GameState): void {
  const unlocks = state.unlocks
  if (!unlocks.noticedGrowth) {
    const grown = livingFish(state).find(
      (entity) =>
        entity.fish!.generation === 1 &&
        entity.fish!.weight >= TUNING.starterWeight * TUNING.growthNoticedAtMultiple,
    )
    if (grown) {
      unlocks.noticedGrowth = true
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: `${grown.fish!.name} looks noticeably bigger than when they arrived. Bigger fish eat more — and leave more behind.`,
      })
      recordJournal(state, 'development', `${grown.fish!.name} grew noticeably bigger.`)
    }
  }
  if (!unlocks.noticedPollution && maxPollution(state.water) >= TUNING.pollutionNoticedAt) {
    unlocks.noticedPollution = true
    unlocks.siphonInShop = true
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
  if (!unlocks.feederInShop && livingFish(state).length >= 3) {
    unlocks.feederInShop = true
    emit(state, {
      type: 'toast',
      tone: 'info',
      message: 'The shop has something for busy caretakers: a drip feeder.',
    })
    recordJournal(state, 'development', 'The shop began offering a drip feeder.')
  }
  if (!unlocks.fishInShop) {
    const thriving = livingFish(state).find((entity) => entity.fish!.weight >= TUNING.fishUnlockWeight)
    if (thriving) {
      unlocks.fishInShop = true
      emit(state, {
        type: 'toast',
        tone: 'development',
        message: `Word is spreading about ${thriving.fish!.name}. The shop can now source another glimmerfin.`,
      })
      recordJournal(state, 'development', `Word spread about ${thriving.fish!.name}; the shop can source another glimmerfin.`)
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
