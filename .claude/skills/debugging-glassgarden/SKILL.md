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

## Prove the harness first

Before writing or running a long browser scenario:

1. Run one existing focused Playwright test to prove the configured server starts and exits cleanly.
2. Confirm the development bridge exists and load one named scenario.
3. Confirm one semantic locator for the interaction under test.
4. Stop at the first structural mismatch and repair the harness assumption. Do not add sleeps, increase timeouts, start another server, or create another script to push past it.

Do not install a second Playwright environment. Run Playwright from the repository so its package and configuration resolve normally.

## Development bridge

Development builds expose `window.__glassgardenDev`; production builds deliberately do not.

| Call | Purpose |
|---|---|
| `snapshot()` | Plain JSON state: tank bounds, fish, entities, water, unlocks, shop, and pending events |
| `reset(seed?)` | Fresh deterministic aquarium |
| `loadScenario(name, seed?)` | Load `fresh`, `growing-tank`, `dirty-tank`, or `starving-rescuable` |
| `setSpeed(n)` | Pause at `0`, or run up to `16×` |
| `advance(seconds)` | Deterministically advance visible simulation, up to one hour |
| `simulateAway(seconds)` | Exercise real slowed, capped away-time behaviour |

Use Playwright evaluation for setup and observation:

```ts
const state = await page.evaluate(() => window.__glassgardenDev!.loadScenario('dirty-tank', 42))
```

The bridge returns snapshots; do not reach into Miniplex internals, mutate live entities, rewrite `localStorage`, or restore the old `window.__glassgarden` handle.

## Reproduction pattern

1. Write or focus the smallest relevant test. Use `tests/e2e/debugging.spec.ts` for reusable gameplay reproductions.
2. Load the nearest deterministic scenario and pause with `setSpeed(0)`.
3. Capture a before snapshot and browser console/page errors.
4. Perform feed, siphon, shop, modal, and inspector actions through semantic Playwright locators. Target the actual interactive element, not a prefix-matching container.
5. For canvas clicks, convert logical coordinates using `snapshot().tank` and the canvas bounding box. Never hardcode viewport-scaled coordinates.
6. Use `advance()` or `simulateAway()` for state transitions and balance measurements. Exercise the changed interaction at normal speed before making a pacing claim.
7. Assert the player-visible outcome and the resulting snapshot; retain Playwright traces/screenshots on failure.
8. Run the focused test. Defer the full gate until the integrated change and its review are complete.

The existing tests are the canonical examples for scenario loading, logical canvas clicks, away-time simulation, and starvation rescue.

If no scenario reaches the required boundary, add the smallest named scenario in `src/game/devtools.ts`, cover it in `tests/devtools.test.ts`, and use it from the browser test. Do not create a one-off scratchpad script.

For keyboard or overlay regressions, cover the escape paths as well as entry: forward and reverse Tab movement, Escape ownership, background inertness, focus restoration after close or unmount, and cancellation of destructive actions. Assert actual focus and interaction, not only ARIA attributes or element presence.

## Verification

During diagnosis and implementation, run only the affected test file or test name. If a suite fails, inspect the raw failure, fix the cause, and rerun the failing selection. Never rerun an unchanged full suite merely to obtain different output.

Run pass/fail commands directly and preserve their real exit codes. Do not pipe verification through `tail`, `head`, or `grep` unless the complete output is captured and `pipefail` preserves the underlying command status.

After implementation and any required fresh-context review are complete, run the full gate once:

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

If the final gate fails, diagnose with the smallest failing command or test, fix it, then rerun the full gate once. A fix is complete only when the browser reproduction fails before the change, passes after it, and the final gate remains green.
