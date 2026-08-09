/**
 * Deterministic seedable RNG (mulberry32). The simulation must be
 * reproducible in tests and across save/load, so all sim randomness flows
 * through one of these instead of Math.random().
 */
export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform float in [min, max). */
  range(min: number, max: number): number
  /** Bell-shaped sample: mean 0, sd ≈ 0.4, bounded to ±√2 (sum of uniforms). */
  gaussian(): number
  /** Pick a uniformly random element. */
  pick<T>(items: readonly T[]): T
  /** Current internal state, for persistence. */
  state(): number
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    gaussian: () => (next() + next() + next() + next() - 2) * Math.SQRT1_2,
    pick: (items) => items[Math.floor(next() * items.length)],
    state: () => s,
  }
}
