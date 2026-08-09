---
name: debugging-glassgarden
description: Use when reproducing, diagnosing, playtesting, or adding a regression test for Glassgarden gameplay, browser UI, simulation state, pacing, persistence, away-time, or canvas interaction bugs.
---

# Debugging Glassgarden

Use the repository-owned Playwright harness and the development bridge. Keep setup deterministic, drive player actions through the real UI, and preserve successful reproductions as tests.

## Start here

```bash
pnpm install --frozen-lockfile
pnpm test:e2e
```

If Playwright reports that Chromium is missing, run `pnpm setup:e2e` once. For visible debugging, use `pnpm test:e2e:headed` or add `--debug` to a focused Playwright command.

`pnpm test:e2e` owns an isolated Next server at `127.0.0.1:3100` using `.next-e2e`. Do not start or discover an arbitrary `pnpm dev` server first. Do not patch test URLs to match stray ports.

## Development bridge

Development builds expose `window.__glassgardenDev`; production builds deliberately do not.

| Call | Purpose |
|---|---|
| `snapshot()` | Plain JSON state: tank bounds, fish, entities, water, unlocks, shop, and pending events |
| `reset(seed?)` | Fresh deterministic aquarium |
| `loadScenario(name, seed?)` | Load `fresh`, `dirty-tank`, or `starving-rescuable` |
| `setSpeed(n)` | Pause at `0`, or run up to `16×` |
| `advance(seconds)` | Deterministically advance visible simulation, up to one hour |
| `simulateAway(seconds)` | Exercise real slowed, capped away-time behaviour |

Use Playwright evaluation for setup and observation:

```ts
const state = await page.evaluate(() => window.__glassgardenDev!.loadScenario('dirty-tank', 42))
```

The bridge returns snapshots; do not reach into Miniplex internals, mutate live entities, rewrite `localStorage`, or restore the old `window.__glassgarden` handle.

## Reproduction pattern

1. Write or focus a test in `tests/e2e/debugging.spec.ts`.
2. Load the nearest deterministic scenario and pause with `setSpeed(0)`.
3. Capture a before snapshot and browser console/page errors.
4. Perform feed, siphon, shop, modal, and inspector actions through Playwright locators.
5. For canvas clicks, convert logical coordinates using `snapshot().tank` and the canvas bounding box. Never hardcode viewport-scaled coordinates.
6. Use `advance()` or `simulateAway()` for the relevant time boundary.
7. Assert the player-visible outcome and the resulting snapshot; retain Playwright traces/screenshots on failure.
8. Run the focused test, then `pnpm test:e2e` and the full verification suite.

The existing tests are the canonical examples for scenario loading, logical canvas clicks, away-time simulation, and starvation rescue.

If no scenario reaches the required boundary, add the smallest named scenario in `src/game/devtools.ts`, cover it in `tests/devtools.test.ts`, and use it from the browser test. Do not create a one-off scratchpad script.

## Verification

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

A fix is complete only when the browser reproduction fails before the change, passes after it, and the full checks remain green.
