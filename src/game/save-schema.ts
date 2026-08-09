/**
 * The V1 save wire format: a strict Zod schema plus the two named passes
 * that turn untrusted JSON into a canonical `SaveFile` (src/game/save.ts).
 *
 * Kept separate from save.ts because the schema is large (five entity
 * archetypes, genome, activity, water, unlocks, events, journal) and this
 * module owns wire shape/validation only — no ECS or browser concerns.
 */
import { z } from 'zod'

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
  activity: FishActivitySchema,
  criticalSince: finite().optional(),
  lastWarningAt: finite().optional(),
  facing: z.union([z.literal(1), z.literal(-1)]),
})

const FoodSchema = z.object({
  nutrition: finite().positive(),
  spoilsAt: finite(),
  spoiled: z.boolean(),
  restingOnSand: z.boolean(),
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
 * One entity as it appears on the wire. Deliberately NOT the runtime
 * `Entity`: the persisted format keeps a single `fish` blob, while the
 * simulation splits residents into cohesive components. `save.ts` owns the
 * mapping in both directions.
 */
export type WireEntity = z.infer<typeof EntitySchema>
export type WireFish = z.infer<typeof FishSchema>

/**
 * Hard-reject semantic checks that structural validation alone cannot
 * express. Anything found here means the save cannot be trusted at all.
 */
export function checkSemantics(save: SaveFileV1): string[] {
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
export function normalizeSemantics(save: SaveFileV1): SaveFileV1 {
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
    if (!staleReference) return entity
    return {
      ...entity,
      fish: {
        ...entity.fish,
        activity: { kind: 'wander' as const, target: { ...entity.position }, idleUntil: 0 },
      },
    }
  })

  return { ...save, nextEntityId, entities }
}

/**
 * The one place historical/legacy-optional V1 fields are defaulted. Only
 * call this on a save that has already passed checkSemantics()/been through
 * normalizeSemantics() — it does not re-validate structure.
 */
export function migrateV1ToCurrent(save: SaveFileV1): SaveFile {
  return {
    version: 1,
    savedAtMs: save.savedAtMs,
    time: save.time,
    coins: save.coins,
    ownsSiphon: save.ownsSiphon,
    ownsFeeder: save.ownsFeeder ?? false,
    feederLastDropAt: save.feederLastDropAt ?? 0,
    fishPurchased: save.fishPurchased,
    retiredNames: save.retiredNames ?? [],
    unlocks: {
      ...save.unlocks,
      feederInShop: save.unlocks.feederInShop ?? false,
      // Pre-flag saves have no fedOnce; a noticeably grown fish proves they fed.
      fedOnce: save.unlocks.fedOnce ?? save.unlocks.noticedGrowth,
    },
    waterCells: save.waterCells.slice(),
    rngState: save.rngState,
    nextEntityId: save.nextEntityId,
    gameOver: save.gameOver,
    entities: save.entities,
    journal: save.journal ?? [],
  }
}
