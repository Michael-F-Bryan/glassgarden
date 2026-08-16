# Glassgarden progression and tuning review

> **Provenance:** Claude Opus 5 produced this read-only review from the `feature/opening-gameplay` worktree after inspecting the simulation, tests, and pacing research and running throwaway `GameSim` probes. The recommendations are evidence for roadmap decisions, not approved implementation constants. Browser play remains the authority for game feel.

Read-only. No files changed. Numbers labelled: **[impl]** read from the worktree · **[meas]** measured by me driving the real `GameSim` in a throwaway Node process (no source modified) · **[doc]** recorded in `docs/`/`ROADMAP.md` · **[inferred]** · **[proposed]** · **[spec]**.

**Arithmetic does not prove the game is fun.** Everything below establishes where the *opportunity* for a useful action exists. Whether the rhythm feels worthwhile is only answerable in an unaccelerated browser sitting.

## 1. Quantified current progression

### 1.1 The governing equation

Hunger accrues at `hungerPerSecondAdult × (0.45 + 0.55·maturity) × satiation` (`systems.ts:84`); eating relieves `hungerRelievedPerNutrition × nutrition` (`systems.ts:344`). At steady state:

> useful feeds/min = (hunger accrued per minute) ÷ (0.38 × nutrition per morsel)

[inferred] Morsel size is the **only** control that sets opening cadence without touching starvation pressure. `starterHunger` and `seekFoodAbove` shape the first episode only.

### 1.2 Measured manual workload [meas]

Attentive keeper (one morsel whenever a fish is interested and nothing edible is in the water; only *eaten* morsels counted), 300 s steady state, breeding suppressed:

| Population | 0.12 | 0.15 | 0.20 | **0.40 (flake)** | **1.00 (pellet)** |
|---|---:|---:|---:|---:|---:|
| 1 fish @1.2 g (fresh save) | 11.0 | 8.8 | 6.6 | **3.4** | 1.8 |
| 1 fish @8 g | 13.8 | 11.0 | 8.2 | **4.2** | 2.2 |
| 1 fish @14 g | 16.0 | 12.8 | 9.6 | **4.8** | 2.6 |
| 2 fish @6 g | 25.8 | 20.6 | 15.6 | **7.8** | 4.2 |
| 2 fish @12 g | 30.4 | 24.4 | 18.2 | **9.2** | 5.0 |
| 3 fish @14 g | 47.6 | 38.2 | 28.6 | **14.4** | 7.4 |
| 4 fish @18 g | 69.2 | 55.4 | 41.6 | 20.8 | **10.6** |
| 6 fish @22 g | 111.6 | 89.4 | 67.2 | 33.6 | **17.0** |

Target band: 8–15 actions/min opening, 4–8 after automation.

**F1 — the opening is under-fed by design.** Fresh save yields **3.4–4 useful feeds/min** [meas], corroborating the recorded 3.75/min manual playthrough [doc]. Full 10-min replay (seeds 42/7/101, 1×): per-minute counts `[4,3,3,4,3,4,4,4,4,4]` — flat, under half the band floor. Longest gap between useful actions **23.3 s** vs the doc's 8 s limit.

**F2 — the sawtooth is inverted at the food ladder.** Only two tiers exist (`equipment.ts:46`). Reading the bolded diagonal: 1 fish 3.4/min (far below band), 2–3 fish 7.8–14.4 (in band), and the pellet upgrade — offered at 2 residents (`model.ts:367`) — crashes two fish from 7.8 to 4.2. **The relief arrives before the pressure it relieves.**

### 1.3 Coin flow

[impl] `incomeFloor` 0.28 + 0.055 × grams (`model.ts:288`); `pelletCost` 1 for every tier (`model.ts:275`).

| Tank | Income | Food spend | Food as % income |
|---|---:|---:|---:|
| 1 fish 1.2 g | 21/min | 3.4/min | 16% |
| 2 fish @12 g | 96/min | 9.2/min | 10% |
| 12 fish @24 g, rotary | **967/min** | 27.7/min [meas] | **2.9%** |

**F3 — the operating sink collapses.** Lifetime equipment spend is **12 160 coins** [impl] — about 12 minutes of full-tank income. Measured: `growing-tank` holds **20 314 coins at 40 min**; `thriving-full-tank` **31 155 at 30 min** [meas]. The opening economy is fine (balance never below 27; the siphon is affordable the moment it's offered [meas]).

### 1.4 Waste, pollution, siphon

[impl] One dropping per `digestionPerDropping` = 4 nutrition (`model.ts:319`), size `0.6 + w·0.05`, leaching 0.03/size/s, breaking down at 0.0045/s.

- **Opening:** a dropping every ≈3.5 min. Fresh save at 10 min: **1 standing, 3 produced** [meas]. `siphonOffered` fires at **204 s** [meas].
- **Mature:** 12 residents settle at **46–48 standing droppings**, worst cell 1.00, average murk **0.29 unfiltered / 0.096 with sponge** [meas].

**F4 — the siphon has almost nothing to remove when introduced.** 60 coins for one dropping every 3.5 minutes. The doc's "one useful sweep every 30–60 s" is unreachable by roughly two orders of magnitude.

**F5 — `ROADMAP.md` item 3's headline measurement is stale.** It records ~200 waste entities; current tuning gives **46–48** [meas], and `tests/e2e/debugging.spec.ts:57` already guards 15–90. The carpet is fixed; item 3 needs rewriting around what is true now (worst cell still pins at 1.00; mean murk 0.29 unfiltered).

### 1.5 Feeder throughput vs demand

Worst hunger over 600 s, mature residents on pellets, after 120 s settling [meas]:

| Feeder | n=2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 14 | 16 | 20 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| drip | 0.80 | 0.77 | 0.80 | 0.94 | 0.85 | 1.00 | — | — | — | — | — |
| twin | — | — | — | — | 0.63 | 0.62 | 0.66 | 0.81 | 1.00 | — | — |
| rotary | — | — | — | — | — | — | — | 0.59 | 0.56 | 0.55 | **0.57** |

**F6 — feeders are systematically under-rated; the rotary already covers the expanded habitat.** Real capacities: drip ≈4, twin ≈12, rotary ≥20. Each tier's relief phase therefore lasts far longer than its rated span. **No fourth feeder tier is needed for 20 residents** — a useful negative result. Spouts aren't the constraint: a 4-spout drip still collapses at 8 residents (worst 1.00) [meas]; drop *rate* is the honest control.

### 1.6 Trigger reachability and spam paths

**F7 (most serious) — `feederShortfallSeconds` is a population counter, not a strain counter.** [impl] `systems.ts:659–667` increments for every second any resident is above `feederFeedsAbove` (0.4) without an earmarked pellet — the normal operating state of a working feeder. It only increases; nothing decays it. `feederStrainForNextTier` = 75 s.

| Feeder | Residents | Shortfall/600 s | Sec. any fish >0.65 | Verdict |
|---|---:|---:|---:|---|
| drip | 2 | 9 | 1 | comfortable — yet accrues |
| drip | 3 (rated) | 32 | 13 | comfortable |
| drip | 4 | 59 | 38 | comfortable |
| drip | 5 | 138 | 46 | genuinely straining |
| drip | 6 | 221 | 103 | failing |
| twin | 8 (rated) | 107 | **0** | entirely comfortable |
| twin | 10 | 162 | 1 | comfortable |
| twin | 12 | 284 | 27 | starting to strain |
| rotary | 12 (rated) | 147 | 4 | comfortable |
| rotary | 20 | 230 | 0 | comfortable |

[inferred] A twin hopper at its rated 8 residents crosses 75 s in **≈7 minutes while every fish is comfortable**, revealing the rotary. A drip with **two** fish crosses it in ≈50 minutes. **Every tier reveals the next one on a timer.** This is the change most responsible for progression flattening after the feeder. The ">0.65 hunger" column separates coping from behind cleanly and is the basis of the fix.

**F8 — the filter has two independent spam/timer paths.**

1. *Siphon route.* `siphonAt` increments `care.siphonUses` **before** checking whether anything was removed (`sim.ts:291`); the held gesture pulses every 220 ms plus once per 55 px swept (`runtime.ts:146–147`); threshold is 10. [meas] Ten sweeps of empty mid-water reveal the filter — **a 2.2-second hold unlocks a 550-coin upgrade.** The doc estimated ~50 s.
2. *Murk route.* `pollutedSeconds` increments whenever **`maxPollution` ≥ 0.18** (`systems.ts:714`) — the worst single cell, which one dropping pins near 1.00. [meas] A tank with exactly one dropping accrues **311 s** of "polluted" time in 10 minutes while `murkiness()` — the *average* the HUD shows (`sim.ts:262`, `hud.ts:232`) — reads **0.000**. With the 900 s threshold, the filter appears after ≈15 min of owning a siphon in any tank with digestion. Confirmed: `growing-tank` fires `spongeFilterOffered` at **20 min** with average murk 0.137 [meas]. Worse than spam — the trigger measures a quantity the interface deliberately hides, so the toast contradicts the meter beside it.

**F9 — the habitat-expansion trigger is correct and should be the model.** [meas] `thriving-full-tank` reveals it at exactly 300 s **with** a sponge filter (mean murk 0.096) and **never** without (0.308, streak permanently 0). It reads population, comfort and average murk, resets on any break, and has a real equipment dependency. The only unspammable, unwaitable trigger in the game.

**F10 — hearty pellets are reachable but mistimed.** A solo fish reaches only **13.2 g at 10 min** [meas], so the 14 g route rarely fires first; in practice the trigger is "buy a second fish" (gated at 8 g, ≈305 s, 120 coins [meas]) — and that upgrade then drops workload *below* the band.

## 2. Recommended tuning

Smallest set of controls that own the problem. No global multipliers: `hungerPerSecondAdult`, `satiationBelow`, `satiationFactor`, `hungerRelievedPerNutrition`, `growthPerNutrition`, `healthLossPerSecond`, `warningGraceSeconds` and every offline clamp stay untouched. I explicitly **reject** raising `satiationFactor` — it reaches the band (11–15/min at 0.6 [meas]) but moves every feeder rating, distress margin and the away-time contract at once.

### 2.1 Food ladder — owns opening cadence

| Control | Current | Proposed | Rationale | Workload effect | Validation |
|---|---|---|---|---|---|
| `flake.nutrition` | 0.4 | **0.15** | Cadence is nutrition-per-morsel, nothing else (§1.1) | 1 fish 3.4 → **8.8/min**, → 12.8 as it grows [meas] | Fresh-save 1× sitting; rolling ≥8/min for 3 min |
| *new* `crumb` | — | **0.40, cost 30** | Reuses today's flake value as rung 2 so relief is gentle, not a cliff | 2 fish 20.6 → **7.8**; → 14.4 at 3 fish [meas] | Re-measure at 2 and 3 residents |
| `pellet` | 1.0 / 80 | **unchanged** | Every feeder rating assumes it | 4 fish 20.8 → **10.6** [meas] | Feeder-capacity suite stays green |
| `starterHunger` | 0.35 | **0.42** | ~4 accepted mouthfuls before appetite lapses; far below distress | First minute **12 feeds** [meas] | Feed-to-response latency |
| `seekFoodAbove` | 0.25 | **0.20** | At 0.15 morsels, 0.25 ends the episode after two bites | Longest gap 23.3 → **10.0 s** [meas] | Longest-gap metric |
| `pelletCost` | flat 1 | **move onto `FoodProfile`: 1 / 2 / 4** | Restores the operating sink; richer morsel should cost more (F3) | Mature food spend 2.9% → **≈12%** | Coin balance stays positive (min 27 measured) |

Combined fresh-save run of the three opening controls, seed 42, 7 min, 1× [meas]: per-minute `[12,8,9,9,10,10,10]`; longest gap 10.0 s; first growth toast **26 s** (was 31); siphon offered **184 s** (was 204); min coins **27**. Do **not** go to 0.12: it reaches 11–13/min but slows growth (first growth toast slips to 44 s [meas]).

### 2.2 Waste, siphon, meaningful sweeps

| Control | Current | Proposed | Rationale | Validation |
|---|---|---|---|---|
| `digestionPerDropping` | 4 | **2** | One dropping per 3.5 min is not a care loop (F4) | Mature e2e guard 15–90 |
| `wasteBreakdownPerSecond` | 0.0045 | **0.0080** | Holds mature standing count near 46–48 while appearance rate doubles | Re-measure 12-resident count; mean murk <0.25 |
| `care.siphonUses` | incremented before removal check (`sim.ts:291`) | **credit only sweeps removing ≥1 debris or dropping local pollution ≥0.05; max one credit per 1.5 s and per water cell** | Closes the 2.2-s unlock (F8) | 60 empty sweeps credit 0 |
| `filterOfferedAfterSiphonUses` | 10 | **8 credited** | Fewer, each real work | `progression.spec.ts:14` must sweep debris, not empty sand |
| `pollutedSeconds` source | `maxPollution ≥ 0.18` | **`averagePollution ≥ 0.14`** (same quantity `murkiness()` reports) | The trigger must measure what the player is shown (F8) | One dropping in a clean tank accrues 0 |
| `filterOfferedAfterPollutedSeconds` | 900 | **420** | Against a stricter counter, 900 s of visible murk is punitive | Standing-debris scenario test |
| `siphonCost` 60 | — | **unchanged** | Affordable at the offer moment (90 coins [meas]) | — |

### 2.3 Feeder stages and triggers

| Control | Current | Proposed | Rationale | Validation |
|---|---|---|---|---|
| `feederShortfallSeconds` definition | any resident >0.4 without earmarked pellet | **any resident >0.65; decays 0.5/s while none is** | Separates coping from behind: drip 1/13/38/46/103 at n=2–6; twin 0/0/1/27/600 at n=6–14 [meas] | drip@3 and twin@8 accrue **zero** net strain over 30 min |
| `feederStrainForNextTier` | 75 | **45** (new counter) | drip@5 ≈10 min, drip@6 ≈4.5 min, twin@12 ≈17 min [inferred] | "Comfortable tank never upgrades" test |
| `feederOfferedAtResidents` 3 | — | **workload trigger**: ≥3 residents **and** ≥60 *eaten manual* morsels in the last 8 sim-min | At 3 residents on crumbs the load is 14.4/min — in band, not overload | Does the offer land after the chore is felt? |
| `supportsResidents` | 3/8/12 | **4/12/20** | Match advertised numbers to measured behaviour (F6) | Capacity cases updated |
| Fourth feeder tier | — | **not needed** | Rotary holds 20 at worst hunger 0.57 [meas] | — |

### 2.4 Filtration, habitat, population

Sponge filter (550, 0.016/s, clog 45): **unchanged** — measured to take a full tank from 0.308 → 0.096 mean murk while leaving 46 droppings for the siphon. Second filter stage: **defer** until a 20-resident tank is actually measured. `expansionStableSeconds` 300 / `expansionMaxMurk` 0.15: **unchanged** (F9). Habitat cost 6 000: unchanged in isolation; revisit once food costs ~12% of income (target 10–20 min to afford, not 7). `fishPrices` and breeding constants: unchanged — capacity, not price, is already the binding valve, and breeding is already the population source.

### 2.5 Thresholds that flatten the sawtooth

1. `feederShortfallSeconds` semantics (F7) — primary defect
2. `siphonUses` counted before the removal check (F8)
3. `pollutedSeconds` on max while the HUD shows average (F8)
4. `flake.nutrition` 0.4 in a one-fish tank (F1)
5. `heartyFoodAtResidents` 2 — relief before pressure (F2/F10)
6. `pelletCost` flat across a 6.7× nutrition range (F3)

## 3. Hidden shop triggers

**Crumbs (tier 2) — 1–2 residents.** Pressure: pinching flakes is continuous. Trigger: ≥40 *eaten* morsels in the last 6 sim-min **and** tank mass ≥6 g. Safeguards: only eaten food counts (uneaten costs a coin, never credited); mass gate stops a single fry qualifying. Clue: "They finish a pinch of flakes before it reaches the sand now." Relieves 20.6 → 7.8/min [meas]. Exposes the second mouth and the cost of richer food.

**Hearty pellets (tier 3) — 3–4 residents.** Trigger: tank mass ≥40 g **or** ≥4 residents, plus ≥40 eaten morsels in 6 min. Safeguard: the workload clause stops an idle heavy tank qualifying. Relieves 20.8 → 10.6/min [meas]. Exposes waste rising with nutrition digested.

**Drip feeder — 4–5 residents.** Trigger: ≥3 residents **and** ≥60 eaten *manual* morsels in the last 8 sim-min. Safeguards: manual-only, eaten-only, rolling window. Existing copy is already right. Relieves manual feeding to near zero at ≤4 residents. Exposes coins draining continuously and unsupervised waste.

**Twin hopper — 5–7 residents.** Trigger: 45 s of *net* strain (>0.65 hunger, no pellet earmarked, decaying 0.5/s). Installing a feeder already resets it (`sim.ts:405`). Separation measured: drip@3 13 s/600 s, drip@5 46, drip@6 103. Relieves feeding to 12. Exposes water quality as the new ceiling.

**Rotary feeder — 11–13 residents.** Same mechanism. twin@8/@10 accrue 0–1 s/600 s; twin@12 27 s; twin@14 saturates [meas]. Should be the last purely-throughput upgrade — it exposes nothing new by itself.

**Sponge filter — 6–10 residents.** Trigger: owns a siphon **and** (8 credited sweeps **or** 420 s at average murk ≥0.14). Relieves 0.31 → 0.10 mean murk at twelve residents [meas]. Exposes solid debris the filter cannot touch and which clogs it. The copy becomes truthful.

**Habitat expansion — 12 residents.** Unchanged; keep as the reference implementation.

*Ordering note:* `fishUnlockWeight` fires at ≈305 s, before hearty food and the feeder — good, since the second fish creates the pressure. But under the new ladder, crumbs must be reachable *before* the second fish arrives, or the player is briefly thrown to 20 feeds/min. Verify in a fresh-save sitting.

## 4. Mid-game and late-game mechanisms

Five only; each transforms an existing pressure.

1. **Stocked hopper (mid, after twin).** Prereq: any feeder. Transforms the invisible per-pellet coin drip (F3). Decision: bulk-buy at a discount and choose *which* food the hopper carries — crumbs cheap and frequent, pellets rich and dirtier per gram. Sink: bulk food; running dry is visible and recoverable, never fatal. Mid-game because it only means something once §2.1 makes food cost real.
2. **Filter media and clogging as a serviced system (mid, after sponge).** Prereq: sponge + expanded habitat. Transforms the clogging term already in `filtrationSystem` (`systems.ts:688`), today invisible. Decision: rinse (free, restores efficiency, briefly dumps pollution back) vs replace media (coins, clean). Sink: media plus recurring attention.
3. **Planted biofilter (late-mid).** Prereq: expanded habitat **and** a measured demonstration that the sponge is outclassed at 20 residents — that measurement does not exist yet and is a prerequisite, not an assumption. Decision: plants occupy space, so filtration competes with social/spatial design. Sink: plants, trimming, substrate.
4. **Family lines and schooling (late; first non-throughput system).** Prereq: three generations alive at once. Transforms the already-implemented bond (`systems.ts:560`) from a hidden flag into visible structure. Decision: keep a line together or let the habitat mix. Sink: attention, not coins. This is where population stops being progression.
5. **Ageing, warned death, memorial (late, in that order).** Prereq: item 4 plus two generations of journal history. Decision: let a line end, or breed from it while you can. Sink: none initially — a memorial that charges coins to clear a grief penalty is the tax the progression doc warns about.

**Cut:** a second tank (the first hasn't earned it — the expanded habitat isn't measured at load), extra currencies, more species, temperature/pH meters, a fourth feeder tier (F6). **[spec]** Trust/temperament: attractive but no existing state to hang them on and no pressure they relieve — hold until item 4 exists.

## 5. Roadmap sequence

**Now**

1. **Rebuild the three broken triggers** — decaying >0.65 strain counter; credited-only siphon sweeps; average-murk `pollutedSeconds`. *Outcome:* tests asserting drip@3 and twin@8 accrue **zero** net strain over 30 sim-min, drip@6 crosses 45 s within 5 min, 60 empty sweeps credit 0, one dropping in a clean tank accrues 0 polluted seconds. Owns F7, F8.
2. **Ship the three-rung food ladder and opening constants** — flake 0.15, crumb 0.40/30, pellet unchanged; `starterHunger` 0.42, `seekFoodAbove` 0.20; per-tier pellet cost. *Outcome:* one unaccelerated fresh-save sitting recording rolling useful actions/min ≥8 for three minutes and no quiet gap over 12 s, against the simulated prediction `[12,8,9,9,10,10,10]` / 10.0 s longest gap [meas].
3. **Re-time the feeder and food offers** to the workload triggers, and correct `supportsResidents` to 4/12/20. *Outcome:* the drip offer lands at 4–5 residents in a fresh playthrough; the capacity suite passes against corrected ratings.

**Next** — 4. Opening waste cadence (`digestionPerDropping` 2 + breakdown 0.0080): visible debris inside ~100 s for a solo fish, twelve-resident count inside the 15–90 guard, mean murk <0.25. 5. Habitat expansion under real load — the trigger works (F9); what's unmeasured is a 20-resident tank's murk, debris, frame cost and readability, and that measurement gates item 3 of §4. 6. Breeding as a shaped system — partners exist; make courtship watchable and conditions legible.

**Later** — food logistics; filter media and rinsing; planted biofilter; family lines and schooling; ageing, death and memorial, in that dependency order.

**Not now** — visible tech tree; extra currencies; a fourth feeder tier (measured unnecessary); a second tank; more species; unbounded population; further ECS restructuring.

**Stale claims superseded**

- "~200 waste entities in a fed twelve-resident tank" (`ROADMAP.md` item 3) → **46–48** [meas].
- "The current feeder… less than half the throughput required by three mature fish" (`game-progression.md`) → fixed; staged feeders ship and *over*-deliver.
- "Increase baseline income from 0.12 to roughly 0.28" → already implemented (`model.ts:288`).
- "The siphon-to-filter clue can be manufactured in roughly fifty seconds" → the real figure is **~2.2 seconds**.
- The cadence doc's candidate ranges (starter hunger 0.40–0.45, flake 0.18–0.25) reach only 7–8 feeds/min [meas]; 0.15 is needed to clear the band floor with margin.

## 6. What still needs browser playtesting

Simulation shows the *opportunity* exists at the target rate. It cannot say whether ten feeds/minute reads as attentive care or as a metronome; whether a 10-second gap is observation or dead air; whether the crumb and pellet upgrades feel earned when the triggers fire; whether the drip feeder reads as relief or as the game playing itself; or whether a 20-resident expanded tank is legible at all. Record the full playtest list from `docs/player-activity-cadence.md`, especially times to first debris, siphon offer, crumb offer, second fish and first feeder.
