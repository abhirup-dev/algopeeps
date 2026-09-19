# WP-I — lint/format rules that agents cannot skip

Context: `canvas/` is a pnpm workspace (`shared`, `server`, `app`) written by several AI agents in parallel; TypeScript strict is on, nothing else is enforced. A Bun switch (package manager + runner) is queued as WP-H right after this, so pick tooling that works identically under pnpm and Bun. Read `canvas/NOTES.md` and skim the three packages first. Do not touch `canvas/test/`, and do not change runtime behaviour anywhere.

## Part 1 — decide the shape (30 min, write it down first)

Compare **Biome** (single binary, lint + format + import sort, fast, first-class TS/TSX/JSON) against **ESLint 9 flat config + typescript-eslint + Prettier** for this repo. Criteria in order: zero-config-drift across three packages, speed on every save/commit, React 19 + hooks rules for `app/`, type-aware rules that catch what agents actually get wrong (floating promises, unused vars, unsafe `any`, non-exhaustive switch, missing `await`), and one command that fixes what it can. Check current versions on npm and whether Biome's React/hooks and type-aware coverage is sufficient today; if it is not, say so and go ESLint. Write the decision (10 lines, with the two or three rules that decided it) under `## WP-I lint` in `NOTES.md`.

## Part 2 — implement at the workspace root

- One config at `canvas/` shared by all packages; per-package overrides only where React rules apply (`app/`).
- Root scripts: `lint` (check only, exit non-zero), `lint:fix`, `format` (check) and `format:fix`; `bun run check` = typecheck + lint + format check + tests. Wire each package's `package.json` so `bun run --filter '*' lint` also works.
- Rule posture: **errors, not warnings** — agents ignore warnings. Start from the tool's recommended set plus: no floating promises, no unused imports/vars (underscore-prefix exempt), consistent type imports, no `any` except where marked with a one-line justification comment, exhaustive switch on unions, `react-hooks/rules-of-hooks` + `exhaustive-deps` in `app/`. Disable rules that fight the vendored files in `shared/src/{normalize,describe,geometry}.ts` via a file-level override rather than editing them.
- Run `lint:fix` + `format:fix` once across the tree; then fix the remaining errors by hand with minimal edits. `bun run check` must be green at the end. Do not rewrite code for style beyond what the fixer does.

## Part 3 — enforcement so agents cannot skip it

1. `canvas/AGENTS.md`: add a 5-line "Before you say done" block: `bun run check` must pass; never disable a rule inline without a reason comment; never change the config to make an error go away.
2. `.config/wt.toml` (repo root, worktrunk project config): add a `pre-commit` hook `cd canvas && bun run check` with a comment. Note in NOTES that the human must approve it once with `wt config approvals add`.
3. A `.githooks/pre-commit` shell script doing the same for plain `git commit`, plus a root `package.json`-free way to enable it: document `git config core.hooksPath .githooks` in `canvas/README.md`. Do not run that git config command yourself.
4. A GitHub Actions workflow `.github/workflows/canvas-check.yml` running `bun run check` on push/PR touching `canvas/**` (Node 24, Bun). Do not push.

## Done means

`bun run --cwd canvas check` green; the four enforcement points exist; decision + summary under `## WP-I lint` in `NOTES.md`. Do not commit. Reply in the terminal with `WP-I DONE` on its own line.
