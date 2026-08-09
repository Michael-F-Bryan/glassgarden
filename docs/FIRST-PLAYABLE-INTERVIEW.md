# Glassgarden creative handoff interview

## Interview state

- **Status:** Complete
- **Timezone:** Australia/Perth (AWST, UTC+08:00)
- **Started:** 2026-08-09T01:18:27+0800 (AWST)
- **Completed:** 2026-08-09T01:50:59+0800 (AWST)
- **Architecture amendment recorded:** 2026-08-09T09:52:28+0800 (AWST)
- **Current phase:** Creative handoff complete
- **Purpose:** Capture Michael’s starting point, game vision, characteristic causal loops, examples, and boundaries so Claude Code can build the game out and adapt it as it learns.
- **Decision horizon:** Give Claude enough creative and product direction to begin well without prescribing an implementation specification.
- **Authorised output:** This durable interview record only. No gameplay specification, implementation plan, architecture, or code is authorised yet.
- **Question format:** Questions and their A, B, C, and D options are preserved in quote blocks in this log. Discord uses ordinary lettered bullet points.
- **Commit cadence:** Record answers without committing each turn; commit the completed interview once at the end.

## Source basis

- `INTERVIEW.md`, completed 2026-08-09: the authoritative Glassgarden direction interview.
- Its first-playable validation target: players should feel that the aquarium grows and evolves in response to their actions.

## Calibrated brief

This is a creative starting point, not an implementation specification. The current vision is a desktop-first browser experience that can remain open in a laptop tab between occasional check-ins. It begins with a bare tank containing one small, hungry fish that the player needs to feed. Repeated feeding makes the fish grow larger. Larger fish eat more and produce larger droppings; uneaten food and droppings left in the tank gradually turn the surrounding water green. Swimming through polluted water makes the fish feel sick, creating pressure to buy a cleaning device and manually remove the waste. The player passively earns coins at a rate proportional to the total weight of all fish in the tank. Growth therefore increases both income and ecological pressure. Reaching a hidden growth threshold, such as the starter fish’s weight, unlocks the option to buy another fish. Each purchased fish becomes increasingly expensive so that breeding can replace purchases as the main source of population growth. The envisaged early breeding proof is a compatible pair producing at least one baby; several offspring are worthwhile if the underlying model makes them cheap. Offspring combine parental traits with some randomness. While the page is open, the aquarium advances at its normal wall-clock rate. Closing it still permits some progress, but simulation is slowed or capped to reduce the chance of returning to starvation or fatal disease. A fish may die from hunger or sickness only while the player is present, after ample warning and continued neglect. The game ends when no living fish remain, but coins and purchased equipment survive; the player can buy a new starter fish and continue with that retained material progress. Claude should preserve the aquarium-idle premise, nurturing fantasy, and hidden action-driven evolution while remaining free to simplify, extend, or reshape the specific mechanics and progression path according to feasibility and play quality. The simulation and game logic should use a proper entity–component–system architecture rather than accumulating ad hoc state and behaviour; Claude retains authority over the ECS library and concrete component and system design.

## Registers

### Assumptions

| ID | Claim | Source | Confidence | Validation | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | One complete hidden-development path can demonstrate the broader action-driven evolution premise before a general progression network exists. | Direction interview Q7–Q10 | Medium | Claude’s implementation exploration and later playtest | Open |

### Vision anchors and boundaries

C1–C5 describe the stronger product boundaries inherited from the direction interview. C6–C8 capture the concrete starting mechanics discussed here; under C9 and C10, Claude may adapt those mechanics while preserving the creative core. C11 establishes the simulation architecture without prescribing a particular ECS library or domain model.

| ID | Boundary | Source | Consequence |
| --- | --- | --- | --- |
| C1 | The first playable targets desktop web and does not target mobile. | Direction interview Q9 | Controls and layout should suit a laptop browser tab. |
| C2 | Progression must feel like a natural response to care and environmental choices, not explicit levelling. | Direction interview Q7 | No visible levels or conventional player-facing tech tree. |
| C3 | A development is announced, but its trigger is conveyed through contextual clues rather than formulas. | Direction interview Q8 | The player needs both surprise and enough evidence to form a causal theory. |
| C4 | Absence must not produce catastrophic loss such as returning to a tank full of dead fish. | Direction interview Q2 | Any deterioration in the first playable needs a recoverable floor. |
| C5 | The first playable must prove action-driven growth and evolution; later lifecycle, social, and content breadth are not required unless they are necessary for that proof. | Direction interview Q10 | Scope cuts should preserve the validating loop rather than representative feature count. |
| C6 | Simulation while the page is closed is slowed or capped. | Q4 | Closed-tab progress remains visible but cannot advance unchecked towards starvation or disease. |
| C7 | Neglect can kill fish only while the player is present and after ample warning; no living fish means game over. | Q5 | Closed-page progression cannot kill the final resident, and the open-page simulation needs clear deterioration warnings and a terminal state. |
| C8 | The envisaged early breeding proof is one baby from a compatible pair; several varied offspring are worthwhile if cheap. | Q8 | This is a scope anchor for Claude, not a mandatory acceptance requirement. |
| C9 | The interview is a creative starting point and vision, not a specification Claude must implement literally. | Interview-control amendment 1 | Claude can adapt, simplify, and extend mechanics as it learns what is feasible and fun. |
| C10 | Preserve the aquarium-idle premise, nurturing fantasy, and hidden action-driven evolution; specific mechanics and progression may be reshaped. | Q10 | This is the stable creative core for Claude’s adaptation. |
| C11 | Build the simulation and game logic around a proper entity–component–system architecture rather than ad hoc state and behaviour. | Architecture amendment 1 | ECS owns the game model and simulation; Claude chooses the concrete library, components, systems, and UI boundary according to implementation findings. |

### Unknowns

| ID | Unknown | Why it matters | Resolution | Status |
| --- | --- | --- | --- | --- |
| U1 | Starting aquarium state | Determines how quickly the player can act, care about residents, and observe change. | Michael’s judgement | Resolved: bare tank with one small, hungry fish |
| U2 | Initial player actions | Defines the input side of the validating cause-and-effect loop. | Michael’s judgement | Narrowed: feeding followed by manual waste cleaning |
| U3 | Time and check-in model | Determines whether development can be tested naturally without artificial waiting. | Michael’s judgement and later playtest | Resolved: normal open-page time; slowed or capped closed-page progress |
| U4 | First hidden-development path | Gives Claude a concrete causal path to use, test, or adapt. | Michael’s judgement | Resolved: feeding → growth → greater consumption and waste → pollution → sickness pressure → manual cleaning |
| U5 | Player-visible feedback and contextual clues | Determines whether development feels understandable rather than arbitrary. | Michael’s judgement and later playtest | Narrowed: visible growth, larger waste, locally greening water, and an announced fish-purchase unlock communicate development |
| U6 | Persistence and return behaviour | Determines what survives reloads, closed tabs, and elapsed real time. | Michael’s judgement | Narrowed: coins and purchased equipment survive game over; ordinary reload persistence remains open |
| U7 | Starting-scope picture | Gives Claude a coherent initial path without turning it into a fixed feature contract. | Michael’s judgement | Narrowed: passive currency, cleaner purchase, multiple fish, and one baby form the current starting picture |
| U8 | Player-visible signs of success | Gives Claude a way to judge whether its adaptation preserves the intended experience. | Michael’s judgement | Open |
| U9 | Cleaning-device acquisition and economy | Determines whether the first playable needs currency, rewards, a shop, or only a capability unlock. | Michael’s judgement | Resolved: passive coins proportional to total fish weight fund the cleaner purchase |
| U10 | Neglect and death floor | Determines the worst consequence of hunger or sickness, especially for the only starting fish. | Michael’s judgement | Resolved: warned open-page neglect can kill; zero living fish ends the game |
| U11 | Game-over restart contract | Determines whether a new run is a full reset, preserves discoveries, keeps purchases, or permits recovery. | Michael’s judgement | Resolved: retain coins and equipment, then buy a new starter fish |
| U12 | Population expansion in the first playable | Determines whether the player can add fish before game over and whether multi-fish pressure belongs in the validating slice. | Michael’s judgement | Resolved: hidden starter-growth threshold unlocks purchases; each purchased fish costs more |
| U13 | Breeding scope | Shows how far Michael imagines early breeding progressing without making it a fixed requirement. | Michael’s judgement | Resolved: one baby is the envisaged baseline; several varied offspring if implementation is cheap |
| U14 | First offspring semantics | Determines whether the first baby demonstrates inheritance, environmental shaping, random individuality, or only population growth. | Michael’s judgement | Resolved: parental traits combined with some randomness |
| U15 | Claude’s creative authority | Determines which parts of the vision are non-negotiable and which Claude may reshape while building. | Michael’s judgement | Resolved: preserve the premise, fantasy, and action-driven hidden evolution; reshape mechanics and progression as needed |
| U16 | Game-logic architecture | Determines whether simulation state and behaviour have a coherent extensible model or grow through ad hoc UI-local mechanisms. | Michael’s judgement and Claude’s implementation exploration | Resolved in direction: proper ECS; exact library and component/system boundaries remain implementation discovery |

### Learnings

| ID | Learning | Evidence |
| --- | --- | --- |
| L1 | Nurturing a thriving ecosystem is the central fantasy. | Direction interview Q1 |
| L2 | The aquarium should continue changing according to the player’s preparation while they are away. | Direction interview Q2 |
| L3 | Procedurally generated residents should become distinct through traits, relationships, histories, and interacting systems. | Direction interview Q3 |
| L4 | Repeated ordinary actions can cross hidden thresholds that produce new capabilities and later pressures. | Direction interview Q7 |
| L5 | The first playable succeeds when the player feels the aquarium is growing and evolving in response to their actions. | Direction interview Q10 |
| L6 | The first playable starts with a bare tank and one small, hungry fish that needs to be fed. | Q1 |
| L7 | Repeated feeding makes the fish grow visibly larger. | Q2 |
| L8 | A larger fish consumes more food and produces larger droppings, making growth create ecological pressure. | Q2 |
| L9 | Uneaten food and droppings gradually turn nearby water green; swimming through it makes the fish feel sick. | Q2 |
| L10 | The first pressure is addressed by obtaining a cleaning device and manually removing food and droppings. | Q2 |
| L11 | Coins accrue passively at a rate proportional to the total weight of all fish in the tank. | Q3 |
| L12 | Fish growth raises both passive income and food-and-waste pressure. | Q3 |
| L13 | Closing the page still produces some progress, but at a slowed or capped rate that reduces starvation and disease risk. | Q4 |
| L14 | Fish can die from hunger or sickness only while the player is present, after ample warning and continued neglect. | Q5 |
| L15 | The game ends when no living fish remain. | Q5 |
| L16 | Game over preserves coins and purchased equipment; the player buys a new starter fish to continue. | Q6 |
| L17 | Reaching a hidden growth threshold, such as starter-fish weight, unlocks the option to buy another fish. | Q7 |
| L18 | Each subsequent fish purchase becomes increasingly expensive. | Q7 |
| L19 | Breeding should eventually become the main way to add fish. | Q7 |
| L20 | The envisaged early breeding proof is one baby; several offspring with visible variation are conditional on low implementation cost. | Q8 |
| L21 | Offspring combine traits from both parents with some randomness. | Q9 |
| L22 | The interview should give Claude a starting point and game vision, not a specification; Claude is expected to build out and adapt the game as it sees fit. | Interview-control amendment 1 |
| L23 | Claude should preserve the aquarium-idle premise, nurturing fantasy, and hidden action-driven evolution while remaining free to reshape specific mechanics and progression. | Q10 |
| L24 | A proper ECS is the intended architecture for simulation and game logic; concrete ECS choices remain Claude’s responsibility. | Architecture amendment 1 |

### Deferred decisions

| ID | Decision | Revisit trigger | Evidence needed | Owner |
| --- | --- | --- | --- | --- |
| D1 | Visual direction | After the creative handoff | The intended emotional tone, residents, interactions, and feedback | Claude’s design exploration |
| D2 | ECS library, component/system boundaries, persistence integration, and UI adapter design | During implementation | The emerging simulation model and observed implementation pressure | Claude’s implementation exploration |

## Completion

The interview now gives Claude a coherent opening scenario, examples of how care can create both growth and new pressures, an intended route from one fish to a breeding population, a clear creative-authority boundary, and ECS as the initial game-logic architecture. Open tuning, persistence, presentation, concrete ECS design, implementation, and content decisions are deliberately left for Claude to explore rather than converted into further interview requirements.

## Chronological record

### Q1 — Starting aquarium state

**Asked:** 2026-08-09T01:18:27+0800 (AWST)

**Question:**

> Which starting state gives the first playable the best chance to prove that care causes development?
>
> **A.** A small, healthy tank with a few distinct fish, ready for the player to begin caring for immediately.
>
> **B.** A neglected but recoverable tank whose residents improve as the player stabilises it.
>
> **C.** An empty tank where the player chooses the environment and first residents before the simulation begins.
>
> **D.** A mature tank with several existing systems and one hidden development already close to unlocking.
>
**What this is trying to decide:** How much setup, recovery, and existing complexity the first playable needs before the player can enter the validating care-to-development loop.

**Evidence basis:** C2–C5, U1, and L1–L5.

**Answer received:** 2026-08-09T01:20:56+0800 (AWST)

**Answer:**

> The player starts with a bare tank with a single, small, hungry fish that they need to feed.

**Interpretation:** The first playable should begin without a setup screen, established ecosystem, or recovery problem. One vulnerable resident gives the player an immediate reason to act and makes the effect of feeding easy to attribute.

**Effect:** Resolves the starting state and establishes feeding as the first required interaction. The next question can select the first development that transforms feeding from maintenance into progression.

**Register updates:** U1 resolved; U2 narrowed; L6 added.

### Q2 — First surprising development

**Asked:** 2026-08-09T01:20:56+0800 (AWST)

**Question:**

> After the player feeds this fish repeatedly, which first surprising development should prove that their behaviour is shaping it?
>
> **A.** Growth: the fish becomes visibly larger and healthier than when it arrived.
>
> **B.** Trust: it begins recognising the player, approaching the cursor, and allowing a new interaction such as petting.
>
> **C.** Metabolism: it adapts to the feeding pattern, gaining a benefit such as faster growth but creating more hunger or waste.
>
> **D.** Ecological pressure: uneaten food and waste begin changing the tank, forcing the player to care for the environment as well as the fish.
>
**What this is trying to decide:** The first concrete response that turns feeding from routine maintenance into evidence that the aquarium develops around the player’s behaviour.

**Evidence basis:** A1, C2–C5, U2, U4, and L4–L6.

**Answer received:** 2026-08-09T01:26:32+0800 (AWST)

**Answer:**

> A. The fish should grow larger.
>
> That then segues into D - larger fish eat more and have bigger poops, and if you leave uneaten food or fish poop for too long the water around it starts to go green. Swimming through the water makes the fish start feeling sick, so you've got to buy some sort of cleaning device that lets the player manually clean up the poop and uneaten food.

**Interpretation:** Growth is the first visible reward, but it is also the source of the next problem. Increased appetite and waste make the tank dirtier; pollution is spatial and legible rather than an abstract global meter; contact with polluted water affects the fish; and manual cleaning becomes the first capability expansion.

**Effect:** Resolves the first development path as a causal ecological loop and brings manual cleaning into the first-playable scope. Raises one new scope decision: whether obtaining the cleaner requires a genuine economy and shop.

**Register updates:** U2 and U5 narrowed; U4 resolved; U9 added; L7–L10 added.

### Q3 — Obtaining the cleaning device

**Asked:** 2026-08-09T01:26:32+0800 (AWST)

**Question:**

> When pollution first creates a need for cleaning, how should the player obtain the cleaning device?
>
> **A.** A basic economy: keeping the fish fed and healthy passively earns currency that can be spent in a shop.
>
> **B.** Milestone rewards: feeding, growth, or discoveries award currency, and the cleaner is the first meaningful purchase.
>
> **C.** A starter allowance: the player begins with enough money for one early purchase and must recognise that the cleaner is now the useful choice.
>
> **D.** No economy yet: pollution automatically unlocks or grants the cleaner so the first playable can test the care loop without also building currency and a shop.
>
**What this is trying to decide:** Whether buying the cleaner introduces a real economy into the first playable or whether “buying” is deferred so the ecological loop stays small.

**Evidence basis:** C5, U7, U9, and L7–L10.

**Answer received:** 2026-08-09T01:29:08+0800 (AWST)

**Answer:**

> A. I feel like you should passively gain coins at a rate proportional to the total weight of all fish in the tank.

**Interpretation:** The first playable includes a genuine passive economy. Fish mass is the production base, so feeding and growth increase purchasing power while simultaneously increasing food demand and waste production.

**Effect:** Resolves how the cleaner is funded and adds passive currency plus a purchase surface to the first-playable scope. Makes elapsed-time behaviour the next material decision because income and ecological pressures advance together.

**Register updates:** U3 expanded; U7 narrowed; U9 resolved; L11 and L12 added.

### Q4 — Elapsed time while away

**Asked:** 2026-08-09T01:29:08+0800 (AWST)

**Question:**

> How much elapsed time should the aquarium simulate when the player returns?
>
> **A.** All wall-clock time, whether the tab remained open or the browser was closed.
>
> **B.** Only time while the page remained open, including when it sat in a background tab.
>
> **C.** Wall-clock time while open, plus a capped amount of progress after the page or browser is closed.
>
> **D.** An accelerated in-game clock while actively running, with no offline progression in the first playable.
>
**What this is trying to decide:** The idle-time contract governing coin income, hunger, growth, waste, pollution, and sickness when the game is not visible.

**Evidence basis:** C1, C4, U3, U6, and L2, L8–L12.

**Answer received:** 2026-08-09T01:31:53+0800 (AWST)

**Answer:**

> C. We'll slow/cap the game progression while the tab is closed. That way you can see *some* progress, but are less likely to come back and find all your fish have starved or died of disease while you were gone.

**Interpretation:** Open-page simulation should use the normal game rate. Closed-page elapsed time still advances the aquarium enough to preserve the idle payoff, but a slowdown or cap limits unattended hunger, pollution, sickness, and income.

**Effect:** Resolves the broad elapsed-time contract while deferring the exact cap and rate to later tuning. Exposes the remaining consequence boundary: whether neglect can kill the only starting fish at all.

**Register updates:** C6 added; U3 resolved; U10 added; L13 added.

### Q5 — Worst consequence of neglect

**Asked:** 2026-08-09T01:31:53+0800 (AWST)

**Question:**

> If hunger or sickness reaches its worst state in the first playable, what should happen to the starting fish?
>
> **A.** It cannot die from neglect; it becomes weak, stops growing, and produces little or no income until the player restores it.
>
> **B.** It can die only while the page is open, after clear warnings give the player time to intervene.
>
> **C.** It can die after prolonged neglect, but the player receives a replacement starter fish so the game cannot deadlock.
>
> **D.** It can die during either open or capped closed-page simulation; the slower closed progression is the only protection.
>
**What this is trying to decide:** The recoverable floor for the only resident and whether neglect can end the first-playable run.

**Evidence basis:** C4, C6, U10, and L6, L9, L13.

**Answer received:** 2026-08-09T01:34:05+0800 (AWST)

**Answer:**

> B. We'll give the player plenty of warning, but if they still neglect their starter fish, it'll die. The game ends when you have no living fish left.

**Interpretation:** Death from neglect is permitted only as an observed, warned consequence of continued inaction. The closed-page slowdown protects absent players, while an attentive player can still let the simulation reach a terminal state. Zero living residents is the run-ending condition.

**Effect:** Resolves the consequence floor and introduces an explicit game-over state. Raises the restart question because it determines whether the first playable needs metaprogression, retained equipment, or rollback.

**Register updates:** C7 added; U10 resolved; U11 added; L14 and L15 added.

### Q6 — What survives game over

**Asked:** 2026-08-09T01:34:05+0800 (AWST)

**Question:**

> When the last fish dies and the game ends, what should carry into the next run?
>
> **A.** Nothing: restart with the original bare tank, one small hungry fish, and no coins or purchases.
>
> **B.** Discovered developments remain known, but the tank, fish, coins, and purchases reset.
>
> **C.** Coins and purchased equipment remain, and the player buys a new starter fish to continue.
>
> **D.** The player may restore one recent checkpoint instead of beginning a new run.
>
**What this is trying to decide:** Whether game over is a clean restart, introduces metaprogression, continues the same aquarium, or needs rollback machinery.

**Evidence basis:** C7, U6, U7, U11, and L14–L15.

**Answer received:** 2026-08-09T01:35:51+0800 (AWST)

**Answer:**

> C

**Interpretation:** Game over removes the living population but does not erase material progress. Coins and purchased equipment remain, and the player spends retained currency on a new starter fish to resume the aquarium.

**Effect:** Resolves restart semantics without requiring rollback or a separate permanent-discovery layer. Raises whether purchasing additional fish is only a recovery mechanism or also part of ordinary progression in the first playable.

**Register updates:** U6 narrowed; U11 resolved; U12 added; L16 added.

### Q7 — Adding more fish

**Asked:** 2026-08-09T01:35:51+0800 (AWST)

**Question:**

> Before game over, when should the player be able to add another fish to the tank?
>
> **A.** Immediately: additional fish are available in the shop from the beginning if the player can afford them.
>
> **B.** After the starter fish reaches a growth milestone, making population growth the next reward.
>
> **C.** After the player buys the cleaner and stabilises the first fish’s waste pressure.
>
> **D.** Not in the first playable: it contains one living fish at a time, and fish purchases exist only to recover from game over.
>
**What this is trying to decide:** Whether the first playable must simulate a growing population and compounding fish mass, or can validate the loop with one resident at a time.

**Evidence basis:** C5, U7, U12, and L8, L11–L12, L16.

**Answer received:** 2026-08-09T01:39:00+0800 (AWST)

**Answer:**

> B. The option to buy another fish is unlocked at some hidden threshold (E.g. the starter fish's weight). Then each subsequent fish gets increasingly expensive until breeding becomes the main way to add new fish.

**Interpretation:** Population expansion is unlocked indirectly through successful care rather than being available from the opening shop. Fish purchases bootstrap the population, but escalating prices deliberately make them unsustainable as the primary growth method. Breeding is the intended successor system.

**Effect:** Resolves multi-fish progression and adds escalating fish prices to the economy. Raises whether breeding itself belongs in the first playable or should remain beyond its validating boundary.

**Register updates:** U5 narrowed; U12 resolved; U13 added; L17–L19 added.

### Q8 — Breeding in the first playable

**Asked:** 2026-08-09T01:39:00+0800 (AWST)

**Question:**

> How far should the first playable go towards breeding?
>
> **A.** Stop after buying a second fish; breeding belongs entirely to a later version.
>
> **B.** Let the player buy a compatible pair and produce one baby, proving the hand-off from purchases to breeding.
>
> **C.** Include an early breeding loop with several offspring and visible inherited or environmentally shaped differences.
>
> **D.** Include breeding only as an announced future unlock or disabled shop item, without implementing offspring yet.
>
**What this is trying to decide:** Whether the validating slice must prove generational progression or only establish the economic pressure that will make breeding valuable later.

**Evidence basis:** C5, U7, U13, and L17–L19.

**Answer received:** 2026-08-09T01:41:30+0800 (AWST)

**Answer:**

> B or C, depending on how easy the implementation is.

**Interpretation:** Producing one baby is the minimum required breeding proof. Several offspring with visible inherited or environmentally shaped differences are desirable, but only as a low-cost extension of the same mechanics rather than a reason to enlarge the first playable substantially.

**Effect:** Converts an implementation-dependent preference into a minimum-plus-stretch scope rule. Raises the minimum semantics of the required baby: breeding should either demonstrate variation or be explicitly limited to population growth.

**Register updates:** C8 added; U7 narrowed; U13 resolved; U14 added; L20 added.

### Q9 — What the first baby reflects

**Asked:** 2026-08-09T01:41:30+0800 (AWST)

**Question:**

> At minimum, what should make the first baby meaningfully different from simply adding another generic fish?
>
> **A.** It visibly blends simple traits from its parents, such as colour, body shape, or expected adult size.
>
> **B.** It receives a random combination of individual traits, making it distinct without modelling inheritance yet.
>
> **C.** Conditions during development, such as food availability or pollution, visibly affect its health, growth, or appearance.
>
> **D.** Nothing beyond being a new resident; the first playable only needs to prove that breeding can increase population.
>
**What this is trying to decide:** The smallest offspring behaviour needed to make breeding support Glassgarden’s emergent-development promise rather than act as a cheaper purchase button.

**Evidence basis:** C2, C5, C8, U14, and L3–L5, L19–L20.

**Answer received:** 2026-08-09T01:45:39+0800 (AWST)

**Answer:**

> A. The Offspring gets a combination of its parents traits, but with some randomness mixed in.

**Interpretation:** Breeding should create recognisable lineage without cloning either parent. A baby draws from both parents’ traits and adds enough randomness to remain an individual.

**Effect:** Resolves the offspring model at the level useful for a creative handoff. Exact trait representation and inheritance mathematics remain Claude’s design and implementation problem.

**Register updates:** U14 resolved; L21 added.

### Interview-control amendment 1 — Handoff intent

**Received:** 2026-08-09T01:45:39+0800 (AWST)

**Direction:**

> Btw, the goal of this interview process isn't to come up with a spec that Claude implements. I want to give it a starting point and my vision for the game so it can build things out and adapt as it sees fit.

**Effect:** Reframes the interview from a behavioural contract into a creative handoff. Current mechanics are vision anchors and worked examples rather than literal acceptance requirements. The remaining interview frontier is the creative core Claude should preserve while adapting them.

**Register updates:** C8 reframed; C9 added; U7 and U8 reframed; U15 added; L22 added.

### Q10 — Claude’s freedom to adapt

**Asked:** 2026-08-09T01:45:39+0800 (AWST)

**Question:**

> Which parts of this vision should Claude treat as fixed while it builds and adapts the game?
>
> **A.** Keep the described gameplay loop and rules intact; Claude may choose presentation and implementation details.
>
> **B.** Preserve the aquarium-idle premise, nurturing fantasy, and action-driven hidden evolution; Claude may reshape the specific mechanics and progression path.
>
> **C.** Preserve only the emotional promise of caring for a living, evolving aquarium; Claude may replace any mechanics that serve it poorly.
>
> **D.** Treat everything in the interviews as inspiration rather than a constraint, with full authority to reinterpret the game.

**What this is trying to decide:** The stable creative core Claude should protect while exercising the adaptation authority Michael intends to give it.

**Evidence basis:** C1–C9, U15, and L1–L22.

**Answer received:** 2026-08-09T01:50:59+0800 (AWST)

**Answer:**

> B.

**Interpretation:** Claude should preserve the aquarium-idle premise, nurturing fantasy, and action-driven hidden evolution. The concrete mechanics and progression path are examples of how that vision could work, not rules Claude must reproduce literally.

**Effect:** Establishes the stable creative core and grants Claude explicit authority to reshape mechanics according to feasibility and play quality. This resolves the final high-value interview frontier; further questions would mostly constrain decisions Michael wants Claude to make.

**Register updates:** C10 added; U15 resolved; L23 added.

### Architecture amendment 1 — ECS game logic

**Received:** 2026-08-09T09:52:28+0800 (AWST)

**Direction:**

> I also feel like using a proper ECS is the best architecture for building the game logic, rather than cobbling things together in an ad-hoc way. Can you integrate that into one of the interviews so Claude gets the right initial direction?

**Interpretation:** The simulation should be modelled as entities with component data processed by systems, not as game state and behaviour scattered across React components or one-off feature objects. This is an architectural starting direction rather than a mandate for a particular ECS package or speculative general-purpose engine.

**Effect:** Adds ECS as a stable implementation boundary while leaving the library, domain decomposition, persistence integration, and presentation adapter to Claude’s implementation exploration.

**Register updates:** C11, U16, and L24 added; D2 narrowed.
