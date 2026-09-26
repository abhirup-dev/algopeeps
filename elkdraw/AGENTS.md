# ELK draw: rules for agents

Several agents build ELK draw in parallel, one beads task each. These rules
keep them from colliding. For elkdraw tasks they override the repo-root
`AGENTS.md` / `CLAUDE.md` session-completion steps (no push, no `bd sync`, no
`bd close`). Read `README.md` (running) and `NOTES.md` (package graph,
dependencies, log) next; `CONTRACTS.md` if you touch shared types.

## One task = one branch = one worktree = one URL

| Thing      | Shape (example: task `algopeeps-4c0.3`, title "1.3 Sidecar: measure and snap")   |
| ---------- | -------------------------------------------------------------------------------- |
| Branch     | `elkdraw/p<task number>-<short-slug>` → `elkdraw/p1.3-sidecar-measure`           |
| Worktree   | `~/Codes/Personal/algopeeps.elkdraw-p1.3-sidecar-measure` (worktrunk picks it)   |
| Base       | `abhirup/canvas` (the integration branch), unless the orchestrator names another |
| URL tail   | last branch segment, dots → dashes: `p1-3-sidecar-measure`                       |
| Branch URL | `https://p1-3-sidecar-measure.elkdraw.localhost:1355`                            |

If the orchestrator already gave you a branch and worktree, use them and skip
step 2. All paths below are relative to the worktree root.

## Workflow

```sh
# 1. Read and claim (bd shares one DB across all worktrees)
bd show <id>                      # Owns:, Acceptance:, Parallel:, lane: label
bd update <id> --claim

# 2. Worktree (from any checkout of the repo)
wt switch --create elkdraw/<branch-tail> --base abhirup/canvas --no-cd
cd ~/Codes/Personal/algopeeps.elkdraw-<branch-tail>

# 3. Build: edit only files your task owns (see Ownership)
bun install --cwd elkdraw         # after creating the worktree and after deps change

# 4. Check (must be green; this is what CI runs)
CI=true bun run --cwd elkdraw check          # typecheck, lint, format, unit tests
bun run --cwd elkdraw/<pkg> test:e2e         # if your package has browser tests

# 5. View (if the task has anything to see or call)
bun run --cwd elkdraw dev --no-open          # prints the branch URL; Ctrl-C stops it
export NODE_EXTRA_CA_CERTS=~/.portless/ca.pem
bun elkdraw/adapters/cli/src/main.ts --url https://<url-tail>.elkdraw.localhost:1355 status
curl --cacert ~/.portless/ca.pem https://<url-tail>.elkdraw.localhost:1355/api/status

# 6. Commit on your own branch only
git add <owned paths> && git commit -m "elkdraw/<pkg>: <what> (<task number>)"

# 7. Report to the orchestrator (template below), then stop
```

The orchestrator reviews, merges your branch into the base with `--no-ff`,
and closes the bead. You do not merge, push, rebase other branches or run
`bd close`. `status` must name your branch; if `dev` prints no URL, portless is
missing and it serves `http://127.0.0.1:3940`; say so in the report.

## Ownership

- The bead's `Owns:` line lists your paths. Touch nothing else. The `lane:`
  label (`core`, `app`, `backend-excalidraw`, `backend-drawio`, `cli-mcp`,
  `test`, `eval`, `docs`, `infra`) tells you whose area you are in.
- Need a change outside your paths? Do not make it. Put it in the report under
  "Needs from others" and work around it (stub, local type, skipped test with a
  reason). If you are blocked, stop and report.
- Shared files you may touch only as your task needs, in small additive edits:
  `core/src/index.ts` (re-exports), your package's `package.json` scripts,
  `tsconfig.json` references for a package you own. `NOTES.md`: append your own
  entry under `## Log`; never rewrite others'.
- Never touch: `eslint.config.js`, `.github/`, `.githooks/`, `.beads/`,
  git config, other packages' source, `canvas/`.
- Commit only to your branch. Never commit `.beads/issues.jsonl`; `bd export`
  runs only from the master worktree, by the orchestrator.

## Dependencies

New packages go through the orchestrator: do not `bun add` on a task branch.
Ask in the report (package, version, which workspace package, why, what you
checked). The orchestrator adds it on the base and updates the table in
`NOTES.md`. Moving an `@elkdraw/*` edge means changing three places together
(`package.json`, tsconfig references, `allowedDeps` in `eslint.config.js`),
so it is also an orchestrator change. `bun.lock` conflicts are resolved by
running `bun install` at merge, never by hand.

## Contracts

Types in `core/src/contracts/` (and the generated `core/schemas/`) change only
in a task dedicated to that change. That task adds a line to the `Changelog` in
`CONTRACTS.md` (task number, what changed, what consumers must do), regenerates
schemas with `bun run --cwd elkdraw/core schemas`, and fixes every consumer in
the same branch. Any other task that finds a contract wrong reports it; it does
not edit the contract.

## Lint and types

`eslint.config.js` says it: never edit it to make an error pass; fix the code.

- All rules are errors; `--max-warnings 0`.
- Inline disables only with a reason, one rule at a time:
  `// eslint-disable-next-line <rule> -- why`. Blanket and unused disables fail.
- `JSON.parse` is banned: use `parseJson` / `safeParseJson` from `@elkdraw/core`
  (validates with a zod schema). Validate every boundary input with zod.
- Package seams: import other packages by `@elkdraw/<name>` only, from their
  public entry. No relative `../../core/src` and no deep `@elkdraw/x/...`.
  Allowed edges are in `allowedDeps` (and the graph in `NOTES.md`).
- `no-console` except in `adapters/cli`, `eval`, `scripts`.
- Type-checked strict rules: no floating promises, exhaustive switches,
  `import type` for types, no `as` on object literals.
- Formatting is Prettier only: `bun run --cwd elkdraw format:fix`.

## Tests

- Unit tests: `*.test.ts` next to the code, run by `bun test` inside `check`.
  Fast, no network, no browser, no built `app/dist`.
- Browser tests: `*.e2e.ts`, run only by the package's `test:e2e` script (see
  `app/` and `sidecar/`). Add one when your task drives Chromium.
- Snapshots change only through an update script (e.g.
  `bun run --cwd elkdraw/test/parity update-snapshots`), and the report says
  why. Run `check` with `CI=true` so a missing snapshot fails instead of being
  written silently.
- Tests bind port 0 (a random port) and never a fixed one.

## Ports

Do not bind 3000, 3010, 3020, 3100, 8080, 8081 (other services on this
machine). `dev` gets a port in 4000-4999 from portless; the plain fallback is 3940. Stop your dev server when you are done (Ctrl-C) and never kill processes
you did not start.

## Definition of done

1. The bead's acceptance criteria are met, and you can show how (command,
   test name, URL or screenshot path).
2. `CI=true bun run --cwd elkdraw check` is green; `test:e2e` too if touched.
3. A `NOTES.md` log entry: what landed, facts a later agent needs (versions,
   gotchas, timings), anything deferred.
4. Everything committed on your branch; `git status` clean. Only owned paths
   in the diff: `git diff --stat abhirup/canvas...HEAD`.

## Report to the orchestrator

Keep it short. Paste this, filled in:

```
Task: <id> <title>
Branch: elkdraw/<tail> @ <short sha>   Worktree: <path>
URL: https://<url-tail>.elkdraw.localhost:1355 (or "none: no UI/server change")
Done: <one line per acceptance criterion: met / not met + evidence>
Check: CI=true check green | test:e2e <green/not run: why>
Changed: <paths, from git diff --stat>
Needs from others: <deps, contract changes, edits outside Owns | none>
Notes: <surprises, deferred work, follow-up beads to create | none>
```
