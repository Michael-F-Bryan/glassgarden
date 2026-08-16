# Glassgarden roadmap

**Audience:** maintainer and implementation agents

**Horizon:** Now / Next / Later; no calendar promises

**Scope:** player activity, simulation progression, economy, ecology, society, and the interaction surface

**Item vocabulary:** capabilities and validation gates, not a feature backlog

Direction comes from:

- [docs/interview.md](docs/interview.md) and [docs/first-playable-interview.md](docs/first-playable-interview.md) for the stable product intent;
- [docs/game-progression.md](docs/game-progression.md) for the broad responsibility arc;
- [docs/player-activity-cadence.md](docs/player-activity-cadence.md) for pacing research and activity hypotheses;
- [docs/progression-tuning-review.md](docs/progression-tuning-review.md) for Claude's read-only code review and simulation probes;
- the executable simulation and tests for implemented behaviour.

Proposed numbers below are one coherent playtest package, not settled balance constants. Arithmetic can establish reachability and throughput; only ordinary-speed browser play can establish whether care feels satisfying.

## Progression shape

Glassgarden should grow by changing what the player is responsible for:

> direct care → care automation → ecosystem management → fish society and history

Manual workload should form a sawtooth. Population and growth raise useful care demand towards a deliberate ceiling; richer food or automation then reduces repetition and exposes the next ecological, spatial, or social responsibility.

| Phase | Player responsibility | Target active workload | Pressure | Relief | What replaces the chore |
| --- | --- | ---: | --- | --- | --- |
| One resident | Feed directly and read one fish | 8–15 useful actions/min for the opening burst | Small food portions and first debris | Crumbs and siphon | Choosing when and where to care |
| Two to four residents | Keep several mouths fed | Workload rises towards 12–15/min | Manual feeding throughput | Hearty pellets, then drip feeder | Food cost and accumulating waste |
| Five to twelve residents | Operate a starter ecosystem | 4–8 interventions/min after relief | Feeder strain, debris, dispersed pollution | Twin/rotary feeder and sponge filter | Cleaning judgement, breeding, and capacity |
| Thirteen to twenty residents | Shape an expanded habitat | 1–4 interventions/min while watching | Spatial load, filtration service, social complexity | Food logistics, filter service, plants if needed | Habitat, family, and ecological decisions |
| Multiple generations | Follow and influence a society | Occasional consequential interventions | Ageing, turnover, grief, and history | Preparation, rituals, and memorials | Stewardship rather than throughput |

Observation counts when fish behaviour or ecological change is legible. Empty clicks, hidden counters, and avoidable danger do not.

## Evidence shaping this roadmap

The current branch no longer matches several claims in the old roadmap and progression document:

- The measured fresh-save opening produces three complete feed-and-eat cycles in 48 seconds: about **3.75 useful feeds/minute**. Claude's independent `GameSim` probe measured 3.4–4/minute and gaps as long as 23 seconds.
- A candidate package of `0.15`-nutrition flakes, starter hunger `0.42`, and food-seeking threshold `0.20` produced `[12, 8, 9, 9, 10, 10, 10]` useful feeds across seven simulated real-time minutes, with a ten-second longest gap. This establishes a viable experiment, not game feel.
- At twelve mature residents, current food costs consume about **2.9%** of passive income. The recurring coin sink collapses even though feeder operation remains mechanically paid.
- A mature twelve-resident tank now settles around **46–48 waste entities**, not the old ~200 measurement. The debris-carpet defect is fixed; local pollution can still pin one cell at 1.00.
- Empty siphon use can reveal the sponge filter in about **2.2 seconds** because every held pulse counts. The filter's murk route also watches worst-cell pollution while the HUD deliberately shows average murk.
- Feeder strain currently accumulates during normal operation and never decays. Comfortable tanks eventually reveal upgrades merely by waiting.
- Measured feeder capacity is approximately **4 / 12 / 20 residents**, not the advertised 3 / 8 / 12. The rotary feeder already supports the expanded habitat, so a fourth feeder tier has no demonstrated purpose.
- The habitat-expansion trigger is the healthy model: a full tank must remain comfortable and below the visible average-murk limit for a continuous five minutes. It cannot be spammed or earned by waiting through neglect.
- Persistent partners, parents, generations, courtship, eggs, and inherited genomes already exist. Later social work should deepen this substrate rather than pretend relationships are unimplemented.

## Candidate tuning package

Implement and test these values together. Do not independently cherry-pick the faster cadence while retaining early relief or dishonest triggers.

### Food, opening cadence, and operating cost

| Control | Current | Candidate | Intended effect |
| --- | ---: | ---: | --- |
| Starter-flake nutrition | `0.40` | `0.15` | Raise one-fish useful feeding from about 3.4 to 8.8 actions/minute without increasing starvation pressure |
| Starter-flake unit cost | `1` shared cost | `1` | Preserve the accessible opening sink |
| Crumb food tier | absent | nutrition `0.40`; purchase `30`; unit cost `2` | First workload drop: two small mouths fall from about 20.6 to 7.8 feeds/minute |
| Hearty-pellet nutrition | `1.00` | unchanged | Retain the feeder throughput basis |
| Hearty-pellet purchase | `80` | unchanged | Preserve the existing aspirational step |
| Hearty-pellet unit cost | `1` shared cost | `4` | Keep automated feeding economically visible as mass and population grow |
| Starter hunger | `0.35` | `0.42` | Support a short initial feeding sequence while remaining far below distress |
| Food-seeking threshold | `0.25` | `0.20` | Let tiny flakes form a care sequence rather than isolated bites |

Per-drop cost should move onto each food profile. The global hunger rate, satiation factor, hunger relief per nutrition, growth rate, distress thresholds, death grace period, and offline safety clamps remain unchanged for this experiment.

### Waste and meaningful cleaning

| Control | Current | Candidate | Intended effect |
| --- | ---: | ---: | --- |
| Nutrition per dropping | `4` | `2` | Produce first meaningful debris near the opening rather than one dropping every several minutes |
| Waste breakdown per second | `0.0045` | `0.0080` | Keep mature standing debris inside the existing 15–90 entity guard while increasing appearance rate |
| Credited siphon use | every pulse | removes debris or clears at least `0.05` local pollution | Make the hidden trigger recognise real cleaning |
| Siphon credit rate | unbounded held pulses | at most one credit per 1.5 seconds and water cell | Prevent stationary or tiny-loop farming |
| Sponge manual-cleaning route | 10 raw uses | 8 credited uses | Require fewer actions, each consequential |
| Sponge murk route | worst cell ≥`0.18` for 900 seconds | average murk ≥`0.14` for 420 seconds | Measure the same condition the player can see |

The siphon remains 60 coins. Its initial offer should still follow the first visible local pollution and settled debris; validate that the revised digestion cadence places this within roughly 90–180 seconds.

### Feeder pressure and capacity

| Control | Current | Candidate | Intended effect |
| --- | ---: | ---: | --- |
| Feeder strain | any fish above `0.40` without earmarked food | any fish above `0.65` without earmarked food | Count actual unmet demand rather than normal operation |
| Strain recovery | none | decay by `0.5` seconds per second while no fish is behind | Prevent eventual upgrades in comfortable tanks |
| Upgrade threshold | 75 accumulated seconds | 45 net seconds | Let genuinely overloaded equipment reveal relief before distress becomes routine |
| Advertised capacity | 3 / 8 / 12 | 4 / 12 / 20 | Match the measured safe bands |
| Feeder prices | 250 / 650 / 1,500 | unchanged for the first experiment | Measure the revised food sink before inflating one-time prices |

No fourth feeder is planned. The last throughput upgrade should hand progression to ecology, space, and society.

### Values held pending evidence

Keep these unchanged during the opening experiment:

- income floor `0.28` and income per gram `0.055`;
- fish offer at 8 g and purchase prices `120 / 300 / 750 / 1,900`, then `4,500`;
- sponge filter cost `550`, clearance `0.016/s`, and clogging point `45`;
- feeder drop intervals and spout layouts;
- starter capacity 12 and expanded capacity 20;
- habitat-expansion cost `6,000`, five-minute stability requirement, and average murk ceiling `0.15`;
- breeding weight, health, water-quality, cooldown, courtship, and hatch thresholds.

Per-food operating costs are expected to raise mature food spend from about 3% towards 10–15% of income. If the faucet still dominates after measurement, reshape mature income or add earned operating and aspirational sinks; do not merely make every shop price larger.

## Hidden shop-development sequence

Triggers should detect player-created pressure, recognise material outcomes, and resist spam. Exact formulas remain hidden from the player.

| Development | Hidden evidence | Safeguard | Contextual clue | Relief and next pressure |
| --- | --- | --- | --- | --- |
| Gravel siphon | First settled debris and local pollution reaches the existing visible-tint threshold | Requires real debris or pollution, not food clicks alone | The water is greening where things settle | Removes solids and local murk; introduces meaningful cleaning |
| Crumbs | At least 40 eaten flakes in the last six sim-minutes and tank mass at least 6 g | Only eaten food counts; mass gate excludes a newly arrived fry | Flakes disappear before reaching the sand | Reduces early feeding frequency; richer food costs more |
| Second fish | One resident reaches 8 g | Unchanged growth evidence | Word spreads about a thriving resident | Creates another mouth, a future partner, and the next workload rise |
| Hearty pellets | At least 40 eaten morsels in six minutes and either tank mass at least 40 g or four residents | Workload clause prevents an idle heavy tank unlocking it | Mealtimes are getting busy | Batches nutrition; increases food spend and waste per drop |
| Drip feeder | At least three residents and 60 eaten manual morsels in the last eight sim-minutes | Manual-only and eaten-only rolling window | Feeding these mouths by hand has become a chore | Removes repetitive feeding for a small tank; exposes continuous cost and unattended waste |
| Twin hopper | Current feeder accumulates 45 net seconds of real strain above `0.65` hunger | Counter decays while the feeder is coping and resets after purchase | Hungry mouths remain while the hopper cycles | Supports about twelve residents; water quality becomes the limiting system |
| Rotary feeder | Same strain test against the twin hopper | Comfortable twin-hopper tanks never accumulate net strain | Even two chambers cannot serve the full tank | Supports about twenty residents; ends the pure feeding-throughput ladder |
| Sponge filter | Owns siphon and either eight credited cleans or 420 seconds of visible average murk ≥`0.14` | Empty sweeps credit nothing; one dirty cell cannot contradict a clear HUD | Cleaning no longer keeps the green away for long | Clears dispersed pollution; solid debris and clogging preserve siphon judgement |
| Habitat expansion | Starter habitat at capacity, every resident comfortable, and average murk below `0.15` continuously for 300 seconds | Any distress or murk resets the streak | The healthy tank has run out of glass | Opens twenty-resident capacity and creates spatial, ecological, and social pressure |

The first food relief must become reachable before or around the second resident's arrival. A fresh-save browser sitting must establish whether the crumb and hearty-pellet clues land at the moment the workload is felt.

## Now

### 1. Prove the opening care sawtooth

**Outcome:** one resident creates an active but unhurried opening; crumbs provide the first felt relief; a second resident naturally raises care demand again.

**First slice:** the three-rung food ladder, candidate starter hunger and seeking threshold, per-food costs, and revised digestion cadence.

**Evidence gate:** in an unaccelerated fresh-save browser sitting:

- the player completes a useful action within five seconds;
- rolling useful care stays at or above eight actions/minute for the first three minutes without requiring danger;
- no unexplained quiet gap exceeds twelve seconds;
- the first growth clue appears within roughly 30–60 seconds;
- real debris and the siphon offer appear within roughly 90–180 seconds;
- crumbs become available before or around the second resident's arrival and visibly reduce workload;
- thirty seconds of deliberate inattention remains safe.

**Dependencies:** none.

**Risk:** simulation may produce the target count while the browser experience still feels like a metronome.

**Confidence:** high that the current cadence is too slow; medium that the proposed package feels right.

### 2. Make hidden developments truthful

**Outcome:** shop developments respond to visible pressure rather than raw clicks, hidden worst cells, or elapsed time in a comfortable tank.

**First slice:** credited siphon cleans, average-murk filtration pressure, and decaying feeder strain above `0.65` hunger.

**Evidence gate:**

- sixty empty siphon sweeps earn zero credits;
- one dropping in otherwise clear water accrues no sustained-murk time;
- a rated drip feeder at three residents and twin hopper at eight residents accumulate zero net strain over thirty simulated minutes;
- an overloaded drip feeder at six residents crosses the offer threshold within five simulated minutes;
- save migration preserves the new counters without replaying developments.

**Dependency:** counter semantics must be correct before offer timings are tuned.

**Risk:** thresholds that are honest in simulation may still communicate poorly in the tank.

**Confidence:** high.

### 3. Re-time the relief sequence

**Outcome:** food and feeder upgrades arrive after their workload is felt and reset attention to a lower band without flattening progression.

**First slice:** workload-based crumb, hearty-pellet, and drip-feeder triggers; measured feeder strain for later tiers; corrected 4/12/20 capacity descriptions.

**Evidence gate:** replay the complete fresh-save path through the first feeder and verify:

- each offer follows observable pressure and cannot be earned by spam;
- crumbs reduce care to roughly 4–8 useful actions/minute before growth raises it again;
- hearty pellets and the drip feeder do not both arrive as redundant relief;
- every feeder keeps its advertised population below distress;
- the next feeder is not offered while the current tier is comfortable.

**Dependency:** items 1 and 2.

**Risk:** overlapping food and feeder relief may erase too much active play if their triggers bunch together.

**Confidence:** medium until browser timing is observed.

### 4. Rebalance the mature coin loop

**Outcome:** growth remains rewarding without making food and equipment economically decorative.

**First slice:** measure food spend, income, and purchase wait times with per-food costs `1 / 2 / 4` at representative one-, four-, twelve-, and twenty-resident states.

**Evidence gate:**

- the opening never runs out of food money during attentive play;
- automated food remains an understandable operating sink;
- mature food spend is material rather than the current 2.9%;
- habitat expansion and later equipment require preparation without becoming idle walls;
- no new currency is introduced unless a distinct non-coin decision genuinely requires one.

**Dependency:** the food ladder and costs from item 1.

**Risk:** lowering the faucet globally would repair mature inflation by making the opening brittle.

**Confidence:** high that the current mature sink is too weak; low on the final economy until measured.

## Next

### 5. Validate the starter ecosystem at twelve residents

**Outcome:** feeding automation, waste, the siphon, and the sponge filter form a stable ecological sawtooth rather than independent upgrade ladders.

**First slice:** run twelve-resident simulations and ordinary-speed browser scenarios with the revised waste cadence and honest sponge trigger.

**Dependency:** Now items 1–4.

**Gate:** standing debris remains inside the 15–90 guard, mean murk stays legible, siphoning remains useful, and the sponge buys headroom without replacing solid-waste cleaning.

**Confidence:** medium.

### 6. Prove the expanded habitat under real load

**Outcome:** expansion from twelve to twenty residents creates a new operating regime while remaining readable and recoverable.

**First slice:** exercise a twenty-resident expanded tank for feeding, murk, debris, breeding, frame cost, hit targets, and visual legibility.

**Dependency:** the starter ecosystem must be stable first.

**Gate:** rotary feeding remains safe, the habitat stays readable, and evidence identifies whether filtration or spatial design becomes the next real bottleneck.

**Confidence:** medium on feeding capacity; low on ecology and presentation because twenty-resident load is unmeasured.

### 7. Shape breeding into a player-readable system

**Outcome:** partners, courtship, eggs, and descendants feel like outcomes of a thriving habitat rather than an automatic population faucet.

**First slice:** make existing partnerships and courtship legible, and expose environmental conditions through behaviour and contextual clues rather than formulas.

**Dependency:** capacity and ecology must prevent breeding from immediately pinning the tank at its ceiling.

**Gate:** the player can explain why a pair formed and why breeding did or did not proceed without reading a numerical rule.

**Confidence:** medium; the relationship substrate already exists.

### 8. Add mid-game operating decisions

**Outcome:** automation replaces clicking with planning rather than making the aquarium self-playing.

Candidate slices, in dependency order:

1. **Stocked hopper:** bulk-buy visible food stock and choose which food a feeder carries. Running dry is visible and recoverable, never fatal.
2. **Filter service:** expose existing clogging; rinse for free with a short water-quality trade-off or replace media for coins.
3. **Planted biofilter:** only if a measured twenty-resident tank outclasses the sponge. Plants compete for habitat space and convert ecological pressure into growth and layout decisions.

**Dependencies:** material food costs, a working sponge loop, and expanded-habitat measurements.

**Risk:** invisible upkeep becomes arbitrary rent. Every operating cost needs a visible cause, state, and benefit.

**Confidence:** medium for food stock and filter service; low for a planted filter until the load evidence exists.

## Later

### Family lines and schools

Reveal the already-recorded parents, partners, generations, and histories once three generations coexist. Let relatives and preferred companions swim, rest, or court together. The new decision is which lines and groups the habitat supports, not which relationship grants the best percentage bonus.

### Predictable ageing and generational turnover

Introduce visible old age only after several generations and a readable family structure exist. Give substantial warning and preserve the opportunity to continue a line. Natural death creates space and history; fish are not balancing ammunition.

### Grief, rituals, and memorials

Direct relatives and long-term companions should respond visibly to a death. A memorial appears only after the aquarium has history worth preserving. Its first job is remembrance and ritual, not charging coins to clear a morale penalty.

### Habitat-shaped temperament and trust

Repeated interaction may develop expressive traits after the family and history systems can carry their consequences. Hold this until there is a real behavioural pressure or relationship it transforms.

### Deeper ecological symbiosis

Plants, substrate, shelters, and feeding areas may influence ecology and social behaviour once the expanded habitat proves which pressures matter. Avoid adding meters whose only purpose is to justify another corrective upgrade.

## Not now

| Item | Reason |
| --- | --- |
| Visible technology tree or level system | Contradicts hidden, action-driven development |
| Fourth feeder tier | Measured rotary throughput already supports twenty mature residents |
| Second tank | The first expanded habitat has not yet proved its ecological and social depth |
| Additional currencies | No distinct systemic purpose; repair the coin economy first |
| More species with shallow differences | Individual genomes and family lines already carry identity |
| Temperature, pH, or chemistry dashboards | More meters would create corrective chores before they create interesting decisions |
| Unbounded population growth | Capacity is a deliberate valve; later progression shifts to complexity and history |
| Generic upgrade rules or a visible rule DSL | Typed stages and explicit hidden developments fit the actual system |
| Further ECS restructuring | No current progression outcome requires another architecture pass |

## Open evidence gates

- The candidate opening package has simulation evidence but no ordinary-speed browser acceptance.
- The crumb and hearty-pellet triggers may bunch together; their observed timing decides whether both tiers earn their place.
- Per-food costs are expected to make feeding material, but the mature coin faucet may still need a shaped curve or stronger aspirational sinks.
- Revised waste generation must preserve the mature debris guard and avoid returning to the old carpet.
- A second filtration stage is not justified until twenty-resident measurements show the sponge is inadequate.
- Expanded-habitat rendering and interaction at twenty residents remain unprofiled.
- Quantitative claims in `docs/game-progression.md` should be reconciled only after the candidate tuning package passes browser playtesting; do not rewrite provisional values into product direction before that gate.
