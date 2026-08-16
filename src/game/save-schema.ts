/**
 * The V1 save wire format: a strict Zod schema plus the two named passes
 * that turn untrusted JSON into a canonical `SaveFile` (src/game/save.ts).
 *
 * Kept separate from save.ts because the schema is large (five entity
 * archetypes, genome, activity, water, unlocks, events, journal) and this
 * module owns wire shape/validation only — no ECS or browser concerns.
 */
import { z } from 'zod'

import { DEVELOPMENT_IDS, MEAL_HISTORY_BATCH_LIMIT, type DevelopmentId } from './model'
import type { SaveFile } from './save'
import { WATER_COLS, WATER_ROWS } from './water'

const finite = () => z.number().finite()
const unit = () => finite().min(0).max(1)

const Vec2Schema = z.object({
  x: finite(),
  y: finite(),
})

const GenomeSchema = z.object({
  hue: finite().min(0).max(360),
  saturation: finite().min(0.45).max(0.95),
  maxWeight: finite().positive(),
  finShape: z.enum(['fan', 'forked', 'veil']),
  finFlair: unit(),
  bodyAspect: finite().min(0.3).max(0.6),
  pattern: z.enum(['plain', 'stripes', 'spots']),
  patternIntensity: unit(),
  speed: finite().positive(),
  resilience: unit(),
})

const FishActivitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('wander'), target: Vec2Schema, idleUntil: finite() }),
  z.object({ kind: z.literal('seekFood'), foodId: z.number().int().positive() }),
  z.object({ kind: z.literal('court'), partnerId: z.number().int().positive(), until: finite() }),
  z.object({ kind: z.literal('distress') }),
])

const FishSchema = z.object({
  name: z.string().min(1),
  genome: GenomeSchema,
  weight: finite().positive(),
  hunger: unit(),
  sickness: unit(),
  health: unit(),
  ageSeconds: finite().min(0),
  generation: z.number().int().min(1),
  parents: z.tuple([z.string(), z.string()]).optional(),
  hatchedInMurkyWater: z.boolean(),
  digesting: finite().min(0),
  breedingCooldownUntil: finite(),
  /** Durable mate's entity id. Optional on every version: bonds only exist
   * once a pair has left an egg together. */
  partnerId: z.number().int().positive().optional(),
  activity: FishActivitySchema,
  /** Sim time appetite last returned. Optional on every version: purely a
   * cue timestamp, absent whenever the fish is comfortably fed. */
  appetiteSince: finite().optional(),
  criticalSince: finite().optional(),
  lastWarningAt: finite().optional(),
  facing: z.union([z.literal(1), z.literal(-1)]),
})

const FoodSchema = z.object({
  nutrition: finite().positive(),
  spoilsAt: finite(),
  spoiled: z.boolean(),
  restingOnSand: z.boolean(),
  /** Legacy-optional: absent before hand-dropped morsels were told apart
   * from a feeder's. A morsel already in flight in an older save cannot be
   * attributed, so it loads as automated and advances no chore evidence. */
  manual: z.boolean().optional(),
})

const WasteSchema = z.object({
  size: finite().positive(),
  restingOnSand: z.boolean(),
})

const EggSchema = z.object({
  hatchAt: finite(),
  genome: GenomeSchema,
  parents: z.tuple([z.string(), z.string()]),
  generation: z.number().int().min(1),
  peakPollution: unit(),
})

const RemainsSchema = z.object({
  fish: FishSchema,
  expiresAt: finite(),
})

const ARCHETYPE_KEYS = ['fish', 'food', 'waste', 'egg', 'remains'] as const

const EntitySchema = z
  .object({
    id: z.number().int().positive(),
    position: Vec2Schema,
    velocity: Vec2Schema,
    fish: FishSchema.optional(),
    food: FoodSchema.optional(),
    waste: WasteSchema.optional(),
    egg: EggSchema.optional(),
    remains: RemainsSchema.optional(),
  })
  .superRefine((entity, ctx) => {
    const present = ARCHETYPE_KEYS.filter((key) => entity[key] !== undefined)
    if (present.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `entity ${entity.id} must have exactly one archetype component, found ${present.length} (${present.join(', ') || 'none'})`,
      })
    }
  })

const UnlocksSchema = z.object({
  // Legacy-optional: pre-flag saves have no fedOnce; migrateV1ToCurrent()
  // infers it from noticedGrowth.
  fedOnce: z.boolean().optional(),
  noticedGrowth: z.boolean(),
  noticedPollution: z.boolean(),
  siphonInShop: z.boolean(),
  fishInShop: z.boolean(),
  // Legacy-optional: absent before the feeder shop entry existed.
  feederInShop: z.boolean().optional(),
  seenEgg: z.boolean(),
})

const JournalEntrySchema = z.object({
  atSim: finite(),
  kind: z.enum(['arrival', 'birth', 'death', 'development', 'purchase', 'away']),
  message: z.string(),
})

const EquipmentV2Schema = z.object({
  siphon: z.boolean(),
  feeder: z.enum(['none', 'drip', 'twin', 'rotary']),
  filter: z.enum(['none', 'sponge']),
})

const CareHistoryV2Schema = z.object({
  feederShortfallSeconds: finite().min(0),
  siphonUses: z.number().int().min(0),
  pollutedSeconds: finite().min(0),
})

/** V3 added the habitat stage and the stable-full-tank streak it consults. */
const EquipmentV3Schema = EquipmentV2Schema.extend({
  habitat: z.enum(['starter', 'expanded']),
})

const CareHistoryV3Schema = CareHistoryV2Schema.extend({
  stableFullSeconds: finite().min(0),
})

export const SaveV1Schema = z.object({
  version: z.literal(1),
  savedAtMs: finite().min(0),
  time: finite().min(0),
  coins: finite().min(0),
  ownsSiphon: z.boolean(),
  // Legacy-optional: absent before the feeder existed.
  ownsFeeder: z.boolean().optional(),
  feederLastDropAt: finite().min(0).optional(),
  fishPurchased: z.number().int().min(0),
  // Legacy-optional: absent before names were retired on death.
  retiredNames: z.array(z.string()).optional(),
  unlocks: UnlocksSchema,
  waterCells: z.array(unit()).length(WATER_COLS * WATER_ROWS),
  rngState: z.number().int().min(0).max(0xffffffff),
  nextEntityId: z.number().int().positive(),
  gameOver: z.boolean(),
  entities: z.array(EntitySchema),
  // Legacy: older saves persisted undelivered toasts. Accepted in any shape
  // and discarded by migrateV1ToCurrent — notifications are no longer durable.
  pendingEvents: z.array(z.unknown()).optional(),
  // Legacy-optional: absent before the Tank Journal existed.
  journal: z.array(JournalEntrySchema).optional(),
})

export type SaveFileV1 = z.infer<typeof SaveV1Schema>

/**
 * V2 replaced V1's ownership booleans and `unlocks` flags with typed
 * equipment stages, a durable development-id list, and the care history the
 * hidden developments consult. Entities are unchanged, so a V1 tank keeps
 * every resident, coin, and journal entry across the migration.
 */
export const SaveV2Schema = SaveV1Schema.omit({
  version: true,
  ownsSiphon: true,
  ownsFeeder: true,
  unlocks: true,
  pendingEvents: true,
}).extend({
  version: z.literal(2),
  equipment: EquipmentV2Schema,
  feederDropCount: z.number().int().min(0).optional(),
  developments: z.array(z.enum(DEVELOPMENT_IDS as unknown as [DevelopmentId, ...DevelopmentId[]])),
  care: CareHistoryV2Schema,
})

export type SaveFileV2 = z.infer<typeof SaveV2Schema>

/**
 * V3 added the habitat as a typed equipment stage (the 12 → ~20 capacity
 * valve) and the care streak that reveals its expansion. Everything else —
 * entities, water, journal, developments — is unchanged from V2.
 */
export const SaveV3Schema = SaveV2Schema.omit({
  version: true,
  equipment: true,
  care: true,
}).extend({
  version: z.literal(3),
  equipment: EquipmentV3Schema,
  care: CareHistoryV3Schema,
})

export type SaveFileV3 = z.infer<typeof SaveV3Schema>

/** V4 added food as a typed equipment stage (starter flakes vs hearty
 * pellets). Everything else is unchanged from V3. */
const EquipmentV4Schema = EquipmentV3Schema.extend({
  food: z.enum(['flake', 'pellet']),
})

export const SaveV4Schema = SaveV3Schema.omit({
  version: true,
  equipment: true,
}).extend({
  version: z.literal(4),
  equipment: EquipmentV4Schema,
})

export type SaveFileV4 = z.infer<typeof SaveV4Schema>

/**
 * V5 opened the food ladder to three rungs and replaced the care counters
 * that measured the wrong thing: raw siphon pulses became credited cleans,
 * worst-cell pollution time became the visible average's, and the feeder's
 * ever-climbing uptime counter became net strain. The rolling meal history
 * is new state entirely.
 */
const EquipmentV5Schema = EquipmentV3Schema.extend({
  food: z.enum(['flake', 'crumb', 'pellet']),
})

const MealBucketSchema = z
  .object({
    at: finite().min(0),
    eaten: z.number().int().min(0),
    manual: z.number().int().min(0),
  })
  .refine((bucket) => bucket.manual <= bucket.eaten, {
    message: 'manual meals cannot exceed total meals eaten',
    path: ['manual'],
  })

const CareHistoryV5Schema = z
  .object({
    feederStrainSeconds: finite().min(0),
    cleaningCredits: z.number().int().min(0),
    murkySeconds: finite().min(0),
    stableFullSeconds: finite().min(0),
    meals: z.array(MealBucketSchema).max(MEAL_HISTORY_BATCH_LIMIT),
  })
  .superRefine((care, ctx) => {
    for (let index = 1; index < care.meals.length; index += 1) {
      if (care.meals[index].at <= care.meals[index - 1].at) {
        ctx.addIssue({
          code: 'custom',
          message: 'meal buckets must be in strictly increasing time order',
          path: ['meals', index, 'at'],
        })
      }
    }
  })

const SiphonCreditSchema = z.object({
  cell: z.number().int().min(0).max(WATER_COLS * WATER_ROWS - 1),
  at: finite().min(0),
})

export const SaveV5Schema = SaveV4Schema.omit({
  version: true,
  equipment: true,
  care: true,
})
  .extend({
    version: z.literal(5),
    equipment: EquipmentV5Schema,
    care: CareHistoryV5Schema,
    // Early local V5 saves predated durable siphon cooldowns. Treat their
    // missing field as empty; V1–V4 migrations do the same.
    siphonCreditAt: z.array(SiphonCreditSchema).max(WATER_COLS * WATER_ROWS).default([]),
  })
  .superRefine((save, ctx) => {
    for (let index = 0; index < save.care.meals.length; index += 1) {
      if (save.care.meals[index].at > save.time) {
        ctx.addIssue({
          code: 'custom',
          message: 'meal batch cannot come from the future',
          path: ['care', 'meals', index, 'at'],
        })
      }
    }
    const seenCells = new Set<number>()
    for (let index = 0; index < save.siphonCreditAt.length; index += 1) {
      const credit = save.siphonCreditAt[index]
      if (seenCells.has(credit.cell)) {
        ctx.addIssue({
          code: 'custom',
          message: 'siphon cooldown cells must be unique',
          path: ['siphonCreditAt', index, 'cell'],
        })
      }
      seenCells.add(credit.cell)
      if (credit.at > save.time) {
        ctx.addIssue({
          code: 'custom',
          message: 'siphon cooldown cannot come from the future',
          path: ['siphonCreditAt', index, 'at'],
        })
      }
    }
  })

export type SaveFileV5 = z.infer<typeof SaveV5Schema>

/**
 * One entity as it appears on the wire. Deliberately NOT the runtime
 * `Entity`: the persisted format keeps a single `fish` blob, while the
 * simulation splits residents into cohesive components. `save.ts` owns the
 * mapping in both directions.
 */
export type WireEntity = z.infer<typeof EntitySchema>
export type WireFish = z.infer<typeof FishSchema>

/** The part of a save the semantic passes care about — shared by V1 and V2. */
type EntityBearingSave = { entities: WireEntity[]; nextEntityId: number }

/**
 * Hard-reject semantic checks that structural validation alone cannot
 * express. Anything found here means the save cannot be trusted at all.
 */
export function checkSemantics(save: EntityBearingSave): string[] {
  const issues: string[] = []
  const seen = new Set<number>()
  for (const entity of save.entities) {
    if (seen.has(entity.id)) {
      issues.push(`duplicate entity id ${entity.id}`)
    }
    seen.add(entity.id)
  }
  return issues
}

/**
 * Recoverable semantic fixes: a stale `nextEntityId` is corrected rather
 * than rejected, and fish referencing a food pellet or courtship partner
 * that no longer exists fall back to wandering instead of invalidating an
 * otherwise-healthy tank. Call only after checkSemantics() reports no issues.
 */
export function normalizeSemantics<T extends EntityBearingSave>(save: T): T {
  const maxId = save.entities.reduce((max, entity) => Math.max(max, entity.id), 0)
  const nextEntityId = save.nextEntityId <= maxId ? maxId + 1 : save.nextEntityId

  const foodIds = new Set(save.entities.filter((entity) => entity.food !== undefined).map((entity) => entity.id))
  const fishIds = new Set(save.entities.filter((entity) => entity.fish !== undefined).map((entity) => entity.id))

  const entities = save.entities.map((entity) => {
    if (!entity.fish) return entity
    const activity = entity.fish.activity
    const staleReference =
      (activity.kind === 'seekFood' && !foodIds.has(activity.foodId)) ||
      (activity.kind === 'court' && !fishIds.has(activity.partnerId))
    const stalePartner =
      entity.fish.partnerId !== undefined && !fishIds.has(entity.fish.partnerId)
    if (!staleReference && !stalePartner) return entity
    return {
      ...entity,
      fish: {
        ...entity.fish,
        partnerId: stalePartner ? undefined : entity.fish.partnerId,
        activity: staleReference
          ? { kind: 'wander' as const, target: { ...entity.position }, idleUntil: 0 }
          : entity.fish.activity,
      },
    }
  })

  return { ...save, nextEntityId, entities }
}

/**
 * V1 → V2. Ownership booleans become equipment stages, the `unlocks` flags
 * become durable development ids, and the care history starts empty: a
 * returning player keeps their tank and equipment, and the next hidden
 * development is earned from play after the upgrade rather than granted.
 */
export function migrateV1ToV2(save: SaveFileV1): SaveFileV2 {
  const unlocks = save.unlocks
  const developments: DevelopmentId[] = []
  // Pre-flag saves have no fedOnce; a noticeably grown fish proves they fed.
  if (unlocks.fedOnce ?? unlocks.noticedGrowth) developments.push('fedOnce')
  if (unlocks.noticedGrowth) developments.push('growthNoticed')
  if (unlocks.noticedPollution) developments.push('pollutionNoticed')
  if (unlocks.siphonInShop) developments.push('siphonOffered')
  if (unlocks.fishInShop) developments.push('fishOffered')
  if (unlocks.seenEgg) developments.push('eggSeen')
  // A V1 tank that had been offered or had bought the feeder has already
  // seen that development; owning one implies it was offered.
  if ((unlocks.feederInShop ?? false) || save.ownsFeeder) developments.push('dripFeederOffered')

  return {
    version: 2,
    savedAtMs: save.savedAtMs,
    time: save.time,
    coins: save.coins,
    equipment: {
      siphon: save.ownsSiphon,
      feeder: save.ownsFeeder ? 'drip' : 'none',
      filter: 'none',
    },
    developments: sortDevelopments(developments),
    care: { feederShortfallSeconds: 0, siphonUses: 0, pollutedSeconds: 0 },
    // (V2 shape; migrateV2ToV3 adds the habitat and the stability streak.)
    feederLastDropAt: save.feederLastDropAt ?? 0,
    feederDropCount: 0,
    fishPurchased: save.fishPurchased,
    retiredNames: save.retiredNames ?? [],
    waterCells: save.waterCells.slice(),
    rngState: save.rngState,
    nextEntityId: save.nextEntityId,
    gameOver: save.gameOver,
    entities: save.entities,
    journal: save.journal ?? [],
  }
}

/** Stable order, so a save's development list round-trips byte-identically. */
export function sortDevelopments(ids: readonly DevelopmentId[]): DevelopmentId[] {
  const unique = [...new Set(ids)]
  return unique.sort((a, b) => DEVELOPMENT_IDS.indexOf(a) - DEVELOPMENT_IDS.indexOf(b))
}

/**
 * V2 → V3. Every V2 tank was a starter habitat, and the stability streak
 * starts at zero: a returning keeper earns the expansion reveal from play
 * after the upgrade, exactly like every other hidden development.
 */
export function migrateV2ToV3(save: SaveFileV2): SaveFileV3 {
  return {
    ...save,
    version: 3,
    equipment: { ...save.equipment, habitat: 'starter' },
    care: { ...save.care, stableFullSeconds: 0 },
  }
}

/**
 * V3 → V4. Every pre-V4 tank fed nutrition-1 pellets, so a migrated save
 * keeps exactly the food it has always used; only fresh tanks begin on the
 * weaker starter flakes. The hearty-food development is deliberately NOT
 * granted: the shop has nothing further to offer a tank already on pellets.
 */
export function migrateV3ToV4(save: SaveFileV3): SaveFileV4 {
  return {
    ...save,
    version: 4,
    equipment: { ...save.equipment, food: 'pellet' },
  }
}

/**
 * V4 → V5. Two deliberate decisions, both about not lying to a returning
 * keeper:
 *
 * Food. A pre-V5 "flake" was as rich as today's crumb (0.40), so a migrated
 * tank moves to crumbs and keeps feeding exactly what it always fed rather
 * than being silently cut to a third of it. The crumb development comes with
 * it, since that rung is plainly already behind them.
 *
 * Care counters. The three redefined counters start clean: their old values
 * counted different quantities (every siphon pulse; seconds any single cell
 * was dirty; seconds any fish was merely peckish), and carrying those
 * numbers into the new thresholds would hand over developments nobody
 * earned. `stableFullSeconds` is unchanged in meaning, so it is kept.
 */
export function migrateV4ToV5(save: SaveFileV4): SaveFileV5 {
  const movedToCrumbs = save.equipment.food === 'flake'
  return {
    ...save,
    version: 5,
    equipment: { ...save.equipment, food: movedToCrumbs ? 'crumb' : save.equipment.food },
    developments: sortDevelopments(
      movedToCrumbs ? [...save.developments, 'crumbFoodOffered'] : save.developments,
    ),
    care: {
      feederStrainSeconds: 0,
      cleaningCredits: 0,
      murkySeconds: 0,
      stableFullSeconds: save.care.stableFullSeconds,
      meals: [],
    },
    siphonCreditAt: [],
  }
}

/** Fill V5's own legacy-optional fields and normalise ordering. */
export function migrateV5ToCurrent(save: SaveFileV5): SaveFile {
  return {
    ...save,
    siphonCreditAt: [...save.siphonCreditAt].sort((a, b) => a.cell - b.cell),
    developments: sortDevelopments(save.developments),
    retiredNames: save.retiredNames ?? [],
    journal: save.journal ?? [],
    feederLastDropAt: save.feederLastDropAt ?? 0,
    feederDropCount: save.feederDropCount ?? 0,
    entities: save.entities.map((entity) =>
      entity.food === undefined
        ? entity
        : { ...entity, food: { ...entity.food, manual: entity.food.manual ?? false } },
    ),
  }
}
