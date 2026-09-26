# ELK draw

ELK draw is an agent-first diagram tool: an MCP server plus CLI that opens a
local Excalidraw canvas, with layout by ELK. This directory is a Bun workspace
(`core`, `backends/*`, `adapters/*`, `app`, `sidecar`, `test/parity`, `eval`);
see `NOTES.md` for the package graph and dependencies, and
`../canvas/docs/agent-layer-design.md` for the design. Terms are defined in
[`CONTEXT.md`](CONTEXT.md).

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

## Per-branch URLs

Each worktree serves at its own HTTPS URL through
[portless](https://github.com/vercel-labs/portless), so parallel branches can be
reviewed side by side.

```sh
wt switch --create elkdraw/my-feature   # new worktree + branch
bun install --cwd elkdraw
bun run --cwd elkdraw dev               # builds app/ if stale, then serves
# -> https://my-feature.elkdraw.localhost:1355
```

- URL shape: `https://<prefix>.elkdraw.localhost:<proxy port>`. In a linked
  worktree `<prefix>` is the last segment of the branch, dots turned into dashes
  (`elkdraw/p0.6-portless` becomes `p0-6-portless`); in the main checkout there
  is no prefix. The port is where the portless proxy listens: 1355 when it runs
  as `portless proxy start --port 1355` (here, from a LaunchAgent); the
  `:443` form needs a proxy started with sudo. Branches that share a last
  segment collide; `portless run --force` takes the route over.
- `dev` runs `portless run --name elkdraw bun adapters/server/src/main.ts`.
  portless sets `PORT` (a free port in 4000-4999), `HOST=127.0.0.1`,
  `PORTLESS_URL` and `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`. The server
  listens on `PORT`, reports `PORTLESS_URL` as `url` in `GET /api/status` and
  the `status` tool, and accepts that hostname in its Host/Origin checks. The
  app's status pill shows `<branch> · <state> · <url>`. Extra args pass
  through: `bun run --cwd elkdraw dev --no-open`.
- Without portless on `PATH`, `dev` serves plain `http://127.0.0.1:3940`.
- `portless list` shows live routes; `wt remove` the worktree once the server
  is stopped.

Full registration steps for Claude Code and pi, stdio and HTTP:
[`docs/REGISTER.md`](docs/REGISTER.md). Agent guide:
[`skill/SKILL.md`](skill/SKILL.md).

Registering the MCP server (Streamable HTTP at `/mcp`). Node and Bun clients
do not read the macOS trust store, so give them portless's CA:

```sh
export NODE_EXTRA_CA_CERTS=~/.portless/ca.pem   # in the client's environment
claude mcp add --transport http elkdraw-my-feature \
  https://my-feature.elkdraw.localhost:1355/mcp
```

```json
{
  "mcpServers": {
    "elkdraw-my-feature": {
      "type": "http",
      "url": "https://my-feature.elkdraw.localhost:1355/mcp"
    }
  }
}
```

If TLS gets in the way, use the stdio transport instead (the CLI from P0.3):
the client spawns the process directly, so there is no URL or certificate.

A `wt` post-start hook could run `dev` for every new worktree; project hooks
only run after you approve them once with `wt config approvals add`.
