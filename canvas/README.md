# algopeeps canvas

A shared whiteboard a human and an agent tutor work on together: the human
solves the problem, the agent may only circle mistakes, add counterexamples,
name invariants — never give the answer (rules in [AGENTS.md](AGENTS.md)).
The wire contract between the three parts is [CONTRACT.md](CONTRACT.md).

## Processes and ports

| Process | Port | Start |
|---|---|---|
| canvas MCP server | 3100 | `bun run --cwd canvas/server dev` |
| ext-apps host (UI + sandbox) | 8080 / 8081 | `canvas/scripts/host.sh` |
| pi agent | — | `cd canvas && pi` |

## Run it

    canvas/scripts/dev-all.sh     # server (once WP-B lands) + host, Ctrl-C stops both
    open http://127.0.0.1:8080    # host UI: call canvas_open, pick a session slug
    cd canvas && pi               # agent side, reads .mcp.json

The host is the ext-apps reference host, run from /tmp (outside the repo for
now; WP-E may vendor it).

## Toolchain (WP-H)

Bun is the package manager, script runner, and test runner (`bun install`,
`bun run`, `bun test`); the server also runs on the Bun runtime (`bun src/main.ts`).
Pinned via mise in `canvas/.mise.toml` (`bun = "latest"`, `node = "24"`).

## Quality gate (WP-I)

`bun run check` (typecheck + lint + format + tests) must pass before any commit.
It runs automatically via two hooks, both opt-in:

- **worktrunk**: `.config/wt.toml` has a `pre-commit` hook running `cd canvas && bun run check`.
  Approve it once: `wt config approvals add`.
- **plain git**: enable the checked-in hook with `git config core.hooksPath .githooks`
  (runs `.githooks/pre-commit`, the same command).

CI runs the same gate on push/PR touching `canvas/**` (`.github/workflows/canvas-check.yml`).

## Where things live

- Shared types, assets, normalisation: `shared/src/` (single import: `@algopeeps/canvas-shared`)
- Whiteboard app (rendered in the host iframe): `app/`
- Session events: `~/.local/share/algopeeps/canvas/<session>/events.jsonl`
- Working notes: `NOTES.md`
