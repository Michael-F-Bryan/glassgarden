/**
 * The V1 save wire format: a strict Zod schema plus the two named passes
 * that turn untrusted JSON into a canonical `SaveFile` (src/game/save.ts).
 *
 * Kept separate from save.ts because the schema is large (five entity
 * archetypes, genome, activity, water, unlocks, events, journal) and this
 * module owns wire shape/validation only — no ECS or browser concerns.
 */
import { z } from 'zod'

import { DEVELOPMENT_IDS, type DevelopmentId } from './model'
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

/** Fill V3's own legacy-optional fields (none yet) and normalise ordering. */
export function migrateV3ToCurrent(save: SaveFileV3): SaveFile {
  return {
    ...save,
    developments: sortDevelopments(save.developments),
    retiredNames: save.retiredNames ?? [],
    journal: save.journal ?? [],
    feederLastDropAt: save.feederLastDropAt ?? 0,
    feederDropCount: save.feederDropCount ?? 0,
  }
}
