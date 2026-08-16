# Player activity cadence

## Purpose

This document records research and working design hypotheses for how often an active Glassgarden player should have something useful to do. It is not a fixed balance specification. Exact timings and constants should move in response to ordinary-speed fresh-save playtesting.

No credible source found establishes a universal rule that a game needs one player input every five seconds. The research instead supports immediate feedback, worthwhile stimuli, manageable workload, visible progress, and player control over whether to act or wait. Glassgarden should therefore treat five seconds as an opening playtest target for a **useful care opportunity**, not as a compulsory input timer.

## Design judgement

During the first 60–90 seconds, Glassgarden should present roughly one useful care opportunity every four to six seconds without requiring that cadence for survival.

A useful care action changes the tank in a legible way. Examples include:

- dropping food that an interested fish pursues and eats;
- siphoning visible debris or materially improving a dirty patch;
- making a purchase or placement decision that affects the care loop.

An empty siphon sweep, unnecessary food, or a click that only advances a hidden counter does not count. Fish movement, eating, social behaviour, and visible ecological change can hold attention between actions when the player understands what is unfolding.

The opening should move from direct care towards observation and planning:

> act → see a response → understand a consequence → choose what to do next

Frequent clicks without this value chain will produce repetitive labour rather than engagement.

## Research findings

### Response and attention

Nielsen's HCI response-time limits distinguish three useful scales:

- about 0.1 seconds for a response to feel instantaneous;
- about one second before the user's flow of thought is interrupted;
- about ten seconds before attention is likely to move elsewhere.

These limits concern application response, not game-action cadence. They support immediate interface feedback and caution against unexplained ten-second gaps, but they do not prove that a player needs a click every ten seconds.

The GameFlow model similarly calls for immediate action and progress feedback, stimuli worth attending to, clear goals, and a workload appropriate to the player's perceptual and cognitive limits. It explicitly warns against burdening players with tasks that do not feel important.

### Motivation and control

Self-determination research associates game enjoyment and future play with competence and autonomy. Intuitive controls, optimal challenge, choice, and positive informational feedback support those needs. A rigid care schedule that controls the player or punishes brief inattention works against them.

Glassgarden should make active care effective and satisfying while allowing the player to watch, change tabs, or return later without catastrophe.

### Idle-game engagement

Research on idle games treats player attention as a resource and describes a transition from playing to planning. Minimal interaction is not inherently disengaging. Effective idle play combines:

- low-friction direct actions;
- visible acceleration or improvement when the player is active;
- meaningful progress while the player is absent;
- new features and graphical changes that are visibly applied;
- opportunities to optimise before returning to the background.

Recent mixed-methods idle-game research found that players valued quick feedback, active input that visibly increased progress, absence-friendly play, and visible unlocks. It also raised concerns about relying too heavily on rapid reinforcement. That work is preliminary and does not supply a universal interval for player actions.

### Waiting and dead time

Waiting is not automatically bad. It can create anticipation when the player has something relevant to watch or consider. It becomes dead time when the player cannot meaningfully interact, does not know what is happening, lacks control, and has exhausted the available decisions.

A useful practical distinction is therefore:

- **observation:** the fish or tank is doing something legible and worth watching;
- **anticipation:** the player understands what is approaching and can prepare;
- **dead air:** no useful action, visible development, or relevant decision is available.

The cadence targets below constrain dead air, not every period without a click.

### Activity only gains value from progression

Daniel Cook's account of designing the harvesting economy for *Cozy Grove* is directly relevant. Extending individual gathering loops from five seconds to thirty seconds and then five minutes did not make the actions satisfying. They became valuable only when players could connect the gathered resources to crafting, decoration, and self-expression.

For Glassgarden, feeding and siphoning gain value through their consequences:

> food → eating → growth → income and waste → ecological pressure → better care equipment → a larger and more complex society

Cadence cannot compensate for a broken or invisible chain.

## Proposed activity bands

These figures are starting hypotheses for playtesting.

| Stage | Useful care rate | Quiet-period limit | Larger payoff cadence |
| --- | ---: | ---: | ---: |
| First 60–90 seconds | 10–15 actions per minute | No unexplained gap over 8 seconds | Visible change every 15–30 seconds |
| 1½–3 minutes | 8–12 actions per minute | Up to 10 seconds when something is unfolding | Clue, choice, or offer every 30–60 seconds |
| 3–10 minutes | 4–8 actions per minute, often in bursts | 10–20 seconds of legible observation | Upgrade or substantial development every 2–4 minutes |
| After automation | 1–4 interventions per minute while watching | Longer observation and background periods are legitimate | Planning, population, and ecology replace repetitive input |

A useful interpretation of manual workload is:

- fewer than eight useful actions per minute is probably too passive for the opening;
- eight to fifteen is the target active-care band;
- fifteen to twenty for more than a short burst is becoming repetitive;
- more than twenty indicates that richer food or automation is overdue.

These bands should not be applied to later background play as though Glassgarden were an action game.

## Feeding and siphoning rhythm

Feeding should carry most of the opening cadence. Siphoning should be less frequent and more consequential.

Once both actions are available, an initial target is:

- 70–80% feeding actions;
- 20–30% meaningful siphon actions;
- one useful siphon sweep every 30–60 seconds;
- no reward or progression credit for repeatedly sweeping clean gravel.

A representative early-care sequence is:

1. Drop two or three small mouthfuls over 8–15 seconds.
2. Watch the fish pursue and eat them.
3. Notice appetite, growth, sediment, or murk changing.
4. Clean one worthwhile patch.
5. Make a purchase or placement decision.
6. Repeat under slightly changed conditions.

The intended rhythm is a short burst of care followed by a modest, legible pause. It is not a five-second metronome.

## Sinks and faucets model

Glassgarden has several linked resource flows.

| Stock or resource | Faucet | Sink or conversion |
| --- | --- | --- |
| Fish hunger | Time and body mass | Food |
| Food | Player or feeder spending coins | Eating, spoilage, or siphoning |
| Nutrition | Eating | Growth and digestion |
| Waste and pollution | Digestion and spoiled food | Siphon, filter, and natural decay |
| Coins | Passive income from fish mass | Food, fish, equipment, and habitat |
| Player attention | Visible appetite, debris, developments, and choices | Care actions and decisions |

The desired manual workload is a sawtooth rather than a continuously rising line:

1. Population and body mass increase useful manual demand towards 12–15 actions per minute.
2. Richer food or automation reduces that demand to roughly 4–8 actions per minute.
3. Further growth gradually raises it again.
4. The next improvement arrives before the work becomes drudgery.

An upgrade is strongest when it relieves pressure the player has already experienced. Automation offered before repetitive work exists has little meaning; automation offered after prolonged overload arrives too late.

The internal economy can be simulated as sources, pools, converters, and drains, but simulation does not establish whether the resulting activity feels worthwhile. Ordinary-speed browser play remains the authority for cadence.

## Current opening-loop readout

The independently verified fresh-save playthrough on `feature/opening-gameplay` observed three complete feed-and-eat cycles in 48 seconds at 1× speed. That is approximately 3.75 successful feeds per minute, or one every 16 seconds. It is materially better than the previous opening but remains below the proposed active-care band.

The current values explain that result:

- `TUNING.starterHunger` is `0.35`;
- `TUNING.seekFoodAbove` is `0.25`;
- starter-flake nutrition is `0.4`;
- `TUNING.hungerRelievedPerNutrition` is `0.38`;
- one flake therefore relieves `0.4 × 0.38 = 0.152` hunger.

A starter fish eating at `0.35` hunger falls to approximately `0.198`, below the food-seeking threshold. The current starter flake therefore still produces a one-bite meal followed by renewed appetite and travel time. This is implemented through `TUNING` in `src/game/model.ts`, `FOOD_PROFILES` in `src/game/equipment.ts`, and the hunger and eating systems in `src/game/systems.ts`.

The opening coin economy can sustain the proposed action rate:

- income at the initial 1.2 g body mass is approximately `0.346` coins per second, or `20.76` coins per minute;
- twelve manual food drops cost twelve coins per minute;
- the opening therefore retains a positive coin margin before accounting for growth increasing income.

Waste currently appears after four nutrition has been digested. With `0.4`-nutrition flakes, one dropping represents ten eaten flakes. At twelve feed actions per minute, that is approximately 1.2 droppings per minute. This supports occasional meaningful cleaning after debris accumulates, not continuous siphoning.

### Siphon progression risk

`GlassgardenSim.siphonAt` currently increments `care.siphonUses` before checking whether the sweep removed anything. The sponge filter is offered after ten uses through `TUNING.filterOfferedAfterSiphonUses`.

If the activity target encourages empty siphon sweeps every five seconds, a player can manufacture the filter clue in roughly fifty seconds. Future tuning should count effective cleaning—debris removed or a material amount of pollution cleared—rather than raw siphon invocations. The preserved siphon-to-filter clue should remain, but its evidence should be real maintenance work.

## Initial tuning hypotheses

The smallest useful experiment is to create two- or three-mouthful feeding episodes without increasing starvation pressure.

Candidate starting ranges are:

- starter hunger: `0.40–0.45`;
- starter-flake nutrition: `0.18–0.25`;
- two or three accepted mouthfuls before the fish becomes satisfied;
- immediate visual acknowledgement of each food drop;
- visible pursuit beginning within about one second when the fish is interested.

These values are not approved constants. They should be tested as one coherent hypothesis and adjusted from measured fresh-save play rather than copied directly into the game.

The experiment should not:

- raise the global hunger rate merely to create activity;
- move distress or death closer to ordinary care;
- make unused food free or harmless;
- turn the siphon into a progress-counter button;
- require the player to maintain the target cadence after changing tabs.

Provisional progression timing targets are:

- first successful action within five seconds of gaining control;
- first visible growth or development clue within 30–60 seconds;
- meaningful waste and a siphon offer within 90–180 seconds;
- richer food becoming relevant as a second mouth or growing fish makes flakes repetitive;
- the first feeder becoming relevant once three mouths push manual feeding back towards the workload ceiling.

## Playtest measurements

Fresh-save playtests should record:

- time from gaining control to the first successful action;
- rolling useful actions per minute;
- longest interval with no useful affordance or legible development;
- action-to-interface-feedback latency;
- action-to-fish-response latency;
- proportion of feeding and siphon actions that materially change the tank;
- time to first visible growth clue;
- time to meaningful debris, siphon offer, richer food, second fish, and first feeder;
- manual actions per minute at each population and equipment tier;
- whether 30 seconds of deliberate inattention causes danger or merely allows ordinary progression;
- whether short tab changes advance approximately according to wall-clock time at the selected speed.

The target has failed if action frequency rises while actions become less meaningful, if empty clicks advance progression, or if the player must keep clicking to prevent harm.

## Sources

- Jakob Nielsen, “Response Times: The 3 Important Limits”: https://www.nngroup.com/articles/response-times-3-important-limits/
- Penelope Sweetser and Peta Wyeth, “GameFlow: A Model for Evaluating Player Enjoyment in Games”: https://dl.acm.org/doi/10.1145/1077246.1077253
- Richard M. Ryan, C. Scott Rigby, and Andrew Przybylski, “The Motivational Pull of Video Games: A Self-Determination Theory Approach”: https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf
- Sultan A. Alharthi et al., “Playing to Wait: A Taxonomy of Idle Games”: https://dl.acm.org/doi/10.1145/3173574.3174195
- Daeun Hwang, “Player Engagement with Idle Games: A Mixed-Methods Exploration with Design Implications”: https://escholarship.org/content/qt0b07v51w/qt0b07v51w.pdf
- Nina Tepponen, Prabhav Bhatnagar, and Perttu Hämäläinen, “Towards Understanding Waiting in Video Games”: https://research.aalto.fi/files/165781336/Towards_Understanding_Waiting_in_Video_Games.pdf
- Daniel Cook, “Value chains – A method for creating and balancing faucet-and-drain game economies”: https://lostgarden.com/2021/12/12/value-chains/
- Joris Dormans, “Simulating Mechanics to Study Emergence in Games”: https://cdn.aaai.org/ojs/12477/12477-52-16005-1-2-20201228.pdf
