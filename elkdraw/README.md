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
