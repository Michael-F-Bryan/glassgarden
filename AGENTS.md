<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Glassgarden agent boundaries

## Scope and ownership

- Treat the requested outcome and its explicit numbered items as the implementation boundary. Do not invent follow-up features, unrelated polish, process documents, architecture work, or roadmap items.
- One owner writes shared simulation, runtime, persistence, and UI state. Delegated agents should be read-only reviewers. A write-capable delegated task is permitted only for truly independent work outside those shared boundaries, in an isolated worktree with an explicit non-overlapping file allow-list and a reviewed diff before integration.
- Preserve concurrent and unrelated changes. Do not overwrite, revert, stage, or commit work you do not own.

## Editing and browser work

- Use repository-aware structured edits for ordinary source changes. Do not use ad hoc Python, Perl, or `sed` replacements as a general editing layer.
- For a genuinely mechanical multi-file transform, assert every expected match count, inspect the resulting diff immediately, and run the smallest structural check before continuing.
- Browser work must follow `.claude/skills/debugging-glassgarden/SKILL.md`, the repository Playwright configuration, deterministic development scenarios, and shared E2E helpers. Do not build parallel scratchpad harnesses.

## Git and release discipline

- Before every commit, inspect `git status --short` and the task diff. Stage owned paths explicitly; do not use `git add -A`.
- Use focused checks while iterating. Complete fresh-context review and confirmed fixes before the final full local gate.
- Intermediate checkpoint pushes are recovery points, not release candidates. Do not wait for CI or inspect deployment after each checkpoint unless the task explicitly requires it.
