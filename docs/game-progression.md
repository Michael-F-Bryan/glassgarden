# Glassgarden game progression

## Purpose

This document describes how Glassgarden should progress from one vulnerable fish to a stable, multigenerational aquarium society. It records product direction rather than a fixed implementation specification. Exact timings, prices, thresholds, and mechanics should continue to move in response to browser playtesting.

The stable principle is that progression should emerge from ordinary care and environmental choices. The player should see consequences, receive contextual clues, and form their own theory about what caused a development. Glassgarden should not expose a conventional level system or visible technology tree.

## Progression fantasy

The player begins by caring for one fish directly. Growth then creates economic and ecological pressure. The player gradually replaces repetitive labour with imperfect automation, expands the habitat, and becomes responsible for an ecosystem rather than a single animal. Once the aquarium is stable, progression shifts from increasing population to following relationships, generations, rituals, and history.

The broad transition is:

> individual care → automation → ecosystem management → fish society

Each success should change what the player cares about next.

## Implemented opening loop

The current playable loop is:

> feed → growth → waste and pollution → siphon → second fish → breeding → feeder

It already establishes several useful causal relationships:

- Fish mass produces passive coin income.
- Feeding relieves hunger and causes growth.
- Growth increases income, appetite, and waste.
- Waste and spoiled food pollute the surrounding water.
- Pollution causes sickness pressure.
- The siphon converts coins and player attention into cleaner habitat.
- Purchased fish bootstrap the population.
- Increasing fish prices make breeding the eventual population source.
- Healthy mature fish court, lay eggs, and produce varied offspring.
- Closed-page progress is slowed and capped so absence remains recoverable.
- Fatal neglect is possible only while the player is present and after warning.

The opening loop is coherent, but progression currently flattens after the feeder. The siphon and feeder are one-off solutions, breeding happens automatically once conditions are met, and there is no substantial pressure or discovery after the population begins growing.

## Progression phases

These phases are internal design scaffolding, not player-facing levels.

| Population | Player experience | Primary pressure | Development |
| ---: | --- | --- | --- |
| 1–3 | Personally feeding and learning each fish | Hunger and early waste | Growth, siphon, second fish |
| 4–8 | Automating repetitive care | Feeding throughput and pollution | Feeder upgrades and basic filtration |
| 9–12 | Maintaining a breeding ecosystem | Capacity and water stability | Inheritance, filter capacity, stable generations |
| 13–20 | Shaping a small community | Habitat, ecology, and social complexity | Habitat expansion, relationships, schools, ageing |
| 20+ | Improving society rather than adding bodies | Generational turnover and meaning | History, rituals, memorials, deeper ecology |

Fish count should stop being the main progression axis at about twenty residents. Beyond that point, increasing complexity is more valuable than placing more sprites in the same tank.

## Early-game pacing

### Observed problem

The opening progression feels slow, particularly while waiting for early coin thresholds. This is a pacing problem rather than a reason to introduce more punishment. Increasing hunger again would create activity by threatening the fish and would make every automation problem worse.

The first pacing pass should make the early coin faucet stronger without causing mature-tank inflation. A candidate change is:

- Increase baseline income from `0.12` to roughly `0.28` coins per second.
- Leave weight-based income close to its current rate.
- Initially preserve growth, pollution, and hidden unlock thresholds so the effect of the economic change can be judged separately.

This almost doubles starting income but matters progressively less as fish mass becomes the dominant source.

### Intended opening cadence

The opening should produce:

- Immediate feeding and visible response.
- A new observation or decision every one to three minutes during the opening.
- Siphon access within the first few minutes.
- A second fish within one ordinary sitting.
- Breeding as the next intelligible goal rather than a distant accident.

These are experience targets, not fixed timers. The complete progression should be replayed from a fresh save whenever hunger, income, costs, growth, or unlock thresholds materially change.

## Scalable feeding automation

### Current capacity defect

The current feeder relieves `0.38` hunger every eight seconds, equivalent to about `0.048` hunger per second. Three mature fish generate roughly `0.10` hunger per second together. The feeder therefore unlocks at three residents while providing less than half the throughput required by three mature fish.

This is a balance defect, not merely a subjective pacing preference.

### Proposed feeder progression

Replace the boolean feeder with three equipment stages:

| Equipment | Drop interval | Approximate capacity |
| --- | ---: | ---: |
| Drip feeder | 3 seconds | 3–4 mature fish |
| Twin hopper | 1.5 seconds | 7–8 mature fish |
| Rotary feeder | 0.75 seconds | Full 12-fish starter habitat |

Candidate prices are:

- Drip feeder: 250 coins.
- Twin hopper: 650 coins.
- Rotary feeder: 1,500 coins.

These prices are provisional. Throughput boundaries are more important because they are grounded in fish demand.

The feeder should still drop food only when needed. Faster equipment must not scatter unnecessary pellets and turn automation into a pollution generator by accident. Every pellet remains a recurring coin sink, so automation removes repetitive attention without making food free.

### Hidden feeder unlocks

- The drip feeder can continue to appear when the population reaches three residents.
- The twin hopper should appear after the existing feeder repeatedly falls behind demand.
- The rotary feeder should appear when a larger population strains the twin hopper.
- Toasts should describe observable pressure, such as the hopper emptying almost as soon as it turns, rather than exposing fish-count or timing formulas.

The shop may describe equipment as suitable for a small, busy, or full tank. The equipment's purpose should be understandable even when its unlock trigger remains hidden.

### Feeder acceptance criteria

- The drip feeder can hold three healthy mature fish below distress.
- The twin hopper can support roughly seven mature fish.
- The rotary feeder can support the starter habitat's full population.
- Feeding remains a meaningful coin sink.
- Manual feeding remains useful for emergencies and deliberate interaction.

## Filtration and ecological progression

Feeder upgrades solve food throughput. Water quality should become the next limiting system as the population grows.

A sensible maintenance progression is:

- **Siphon:** manually removes physical debris and local pollution.
- **Sponge filter:** slowly removes dispersed pollution but gradually clogs.
- **Larger filter:** handles a medium population without replacing the siphon.
- **Planted biofilter:** converts some waste pressure into plant growth and supports a full habitat.

Filters should buy headroom rather than eliminate care:

- Solid waste still needs occasional siphoning.
- Filters lose effectiveness as they clog.
- Plants absorb dissolved pollution but do not consume piles of debris.
- Natural decay prevents debris entities accumulating forever.
- A neglected tank remains recoverable rather than collapsing without warning.

A useful first mid-game slice is a sponge filter unlocked after repeated manual cleaning or sustained maintenance pressure. The contextual clue should connect the shop development to what the player has been doing.

## Habitat expansion from 12 to 20 residents

The current twelve-resident limit should become the capacity of the starter habitat rather than the final population ceiling.

A healthy tank operating near capacity should quietly unlock a major **Habitat expansion** purchase. It should:

- Increase resident capacity from 12 to about 20.
- Add visible habitat such as plants, rocks, caves, or a deeper section.
- Create enough physical and visual space for twenty residents to remain readable.
- Unlock stronger filtration and social behaviour.
- Mark the transition from a busy aquarium to a small community.

The trigger should require a stable, healthy population rather than twelve purchased fish. Habitat expansion is a capacity valve, not merely a purchase of eight abstract slots. Opening the valve increases food consumption, feeder demand, waste production, filtration load, and social complexity.

A second tank may become useful later, but only after the first tank's society has enough depth to justify it.

## Breeding and inheritance

Purchased fish should bootstrap the population. By the middle game, buying another fish should become prohibitively expensive or cease being useful, and breeding should become the primary population faucet.

The player should influence breeding indirectly:

- Healthy water and adequate space permit courtship.
- Persistent partners and preferred companions emerge.
- Offspring visibly combine parental colours, shapes, and temperaments.
- Multiple generations form recognisable family lines.
- Habitat conditions can subtly shape developing eggs.

The game may expose parents, relationships, and histories after they are discovered, but should not display breeding formulas. Breeding should feel like an outcome of a thriving environment rather than a production queue.

## Fish society

Social progression should begin to matter around fifteen residents. Candidate behaviours include:

- Persistent partners.
- Close companions.
- Recognition of direct relatives.
- Small schools that swim together.
- Young fish following parents.
- Preferred resting places.
- Courtship rituals.
- Solitary, unusually social, or otherwise expressive temperaments.

These behaviours should first make residents legible and memorable. They should not immediately become another efficiency spreadsheet. Bonding does not need to grant a percentage income bonus to justify its existence.

The resident panel can gradually reveal family, relationship, and history information as the player discovers those systems. Mood and hunger emojis should remain quick status cues rather than replacing individual inspection.

## Ageing, death, grief, and memory

Predictable ageing becomes useful only after the tank has multiple generations. Before then, it would mostly punish the player.

- Older residents become visibly slower or otherwise recognisable.
- The player receives substantial contextual warning before natural death.
- Death creates space for descendants and prevents the population freezing permanently at capacity.
- Direct relatives and long-term companions experience temporary grief.
- Grief should change behaviour visibly rather than existing only as a morale number.
- Names, relationships, and histories should survive long enough for death to carry meaning.

A memorial garden or cemetery should appear only after the aquarium has accumulated enough history to need one. It should preserve names, give grieving fish somewhere to visit, and turn grief into a quieter ritual. If it merely charges coins to remove a morale penalty, it becomes a mandatory tax wearing a little stone hat.

Fish death is a population sink, but fish are not ammunition. Ageing exists to create generational turnover and history, not to balance the coin economy.

## Hidden development paths

Candidate hidden paths include:

- Repeated manual feeding → feeder.
- Feeder repeatedly falling behind → faster feeder.
- Repeated siphoning → filter.
- Healthy tank at capacity → habitat expansion.
- Multiple related generations → family and schooling behaviour.
- Repeated interaction with individuals → trust or expressive temperament.
- First meaningful natural death → memorial garden.
- Stable multigenerational population → more elaborate social rituals.

A development toast should announce that something changed and provide contextual clues, but the player should infer the exact cause.

## Sinks, faucets, and valves

Progression should be understood as a set of coupled flows, not merely a list of unlocks.

A **faucet** introduces something into the simulation. A **sink** removes or consumes it. A **valve** controls rate or capacity. Good progression changes these flows and creates a new decision. Bad progression merely adds larger prices.

| Stock | Faucets | Sinks | Valves |
| --- | --- | --- | --- |
| Coins | Baseline income and fish mass | Food, equipment, habitat, memorials | Fish growth and population |
| Hunger | Metabolism over time | Eating food | Feeder throughput |
| Pollution | Waste and spoiled food | Decay, siphoning, filters, plants | Population, fish mass, filtration capacity |
| Population | Purchases, eggs, breeding | Predictable natural death | Habitat capacity and breeding conditions |
| Player attention | Feeding, cleaning, checking individuals | Automation removes repetitive work | Equipment quality |
| History | Births, relationships, close calls, deaths | Should rarely be erased | What the game preserves and presents |

Hunger and pollution are undesirable stocks: their faucets create pressure, while their sinks provide relief. Coins and population are desirable stocks: their faucets reward care, while sinks and valves prevent them becoming meaningless.

### Coupled loops

The central economic loop is:

> feeding → growth → fish mass → coins

The central ecological loop is:

> feeding → digestion → waste → pollution → sickness pressure → maintenance

The automation loop is:

> coins → feeder operation → food → growth

The generational loop is:

> healthy fish → eggs → residents → capacity pressure → ageing and death → open habitat

These loops should overlap. Every upgrade should solve the current bottleneck while exposing the next:

- Feeder solves manual feeding.
- Faster feeder solves population throughput.
- More feeding produces more waste.
- Filter solves dispersed pollution.
- Larger populations overwhelm the first filter.
- Habitat expansion opens capacity.
- More capacity creates social and generational complexity.

A feeder that permanently solves hunger at any population would close the loop too completely. A filter that deletes all pollution without maintenance would make ecology irrelevant.

### Coin economy at 15–20 fish

Passive coin income rises continuously with mass, while one-time equipment purchases are finite. Without new sinks, coins eventually stop mattering.

The mature economy needs both:

- **Operating sinks:** pellets and understandable filtration operation or consumables.
- **Aspirational sinks:** feeder upgrades, filters, habitat expansion, plants, social structures, and memorials.

Operating sinks keep the economy honest. Aspirational sinks create desirable goals. Neither should feel like arbitrary rent. The cause and benefit of expenditure must remain visible.

Relationships, grief, and rituals should not be reduced to currencies merely because they influence progression. Economic sinks should support emotional systems rather than replace them.

### Design questions for every faucet

1. What limits its rate?
2. What new pressure does it create?
3. What can the player meaningfully spend or do in response?

### Design questions for every sink

1. Is its cause visible and understandable?
2. Does it create a choice, or merely charge rent?
3. Does upgrading transform the player's work rather than erase the game?

## Target mature-tank equilibrium

At about twenty residents, the player should have:

- Scalable feeding that consumes money.
- Scalable but imperfect filtration.
- A visibly developed habitat.
- Several generations and recognisable families.
- Occasional births and predictable deaths.
- Relationships, schools, or rituals that make the tank feel inhabited.
- An aquarium that mostly sustains itself but still rewards attention.

The player should spend less time clicking every chore and more time shaping the ecosystem, responding to exceptions, and following individual lives.

## Development sequence

### Now

- Tune the complete opening progression from a fresh save.
- Strengthen the early income floor rather than increasing hunger.
- Correct the feeder's current throughput defect.
- Introduce scalable feeder equipment with recurring pellet costs.

### Next

- Add the sponge-filter slice as the first mid-game ecological upgrade.
- Verify that automation reduces repetitive attention without eliminating decisions.
- Make a healthy full starter habitat unlock expansion towards twenty residents.
- Ensure breeding, rather than repeated purchases, becomes the population source.

### Later

- Persistent relationships, families, and schools.
- Habitat features that influence social and ecological behaviour.
- Predictable ageing and generational turnover.
- Grief, rituals, and a memorial garden.
- Plants and deeper ecological symbiosis.
- Hidden action-developed trust or temperament.
- A second specialised tank only after the first society is sufficiently deep.

### Not yet

- A visible evolution technology tree.
- Additional currencies without a specific systemic purpose.
- Large numbers of species with shallow differences.
- A conventional upgrade ladder detached from aquarium pressure.
- Cemetery mechanics before relationships make death meaningful.
- Unbounded population growth.

## Validation principles

Progression work should be judged in a real browser from both fresh and developed saves.

Check that:

- Care produces visible and attributable change.
- The opening does not contain long periods without a decision.
- Unlocks feel surprising but causally understandable.
- Automation scales to the population tier for which it appears.
- Automation transforms repetitive work into resource and judgement decisions.
- More residents create new ecological and social pressures rather than only more income.
- Recoverable neglect remains possible without absence causing catastrophic loss.
- The aquarium feels more alive and historically distinct as it matures.
- A twenty-resident tank remains visually readable.

Automated balance checks should validate throughput and invariants, but they do not replace repeated browser playtesting of pacing and game feel.
