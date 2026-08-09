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

## Your mandate

Design and build the strongest first playable you can. Own the full loop: explore the existing code, make product and technical decisions, implement the game, test it, play it in a real browser, inspect the result critically, and keep refining it.

Do not stop after producing a plan, scaffolding, or a technically functional first pass. Do not ask Michael for routine design or implementation decisions. Use your judgement and continue with minimal direction unless you encounter a genuinely blocking credential, an irreversible external action, or a decision that would abandon the stable creative core.

Prefer a coherent, satisfying game loop over broad but shallow feature coverage. Keep the implementation concrete and maintainable; do not build speculative architecture for mechanics that do not yet exist.

## Feedback loop

Repeatedly play from both a fresh start and a developed aquarium. Use browser automation and screenshots where useful. Judge the experience as a player, not only as its implementer:

- Is it obvious what to do without exposing hidden formulas?
- Does care produce visible, attributable change?
- Do growth and new pressures create satisfying reasons to return?
- Are pacing, feedback, controls, and recovery understandable?
- Does the aquarium feel alive rather than like a collection of counters?
- Is the visual presentation coherent and pleasant over an extended browser session?

Fix problems you observe, then play again. Automated checks support this loop; they do not replace it.

## Completion

The run is complete only when:

- the intended care-to-development experience works end to end;
- the game survives repeated browser playtesting from fresh and progressed states;
- playtesting has visibly improved game feel and presentation;
- automated tests, lint, type-checking, and the production static export pass;
- the deployed GitHub Pages build works at `https://michael-f-bryan.github.io/glassgarden/`; and
- Michael can open that URL and reasonably expect to have fun playing it.

Work directly on `main`. Keep coherent changes in tested commits. When the game meets the completion standard, push the finished state, wait for GitHub Actions, verify the live deployment and its assets, and leave a concise handover covering the playable experience, important design decisions, verification evidence, and any honest limitations.
