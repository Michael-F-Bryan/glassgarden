# Glassgarden direction interview

## Interview state

- **Status:** Active
- **Timezone:** Australia/Perth (AWST, UTC+08:00)
- **Current phase:** Direction interview
- **Purpose:** Establish the game’s central fantasy, core loop, boundaries, and validation target before any specification or implementation.
- **Decision horizon:** Decide what kind of aquarium idle game Glassgarden should become.
- **Authorised output:** This durable interview record only. No game specification, plan, or implementation is authorised yet.

## Source basis

- Michael’s initial direction, received 2026-08-09: an idle game based around some form of aquarium simulation.
- Simon Willison, [“Moonlight & Mayhem (Raccoon Heist by Codex + GPT-5.6 Sol Ultra)”](https://simonwillison.net/2026/Aug/7/moonlight-mayhem/), 2026-08-07: an example of using a coding agent to turn a compact game premise into a complete playable game, including generated visual assets and a preserved transcript.

## Calibrated direction

Glassgarden is an aquarium idle game centred on nurturing a thriving ecosystem and forming emotional attachments to procedurally generated residents. Their traits, relationships, and histories emerge through play, with interacting systems creating surprising behaviour. The ecosystem continues autonomously between frequent check-ins, improving or deteriorating according to the player’s preparation. Problems should remain recoverable rather than allowing absence to produce a tank full of dead fish. Growth should introduce natural pressures—such as a larger population increasing cleaning demand—and give the player better ways to sustain greater complexity. The main progression spine, simulation depth, tone, platform, and scope remain undecided.

## Registers

### Assumptions

_None._

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
| U5 | Main progression spine | Determines what visibly grows, how new pressures emerge, and what upgrades enable. | Michael’s judgement | Open |

### Learnings

| ID | Learning | Evidence |
| --- | --- | --- |
| L1 | The seed concept combines passive progression with a living aquarium. | Michael’s initial direction |
| L2 | Nurturing a thriving ecosystem is the game’s central player fantasy. | Q1 |
| L3 | The aquarium should continue changing autonomously according to how well the player prepared it. | Q2 |
| L4 | Frequent check-ins and emotional attachment to the game’s characters are part of the intended Tamagotchi-like experience. | Q2 |
| L5 | Emotional attachment should arise from procedurally generated individuals whose traits, relationships, and histories emerge through play. | Q3 |
| L6 | Progression should increase ecological complexity and naturally create new maintenance pressures that motivate better solutions. | Q3 |

### Deferred decisions

_None._

## Pending question

### Q4 — The spine of progression

**Asked:** 2026-08-09T00:31:21+0800 (AWST)

**Question:** When a player looks back after their first week, which change should most clearly prove they have progressed: one tank has become denser and more self-sustaining; they have expanded into larger or multiple specialised habitats; generations of residents have developed lineages and adaptations; or better equipment lets them support complexity that was previously unmanageable? These can reinforce one another, but which is the spine?

**What this is trying to decide:** The primary growth axis that should organise unlocks, escalating pressures, and the player’s sense of advancement.

**Evidence basis:** C1, U5, L2, L5, and L6.

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
