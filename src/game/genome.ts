import type { BodyPattern, FinShape, Genome } from './model'
import type { Rng } from './rng'

const FIN_SHAPES: readonly FinShape[] = ['fan', 'forked', 'veil']
const PATTERNS: readonly BodyPattern[] = ['plain', 'stripes', 'spots']

const NAME_STARTS = [
  'Nori', 'Pearl', 'Bub', 'Fin', 'Coral', 'Kelp', 'Mica', 'Opal', 'Pip',
  'Sol', 'Luna', 'Wisp', 'Juni', 'Tide', 'Moss', 'Ripple', 'Ember', 'Isla',
]
const NAME_ENDS = ['', '', '', 'ble', 'kin', 'let', 'a', 'o', 'wick', 'belle', 'drift', 'shine']

export function generateName(rng: Rng, taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const name = rng.pick(NAME_STARTS) + rng.pick(NAME_ENDS)
    if (!taken.has(name)) return name
  }
  return `${rng.pick(NAME_STARTS)}-${Math.floor(rng.next() * 1000)}`
}

/** A fresh shop fish: independent of any lineage, moderate stats. */
export function randomGenome(rng: Rng, maxWeight: number): Genome {
  return {
    hue: rng.range(0, 360),
    saturation: rng.range(0.5, 0.9),
    maxWeight,
    finShape: rng.pick(FIN_SHAPES),
    finFlair: rng.range(0.2, 0.8),
    bodyAspect: rng.range(0.34, 0.52),
    pattern: rng.pick(PATTERNS),
    patternIntensity: rng.range(0.3, 0.9),
    speed: rng.range(55, 85),
    resilience: rng.range(0.25, 0.7),
  }
}

function blendNumber(rng: Rng, a: number, b: number, noise: number, min: number, max: number): number {
  const mix = a + (b - a) * rng.next()
  const value = mix + rng.gaussian() * noise
  return Math.min(max, Math.max(min, value))
}

/**
 * Offspring draw each trait from between their parents' values with gaussian
 * noise, so lineage is recognisable but every fry is an individual. Hue blends
 * along the shorter arc of the colour wheel.
 */
export function inheritGenome(rng: Rng, a: Genome, b: Genome): Genome {
  let hueDelta = b.hue - a.hue
  if (hueDelta > 180) hueDelta -= 360
  if (hueDelta < -180) hueDelta += 360
  const hue = (a.hue + hueDelta * rng.next() + rng.gaussian() * 14 + 360) % 360
  return {
    hue,
    saturation: blendNumber(rng, a.saturation, b.saturation, 0.04, 0.45, 0.95),
    maxWeight: blendNumber(rng, a.maxWeight, b.maxWeight, 1.6, 8, 60),
    finShape: rng.next() < 0.08 ? rng.pick(FIN_SHAPES) : rng.pick([a.finShape, b.finShape]),
    finFlair: blendNumber(rng, a.finFlair, b.finFlair, 0.07, 0, 1),
    bodyAspect: blendNumber(rng, a.bodyAspect, b.bodyAspect, 0.02, 0.3, 0.6),
    pattern: rng.next() < 0.08 ? rng.pick(PATTERNS) : rng.pick([a.pattern, b.pattern]),
    patternIntensity: blendNumber(rng, a.patternIntensity, b.patternIntensity, 0.08, 0, 1),
    speed: blendNumber(rng, a.speed, b.speed, 3, 40, 110),
    resilience: blendNumber(rng, a.resilience, b.resilience, 0.05, 0, 1),
  }
}
