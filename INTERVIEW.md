# Glassgarden direction interview

## Interview state

- **Status:** Active
- **Timezone:** Australia/Perth (AWST, UTC+08:00)
- **Current phase:** Direction interview
- **Purpose:** Establish the game’s central fantasy, core loop, boundaries, and validation target before any specification or implementation.
- **Decision horizon:** Decide what kind of aquarium idle game Glassgarden should become.
- **Authorised output:** This durable interview record only. No game specification, plan, or implementation is authorised yet.
- **Question format:** Bounded options are labelled A, B, C, and D so Michael can refer to them directly.

## Source basis

- Michael’s initial direction, received 2026-08-09: an idle game based around some form of aquarium simulation.
- Simon Willison, [“Moonlight & Mayhem (Raccoon Heist by Codex + GPT-5.6 Sol Ultra)”](https://simonwillison.net/2026/Aug/7/moonlight-mayhem/), 2026-08-07: an example of using a coding agent to turn a compact game premise into a complete playable game, including generated visual assets and a preserved transcript.

## Calibrated direction

Glassgarden is an aquarium idle game centred on nurturing a thriving ecosystem and forming emotional attachments to procedurally generated residents. Their traits, relationships, and histories emerge through play, with interacting systems creating surprising behaviour. They sit between expressive animals and a whimsical fish society: recognisable emotions and relationships can grow into social mechanics without becoming a full cartoon civilisation. Residents have predictable lifespans and may die naturally; relatives grieve, and later upgrades such as a cemetery can transform that social pressure into remembrance. The ecosystem continues autonomously between frequent check-ins, improving or deteriorating according to the player’s preparation. Problems should remain recoverable rather than allowing absence to produce a tank full of dead fish, but may leave visible effects on a new generation’s health or growth. Progression currently appears to braid a denser, more self-sustaining tank with generations shaped by its conditions. An evolution tree may connect ecological growth to unlocked biological and social capabilities, but the player’s authority over evolution is undecided. The exact progression spine, simulation depth, platform, and scope also remain open.

## Registers

### Assumptions

| ID | Claim | Source | Confidence | Validation | Status |
| --- | --- | --- | --- | --- | --- |
| A1 | An evolution tech tree could connect progression to biological and social capabilities. | Q6 | Tentative | Michael’s judgement after clarifying player control | Open |

### Constraints

| ID | Boundary | Source | Consequence |
| --- | --- | --- | --- |
| C1 | The direction must retain an aquarium simulation and idle-game structure. | Michael’s initial direction | Concepts outside either boundary are out of scope unless Michael amends the premise. |
| C2 | Deterioration during absence must not end in a tank full of dead fish. | Q2 | Offline consequences need a recoverable floor; the game cannot punish absence with catastrophic loss. |

### Unknowns

| ID | Unknown | Why it matters | Resolution | Status |
| --- | --- | --- | --- | --- |
| U1 | Central player fantasy | Determines the core loop, progression, simulation emphasis, and emotional tone. | Michael’s judgement | Resolved: nurturing a thriving ecosystem |
| U2 | Offline ecosystem behaviour and consequences | Determines whether idling feels like trust in a living system, harmless passive growth, or exposure to neglect and loss. | Michael’s judgement | Resolved: preparation-driven autonomous change with recoverable deterioration |
| U3 | Target platform and presentation | Determines controls, session length, technology, and asset needs. | Later interview question | Open |
| U4 | Character and attachment model | Determines whether emotional investment comes from authored characters, emergent individuals, or the aquarium community as a whole. | Michael’s judgement | Resolved: procedurally generated individuals with emergent traits, relationships, and histories |
| U5 | Main progression spine | Determines what visibly grows, how new pressures emerge, and what upgrades enable. | Michael’s judgement | Narrowed: denser ecosystem and generational adaptation, possibly as one loop |
| U6 | Resident lifecycle and turnover | Determines whether generational progression requires ageing, death, departure, or abstraction, and how attachment survives turnover. | Michael’s judgement | Resolved: predictable lifespans, natural death, and consequences for surviving relatives |
| U7 | Degree of anthropomorphism | Determines whether grief, cemeteries, relationships, and other social systems are grounded animal behaviour or an overtly whimsical society. | Michael’s judgement | Resolved: between expressive animals and a whimsical social world |
| U8 | Player authority over evolution | Determines whether the player engineers traits directly, shapes selection pressures, or unlocks possibilities that remain emergent. | Michael’s judgement | Open |

### Learnings

| ID | Learning | Evidence |
| --- | --- | --- |
| L1 | The seed concept combines passive progression with a living aquarium. | Michael’s initial direction |
| L2 | Nurturing a thriving ecosystem is the game’s central player fantasy. | Q1 |
| L3 | The aquarium should continue changing autonomously according to how well the player prepared it. | Q2 |
| L4 | Frequent check-ins and emotional attachment to the game’s characters are part of the intended Tamagotchi-like experience. | Q2 |
| L5 | Emotional attachment should arise from procedurally generated individuals whose traits, relationships, and histories emerge through play. | Q3 |
| L6 | Progression should increase ecological complexity and naturally create new maintenance pressures that motivate better solutions. | Q3 |
| L7 | Conditions during absence may shape the next generation through persistent but non-catastrophic effects such as illness risk or reduced growth. | Q4 |
| L8 | Older residents may die naturally, with grief temporarily affecting their direct relatives. | Q5 |
| L9 | Upgrades may address social and emotional pressures as well as physical aquarium needs; a cemetery could let relatives visit and remove the grief penalty. | Q5 |
| L10 | Selective whimsical social behaviour should provide game mechanics without turning residents into a fully human-like civilisation. | Q6 |

### Deferred decisions

_None._

## Pending question

### Q7 — Who directs evolution

**Asked:** 2026-08-09T00:46:24+0800 (AWST)

**Question:** How much control should the player have over evolution?

**A.** Direct control: the player chooses exact traits or behaviours for a lineage.

**B.** Indirect control: the player shapes the environment, and adaptations emerge from those pressures.

**C.** Gated emergence: the tech tree unlocks possible adaptations or social behaviours, but individuals develop them unpredictably.

**D.** Broad direction: the player steers a species towards themes such as sociability, resilience, or fertility, while individual expression remains emergent.

**What this is trying to decide:** Whether evolution is an optimisation menu, a consequence of care, a pool of unlocked possibilities, or a balance between player intent and surprise.

**Evidence basis:** A1, U5, U8, L5, L7, and L10.

**Answer:** _Pending._

## Chronological record

### Q1 — Central player fantasy

**Asked:** 2026-08-09T00:19:56+0800 (AWST)

**Question:** When Glassgarden is working at its best, which fantasy should dominate: nurturing a thriving ecosystem, collecting and breeding unusual creatures, optimising a complex living system, building an aquarium empire, or something else? You can mix them, but which one should be the centre of gravity?

**What this is trying to decide:** The emotional promise that should govern the game’s core loop and prevent a generic pile-up of aquarium mechanics.

**Evidence basis:** C1, U1, and L1.

**Answer received:** 2026-08-09T00:22:42+0800 (AWST)

**Answer:**

> Nurturing a thriving ecosystem.

**Interpretation:** Care and ecological flourishing are the primary reward. Collection, optimisation, and expansion should be judged by how they contribute to that outcome rather than displacing it.

**Effect:** Establishes the central fantasy and moves the interview to the relationship between passive progression, player responsibility, and ecological consequences.

**Register updates:** U1 resolved; L2 added; U2 narrowed.

### Q2 — Life while the player is away

**Asked:** 2026-08-09T00:22:42+0800 (AWST)

**Question:** You leave Glassgarden alone for a day and return. Which outcome best fits the game: the aquarium only grows while you are away; problems can develop but everything is recoverable; creatures can genuinely become sick or die; or the ecosystem autonomously improves or deteriorates according to how well you prepared it? You can combine these, but where should the consequences stop?

**What this is trying to decide:** Whether nurturing means cosy encouragement, recoverable responsibility, genuine caretaking stakes, or designing a resilient system—and what “idle” permits while the player is absent.

**Evidence basis:** C1, U2, L1, and L2.

**Answer received:** 2026-08-09T00:25:31+0800 (AWST)

**Answer:**

> B and D - The ecosystem autonomously improves or deteriorates according to how well you prepared it.
>
> Think of it almost like a tamagotchi where you need to check in frequently and form an emotional attachment with the game characters, but I also don't want things to deteriorate so much that you come back to a tank full of dead fish.

**Interpretation:** The player prepares rather than freezes the ecosystem. It remains active while they are away, and frequent returns should reveal meaningful consequences. Those consequences create care and attachment, but deterioration must bottom out in recoverable problems rather than catastrophic death caused by absence.

**Effect:** Defines the offline simulation contract and introduces emotional attachment to individual game characters as a core direction. The next question must establish what sort of characters carry that bond.

**Register updates:** C2 added; U2 resolved; U4 added; L3 and L4 added.

### Q3 — Where attachment lives

**Asked:** 2026-08-09T00:25:31+0800 (AWST)

**Question:** Which character model should carry the emotional attachment: a small authored cast of named residents with distinct personalities and ongoing stories; procedurally generated individuals whose traits, relationships, and histories emerge through play; the aquarium community as a whole; or a blend?

**What this is trying to decide:** Whether Glassgarden’s characters require authored narrative, an emergent individual-life simulation, a collective identity, or a deliberate combination.

**Evidence basis:** C1, C2, U4, L2, and L4.

**Answer received:** 2026-08-09T00:31:21+0800 (AWST)

**Answer:**

> B - Procedurally generated individuals whose traits, relationships, and histories emerge through play.
>
> I'd like there to be some aspect of emergent behaviour where systems and individuals can interact in whacky and wonderful ways.
>
> But at the same time, I feel like the player needs more than just looking after a mostly static cast of NPC. We need a sense of progression and growth, as well as challenges that start to naturally emerge as you play (e.g. more fish -> need to clean the tank more often -> start investing in better cleaning solutions).

**Interpretation:** Individual residents should be generated rather than authored, becoming memorable through accumulated traits, relationships, events, and interactions. The broader simulation should produce surprising combinations rather than fixed character scripts. Progress should expand the ecosystem’s complexity, which creates new needs and gives practical meaning to upgrades.

**Effect:** Resolves the attachment model and rejects a mostly static cast. Adds progression as an explicit design frontier, with ecological pressure and player capability expected to grow together.

**Register updates:** U4 resolved; U5 added; L5 and L6 added.

### Q4 — The spine of progression

**Asked:** 2026-08-09T00:31:21+0800 (AWST)

**Question:** When a player looks back after their first week, which change should most clearly prove they have progressed: one tank has become denser and more self-sustaining; they have expanded into larger or multiple specialised habitats; generations of residents have developed lineages and adaptations; or better equipment lets them support complexity that was previously unmanageable? These can reinforce one another, but which is the spine?

**What this is trying to decide:** The primary growth axis that should organise unlocks, escalating pressures, and the player’s sense of advancement.

**Evidence basis:** C1, U5, L2, L5, and L6.

**Answer received:** 2026-08-09T00:38:54+0800 (AWST)

**Answer:**

> I'm not sure. I'd say maybe A or C? It'd be cool to come back and see a bunch of new babies have spawned, maybe some of those babies have developed adaptations due to a problem that occurred while you were away (e.g. leaving the game for a while when you don't have a good cleaning system in place means the newer generation are more likely to get sick, which means they won't grow as big).

**Interpretation:** The choice between ecosystem density and generational change may be false: reproduction grows the tank, while environmental conditions shape the offspring and preserve a history of the player’s care. The exact primary progression spine remains uncertain. Consequences may persist as health or growth differences without becoming catastrophic loss.

**Effect:** Narrows progression to a likely feedback loop between tank conditions, reproduction, and inherited or developmental variation. Exposes resident lifecycle and population turnover as the next material decision.

**Register updates:** U5 narrowed; U6 added; L7 added.

### Interview-control amendment 1 — Option labels

**Received:** 2026-08-09T00:38:54+0800 (AWST)

**Direction:**

> Btw, can you use option letters instead of blank dot-points? It makes it easier to refer to an individual option.

**Effect:** All subsequent bounded options use A, B, C, and D labels.

### Q5 — Generations and attachment

**Asked:** 2026-08-09T00:38:54+0800 (AWST)

**Question:** If generations and individual attachment both matter, what should eventually happen to older residents?

**A.** They never die from age; generations accumulate until the player moves or manages them.

**B.** They have predictable lifespans and eventually die, with enough warning and history to make that meaningful rather than punitive.

**C.** They eventually leave or retire from the active tank instead of dying.

**D.** Generations are partly abstracted, so offspring and adaptations appear without simulating every resident’s full lifecycle.

**What this is trying to decide:** The lifecycle contract needed to support new generations without undermining emotional attachment or filling the tank forever.

**Evidence basis:** C2, U5, U6, L4, L5, and L7.

**Answer received:** 2026-08-09T00:42:57+0800 (AWST)

**Answer:**

> B. It's okay for older fish to die. Maybe there's some sort of "grief" system which makes the direct relatives sad for a little while afterwards, and an upgrade could be to buy a cemetery so fish can visit their dead relatives (which then removes the morale penalty).

**Interpretation:** Natural death is acceptable when it is part of a legible lifecycle rather than a surprise punishment. Kinship persists after death through temporary grief, and progression can provide a place-based response that turns loss into remembrance while relieving its mechanical cost.

**Effect:** Resolves lifecycle turnover and establishes that residents’ relationships can create social pressures with dedicated upgrades. Raises the tonal question of whether these systems are lightly expressive or part of an overtly anthropomorphic society.

**Register updates:** U6 resolved; U7 added; L8 and L9 added.

### Q6 — How human the fish feel

**Asked:** 2026-08-09T00:42:57+0800 (AWST)

**Question:** How anthropomorphic should Glassgarden’s residents be?

**A.** Mostly grounded fish behaviour; emotions and relationships are inferred from movement and habits.

**B.** Expressive animals with recognisable emotions and relationships, but little overtly human behaviour.

**C.** A whimsical fish society with rituals, grudges, celebrations, cemeteries, and other social behaviour.

**D.** A full cartoon civilisation with dialogue, professions, institutions, and character-driven stories.

**What this is trying to decide:** The tonal boundary for the social simulation and how literally ideas such as grief and cemetery visits should appear on screen.

**Evidence basis:** U7, L5, L8, and L9.

**Answer received:** 2026-08-09T00:46:24+0800 (AWST)

**Answer:**

> I feel like somewhere between B and C would be fun. Adding a bit of a social aspect gives you lots to work with when it comes to game mechanics.
>
> Maybe there's some sort of evolution tech tree where you can evolve the fish to unlock social behaviours, or increased reproduction rates, or whatever?

**Interpretation:** Residents should remain recognisably animal-like while supporting selective, overtly whimsical social systems. Social behaviour is not merely decoration; it should create useful mechanical interactions. An evolution tree is a tentative way to turn biological and social development into progression, but the degree of direct player control remains unresolved.

**Effect:** Resolves the tonal range, records the evolution tree as an open candidate rather than a settled feature, and moves the interview to player authority over emergent adaptation.

**Register updates:** A1 added; U7 resolved; U8 added; L10 added.
