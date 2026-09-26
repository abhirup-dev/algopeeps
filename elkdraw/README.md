# ELK draw

ELK draw is an agent-first diagram tool: an MCP server plus CLI that opens a
local Excalidraw canvas, with layout by ELK. This directory is a Bun workspace
(`core`, `backends/*`, `adapters/*`, `app`, `sidecar`, `test/parity`, `eval`);
see `NOTES.md` for the package graph and dependencies, and
`../canvas/docs/agent-layer-design.md` for the design.

```sh
bun install --cwd elkdraw
bun run --cwd elkdraw check   # typecheck (tsc -b), lint, format, test
```

## Quality gates

- CI: `.github/workflows/elkdraw-check.yml` runs `bun install --frozen-lockfile`
  and `bun run check` on pushes and PRs touching `elkdraw/**` (Bun 1.4.2).
- Pre-commit: `.githooks/pre-commit` runs `bun run check` here when `elkdraw/`
  files are staged (and the canvas check when `canvas/` files are staged).
  Hooks are off until you enable them once per clone:

  ```sh
  git config core.hooksPath .githooks
  ```
