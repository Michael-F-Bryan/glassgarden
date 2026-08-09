# Glassgarden roadmap

**Audience:** maintainer and implementation agents
**Horizon:** Now / Next / Later (no calendar cadence — capacity is one person plus agents)
**Scope:** the whole game — simulation, progression, presentation, and the interaction surface
**Item vocabulary:** capabilities and slices; "milestone" only where ordering is a gate

Direction comes from [docs/game-progression.md](docs/game-progression.md) (product intent) and
`_working/adversarial-refactor-review/review.md` (architecture findings, all applied). Anything
below marked with a measurement was observed in this repo, not assumed.

---

## Now

### 1. Complete the non-pointer interaction path

**Outcome:** a keyboard player can feed, siphon, inspect residents, and operate every overlay
safely, through the same runtime intents pointer actions use.
**Evidence:** the canvas has no keyboard action path; overlays (menu, away summary, game-over,
journal, help, inspector) lack dialog semantics and focus handling; Escape is handled globally
rather than by the active overlay. Tool selection by number key and `aria-pressed` already exist
in `GameRoot.tsx`, so the surface is partly there.
**First slice:** keyboard Feed/Siphon/inspect routed through `createGameRuntime` intents, plus one
active-overlay owner for focus and Escape.
**Dependency:** none — the runtime already exposes typed intents.
**Risk:** low technically; the interaction design (how a keyboard user aims at the tank) needs a
deliberate decision rather than an ARIA sprinkle.
**Confidence:** HIGH · **Handoff:** in flight

### 2. Bounded entropy cleanup

**Outcome:** the mood label/emoji precedence stops contradicting itself, shared E2E helpers live in
one place, and provably dead shadcn scaffolding is gone.
**Evidence:** `hud.ts` computes mood text and emoji through two separate ladders that can disagree
(`starving` label with the sick emoji); `components/ui/button.tsx` and `lib/utils.ts` have no
importers.
**First slice:** one precedence table for mood; delete dead files only after an import and
production-build scan.
**Dependency:** none.
**Risk:** low. Keep `tw-animate-css` — it is used.
**Confidence:** HIGH · **Handoff:** in flight

---

## Next

### 3. Habitat expansion as the capacity valve (12 → ~20)

**Outcome:** a healthy full tank unlocks more space, visible habitat, and the ecological load that
comes with it.
**Evidence:** capacity pressure arrives sooner than the doc assumed. In a browser playtest a
six-resident tank on a drip feeder bred to thirteen residents inside ~40 minutes of simulated time
and sat at the `maxPopulation` ceiling; breeding, not purchase, is already the population source.
**First slice:** raise capacity behind a hidden development that requires a *stable, healthy* full
tank, with the tank art and spawn volume to match.
**Dependency:** filtration must scale first (item 4) or expansion just multiplies the pollution
problem below.
**Risk:** twenty residents must stay visually readable; this is as much an art/layout problem as a
simulation one.
**Confidence:** MED · **Handoff:** `brainstorm` for the unlock fiction, then `design-discussion`
for capacity and spawn layout

### 4. Debris load and the next filtration stage

**Outcome:** a mature tank's maintenance stays meaningful without the sand becoming a carpet of
droppings.
**Evidence:** measured in this repo — a fed twelve-resident tank settles at **~200 waste entities**
and pins the worst water cell at 1.00 indefinitely. The HUD meter had to be moved from worst-cell
to average murk because one dropping-covered cell made the meter read "foul" forever. The sponge
filter helps the average (0.33 → 0.12 measured) but cannot touch solid debris, by design.
**First slice:** decide whether debris density is a balance problem (breakdown rate, digestion
cost) or a presentation problem (stacking, sand-level rendering) before adding the larger filter.
**Dependency:** none, but it gates habitat expansion.
**Risk:** over-correcting deletes the reason the siphon exists.
**Confidence:** HIGH on the measurement, MED on the fix · **Handoff:** `design-discussion`

### 5. Breeding as a shaped system rather than an automatic one

**Outcome:** the player influences breeding through conditions and space, and offspring feel like
descendants rather than spawns.
**Evidence:** breeding currently fires whenever two residents meet static thresholds; courtship had
to be shortened to 10s this session because a 20s dance cost 0.67 hunger and starved the dancers —
a sign the ritual is not yet a designed system.
**First slice:** persistent partners and a visible courtship state worth watching.
**Dependency:** habitat capacity (item 3), or the tank simply hits the ceiling.
**Risk:** turning relationships into a spreadsheet; the doc is explicit that bonding does not need
an income bonus to justify itself.
**Confidence:** MED · **Handoff:** `brainstorm`

---

## Later

Held deliberately, in the doc's own order:

- **Persistent relationships, families, and schools** — needs capacity and generations first.
- **Predictable ageing and generational turnover** — only meaningful once several generations exist.
- **Grief, rituals, and a memorial garden** — requires history worth mourning; a memorial that only
  clears a morale penalty is a tax in a stone hat.
- **Plants and deeper ecological symbiosis** — the planted biofilter is the natural end of the
  filtration line.
- **Hidden trust or temperament developed through interaction with individuals.**
- **A second specialised tank** — only after the first society has depth.

---

## Not now

| Item | Why not |
|------|---------|
| Visible tech tree or level system | Contradicts the core direction: progression is hidden and action-driven. |
| Generic upgrade engine, rule DSL, or plugin registry | The review rejected this explicitly; typed equipment stages plus development ids cover the real cases. |
| Additional currencies | No systemic purpose yet; coins already have operating and aspirational sinks. |
| More species with shallow differences | Genome variation already carries visual identity. |
| Unbounded population growth | Capacity is a design valve, not a limitation to remove. |
| Further ECS restructuring | Findings 1–6 and the resident-component split are complete; the boundaries are settled until a system needs a new component. |

---

## Known gaps in this roadmap

- Pacing beyond the first hour is unmeasured: playtests here used accelerated time, not real
  sittings, so the opening cadence targets in the progression doc remain unverified by a human.
- Item 4's fix direction is genuinely undecided — the measurement is solid, the remedy is not.
- No performance work is scheduled; the offline catch-up benchmark (~1s for 20 simulated minutes)
  is the only measured budget, and rendering at twenty residents has not been profiled.
