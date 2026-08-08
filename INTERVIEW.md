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

Glassgarden is an aquarium idle game centred on nurturing a thriving ecosystem and forming emotional attachments to its residents. The ecosystem continues autonomously between frequent check-ins, improving or deteriorating according to the player’s preparation. Problems should remain recoverable rather than allowing absence to produce a tank full of dead fish. The character model, simulation depth, progression, tone, platform, and scope remain undecided.

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
| U4 | Character and attachment model | Determines whether emotional investment comes from authored characters, emergent individuals, or the aquarium community as a whole. | Michael’s judgement | Open |

### Learnings

| ID | Learning | Evidence |
| --- | --- | --- |
| L1 | The seed concept combines passive progression with a living aquarium. | Michael’s initial direction |
| L2 | Nurturing a thriving ecosystem is the game’s central player fantasy. | Q1 |
| L3 | The aquarium should continue changing autonomously according to how well the player prepared it. | Q2 |
| L4 | Frequent check-ins and emotional attachment to the game’s characters are part of the intended Tamagotchi-like experience. | Q2 |

### Deferred decisions

_None._

## Pending question

### Q3 — Where attachment lives

**Asked:** 2026-08-09T00:25:31+0800 (AWST)

**Question:** Which character model should carry the emotional attachment: a small authored cast of named residents with distinct personalities and ongoing stories; procedurally generated individuals whose traits, relationships, and histories emerge through play; the aquarium community as a whole; or a blend?

**What this is trying to decide:** Whether Glassgarden’s characters require authored narrative, an emergent individual-life simulation, a collective identity, or a deliberate combination.

**Evidence basis:** C1, C2, U4, L2, and L4.

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
