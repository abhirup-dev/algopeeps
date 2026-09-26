# Register ELK draw with Claude Code and pi

ELK draw runs beside the Excalidraw MCP tools you already have. Nothing
collides (MCP name, then URL):

- yctimlin `mcp-excalidraw-server`: `excalidraw` if you registered it,
  `http://127.0.0.1:3000`.
- Excalidraw connector: `claude.ai Excalidraw`,
  `https://mcp.excalidraw.com/mcp`.
- canvas (this repo): `canvas`, `http://127.0.0.1:3100/mcp`.
- ELK draw: `elkdraw`, `http://127.0.0.1:3940` (plain) or
  `https://<branch-tail>.elkdraw.localhost:1355` (per branch, portless).

The `excalidraw-skill` drives yctimlin through its CLI (`npx -y
mcp-excalidraw-server <command>`), so it needs no MCP entry at all. ELK draw
tool names (`status`, `add`, `apply`, ...) are namespaced by the host
(`mcp__elkdraw__status` in Claude Code, `elkdraw_status` in pi), so they never
shadow Excalidraw tools.

`<branch-tail>` is the last segment of the branch with dots turned into dashes:
`elkdraw/p0.13-registration-docs` serves at
`https://p0-13-registration-docs.elkdraw.localhost:1355`. See
[Per-branch URLs](../README.md#per-branch-urls).

## 1. Start the server first

Neither transport starts the server. Start it in the worktree you want to
draw in:

```sh
# Per-branch HTTPS URL through portless (builds app/ if stale):
bun run --cwd elkdraw dev --no-open

# Or plain http on 127.0.0.1:3940, detached; prints the status JSON:
bun elkdraw/adapters/cli/src/main.ts start --no-open
```

`start` takes `--url http://127.0.0.1:<port>` for another port. Use `dev`, not
`start`, for the portless URL. Check it with
`bun elkdraw/adapters/cli/src/main.ts status` and stop it with `stop`.

## 2. Claude Code

In the snippets, `ELKDRAW` is the absolute path of the `elkdraw/` directory in
the checkout you run from, for example
`/Users/abhirupdas/Codes/Personal/algopeeps/elkdraw`. Use the full path to
`bun` (`which bun`) if the Claude Code process does not have it on `PATH`.

### Stdio (recommended)

Claude Code spawns the stdio entry, which forwards every call to the running
server. Point `ELKDRAW_URL` at the server:

```sh
# Plain server from `start`:
claude mcp add elkdraw --scope user --transport stdio \
  --env ELKDRAW_URL=http://127.0.0.1:3940 \
  -- bun "$ELKDRAW/adapters/mcp/src/stdio.ts"

# Per-branch server from `dev`:
claude mcp add elkdraw --scope user --transport stdio \
  --env ELKDRAW_URL=https://p0-13-registration-docs.elkdraw.localhost:1355 \
  --env NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem" \
  -- bun "$ELKDRAW/adapters/mcp/src/stdio.ts"
```

Keep the name (`elkdraw`) before `--env`: `--env` takes several values, so a
name after it is read as a malformed variable. Without `ELKDRAW_URL` the stdio
entry uses `http://127.0.0.1:$PORT`, else
`:3940`.

### HTTPS (Streamable HTTP at `/mcp`)

Claude Code talks to the server directly. It must trust portless's CA, so
start Claude Code with `NODE_EXTRA_CA_CERTS` in its environment:

```sh
claude mcp add elkdraw --scope user --transport http \
  https://p0-13-registration-docs.elkdraw.localhost:1355/mcp

export NODE_EXTRA_CA_CERTS=~/.portless/ca.pem   # before `claude`
claude
```

For the plain server the URL is `http://127.0.0.1:3940/mcp` and needs no CA.

### Project scope

`--scope project` writes the same entry to `.mcp.json` at the project root
instead of your user config, so it only applies in that checkout:

```json
{
  "mcpServers": {
    "elkdraw": {
      "type": "stdio",
      "command": "bun",
      "args": ["/abs/path/to/elkdraw/adapters/mcp/src/stdio.ts"],
      "env": {
        "ELKDRAW_URL": "https://p0-13-registration-docs.elkdraw.localhost:1355",
        "NODE_EXTRA_CA_CERTS": "/Users/abhirupdas/.portless/ca.pem"
      }
    }
  }
}
```

Claude Code asks once before it trusts a project `.mcp.json` server. pi also
reads a project `.mcp.json`, so the same file registers both hosts.

## 3. pi (pi-mcp-adapter)

Add an entry under `mcpServers` in `~/.pi/agent/mcp.json` (global) or
`.pi/mcp.json` (project). The fields match `canvas/.mcp.json`.

Stdio:

```json
{
  "mcpServers": {
    "elkdraw": {
      "command": "bun",
      "args": ["/abs/path/to/elkdraw/adapters/mcp/src/stdio.ts"],
      "env": {
        "ELKDRAW_URL": "https://p0-13-registration-docs.elkdraw.localhost:1355",
        "NODE_EXTRA_CA_CERTS": "/Users/abhirupdas/.portless/ca.pem"
      },
      "directTools": true,
      "protocolVersion": "auto"
    }
  }
}
```

HTTP. `caFile` makes the adapter trust portless's CA for this server only:

```json
{
  "mcpServers": {
    "elkdraw": {
      "url": "https://p0-13-registration-docs.elkdraw.localhost:1355/mcp",
      "caFile": "~/.portless/ca.pem",
      "directTools": true,
      "protocolVersion": "auto"
    }
  }
}
```

For the plain server use `"url": "http://127.0.0.1:3940/mcp"` and drop
`caFile`. Leave `lifecycle` at its default (`lazy`): an `eager` server that is
down fails at pi startup.

## 4. Verify

1. `bun elkdraw/adapters/cli/src/main.ts status` (add `--url <server url>` for
   a portless server) prints `{port, url, branch, session, rev, clients}`.
2. Claude Code: `claude mcp list` shows `elkdraw: ... - ✔ Connected` next to
   `claude.ai Excalidraw` (and `excalidraw` if you registered yctimlin). In a
   new session, `/mcp` lists 15 `elkdraw` tools, and the Excalidraw tools are
   unchanged.
3. pi: `/mcp` lists `elkdraw` with 15 tools (`elkdraw_status`, ...).
4. Call `status`. It returns the server's `url` and `branch`; check that it is
   the worktree you meant. Every other tool returns `NOT_IMPLEMENTED` in
   phase 0.

## 5. Troubleshooting

- **`UNREACHABLE` from every tool**: the stdio entry is up but the server is
  not. The message names the URL it tried. Start the server (section 1), or fix
  `ELKDRAW_URL`. `tools/list` still works, so the host shows the tools as
  connected even while the server is down.
- **`self signed certificate in certificate chain`** (inside an `UNREACHABLE`
  message, or as a connect failure for HTTP): the client does not trust
  portless's CA. Node and Bun ignore the macOS trust store. Set
  `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem` in the stdio entry's `env`, in the
  shell that starts Claude Code, or use `caFile` in pi. If TLS still fails, use
  the plain server on `:3940`.
- **Wrong branch in `status`**: another worktree's server holds the port or the
  route. `portless list` shows live routes; `ELKDRAW_URL` picks which one the
  stdio entry forwards to.
- **Port in use**: `start` is a no-op when a server already answers on the URL.
  Pick another with `start --url http://127.0.0.1:<port>` and set `ELKDRAW_URL`
  to match.
