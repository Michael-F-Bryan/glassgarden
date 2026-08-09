# Claude Code kickoff prompt

You are taking ownership of building **Glassgarden** into a genuinely playable and enjoyable aquarium idle game.

Start by reading the repository, especially:

- `docs/INTERVIEW.md`
- `docs/FIRST-PLAYABLE-INTERVIEW.md`
- the existing application, tests, and GitHub Pages workflow

The interviews are a creative handoff, not an implementation specification. Preserve the stable core:

- an aquarium idle game centred on nurturing a living ecosystem;
- ordinary care causing hidden, action-driven growth and evolution;
- developments that are surprising but understandable from contextual clues.

The concrete feeding, growth, waste, pollution, economy, population, and breeding ideas are a strong starting point. Adapt, simplify, replace, or extend specific mechanics when doing so produces a more coherent and enjoyable game.

Keep these product boundaries stable while adapting the mechanics: the first playable is desktop-first; away-time progress must stay slowed, capped, or otherwise recoverable so absence cannot cause catastrophic loss; fatal neglect may occur only while the player is present, after clear warning and continued neglect; and prove one complete care-to-visible-development path before investing in later lifecycle, social, or content breadth. Mechanics and progression around those boundaries remain adaptable.

Use a proper entity–component–system (ECS) architecture for the simulation and game logic rather than accumulating ad hoc state and behaviour in UI components. The ECS should own entities, component data, and systems; presentation should observe it and issue player intents. Choose a suitable TypeScript ECS implementation and concrete component/system boundaries based on the game as it develops—do not build a generic engine beyond Glassgarden’s actual needs.

## Visual assets

You have confirmed access on this workstation to OpenAI image generation through the Hermes tools MCP server. In Claude Code the tool is `mcp__hermes-tools__image_generate`. Use it when custom textures, sprites, visual references, or source artwork would materially improve the game; do not stop or ask Michael merely because artwork is needed.

Treat generated images as candidates, not production-ready assets. Copy accepted outputs into the repository because provider URLs and Hermes cache paths are not durable project storage. Verify actual dimensions, alpha transparency, cropping, edge quality, web optimisation, and appearance at in-game scale. For tiled textures, test the real edges for visible seams rather than trusting “seamless” in a prompt. Build coherent families from selected references and deterministic variations instead of accumulating unrelated generations.

Record provenance for every accepted asset: for generated art, the generation source/model and prompt or equivalent reproducible source metadata; for non-generated art, its licence and canonical source; and for procedural art, its repository-owned source. Do not commit temporary or cache files, or reference them or provider URLs from runtime code.

The MCP boundary owns authentication. Never inspect, print, copy, or commit its credentials. If the tool is unavailable or a generation fails, continue with procedural artwork or clearly licensed assets and recorded provenance rather than blocking the build or shipping unexplained third-party art.

## Your mandate

Design and build the strongest first playable you can. Own the full loop: explore the existing code, make product and technical decisions, implement the game, test it, play it in a real browser, inspect the result critically, and keep refining it.

Do not stop after producing a plan, scaffolding, or a technically functional first pass. Do not ask Michael for routine design or implementation decisions. Use your judgement and continue with minimal direction unless you encounter a genuinely blocking credential, an irreversible external action, or a decision that would abandon the stable creative core.

Prefer a coherent, satisfying game loop over broad but shallow feature coverage. Keep the implementation concrete and maintainable; do not build speculative architecture for mechanics that do not yet exist.

## Coordination and refinement

Act as the coordinator, decision-maker, and final integrator. Use sub-agents selectively for bounded work that benefits from isolated context or independent judgement, such as gameplay and pacing critique, visual/UX review, technical investigation, test review, or a fresh browser playtest. Do not delegate merely to create activity, and keep shared-state implementation under one owner.

At meaningful playable milestones, obtain fresh-context critiques of gameplay, visual presentation, and technical quality. Verify findings against the actual game, explicitly accept or reject them, repair material problems, then play again. Separate making from judging so defect checklists do not flatten the creative work.

If an approach or delegated task fails, inspect its artefacts and evidence, identify the root cause, change the smallest relevant decision or instruction, and rerun the smallest useful test. Refine worker prompts when evidence shows their boundary or context was wrong; do not accumulate orchestration or prompt rules in response to isolated failures.

## Feedback loop

Before substantive game implementation, run the development server locally and verify or establish a working headless-browser capability against it. This browser path is non-waivable: use it for interaction, console, rendered DOM, and screenshot checks. If it cannot be established, treat that as a genuine blocker; do not silently waive it or imply that browser evidence exists. Repeatedly play from both a fresh start and a developed aquarium. Judge the experience as a player, not only as its implementer:

- Is it obvious what to do without exposing hidden formulas?
- Does care produce visible, attributable change?
- Do growth and new pressures create satisfying reasons to return?
- Are pacing, feedback, controls, and recovery understandable?
- Does the aquarium feel alive rather than like a collection of counters?
- Is the visual presentation coherent and pleasant over an extended browser session?

Fix problems you observe, then play again. Automated checks support this loop; they do not replace it.

Do not wait for GitHub Actions or GitHub Pages between development milestones, and do not use the deployed site as the iterative test environment. Validate locally, checkpoint the work, then continue.

## Completion

The run is complete only when:

- the complete care-to-visible-development causal slice passes fresh-start and progressed-state browser playtests;
- no unresolved material gameplay, UX, visual, or technical defect remains;
- one final fresh-context critique finds no unresolved material issue;
- automated tests, lint, type-checking, and the production static export pass;
- the exact deployed URL `https://michael-f-bryan.github.io/glassgarden/` returns successfully, representative JavaScript, CSS, and image assets resolve under `/glassgarden/`, and the deployed gameplay flow is exercised; and
- the final handover reports evidence supporting likely enjoyment and honest limitations, treating fun as subjective rather than claiming that Michael’s enjoyment has been proven.

Work directly on `main`. After each significant feature or coherent milestone, run the relevant local checks, commit the tested change, and push it to GitHub as a durable checkpoint. Continue working immediately against the local development server; ordinary checkpoint pushes do not require waiting for CI or Pages deployment.

When the game meets the completion standard, run the full local validation suite, commit and push the finished state, then wait for GitHub Actions once and verify the live deployment and its assets. Leave a concise handover covering the playable experience, important design decisions, verification evidence, and any honest limitations.
