# ELK draw surface

The MCP tools, the `elkdraw` CLI and the REST contract between the CLI and the
server. The source of truth is `adapters/mcp/src/tools.ts`: one zod input and
output schema per tool. The MCP server, the REST route (`dispatch`) and the CLI
flags are all derived from it.

yctimlin's `mcp-excalidraw-server` 2.0.0 is the reference (26 MCP tools, 20 CLI
verbs, read from the npm tarball). ELK draw keeps its CLI verbs where the
meaning carries over, so the two run side by side (`:3000` for yctimlin,
`:3940` for ELK draw).

## Tools

| Tool         | Input (JSON Schema via `z.toJSONSchema`)                                        | Output                                         |
| ------------ | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| `status`     | `{}`                                                                            | `ServerStatus`                                 |
| `add`        | `{elements: Skeleton[]}`                                                        | `ApplyReply`                                   |
| `apply`      | `{text?: .mmd, patches?: AstPatch[], dryRun?, force?, ifRev?}`, text or patches | `ApplyReply`                                   |
| `get`        | `{id}`                                                                          | `{rev, element: SceneElement}`                 |
| `describe`   | `{scope?}`                                                                      | `{rev, text}`                                  |
| `query`      | `{type?, ids?, bbox?: Box, limit?}`                                             | `{rev, elements: SceneElement[], truncated}`   |
| `screenshot` | `{format?: png\|svg, out?, maxPx?}`                                             | `{path, format, width, height}`                |
| `export`     | `{format: excalidraw\|obsidian\|mmd\|svg\|png, out?}`                           | `{format, path?, content?}`                    |
| `snapshot`   | `{action: save\|list\|restore, name?}`                                          | `{rev, snapshots: {name, rev, time}[]}`        |
| `clear`      | `{yes: true}`                                                                   | `{rev, deleted}`                               |
| `lint`       | `{scope?, ids?}`                                                                | `{rev, hits: LintHit[]}`                       |
| `look`       | `{target, r?, marks?, maxPx?, out?}`                                            | `{path, bbox: Box, scale, marks: {id: Point}}` |
| `diff`       | `{from?, to?}` (rev or `.mmd` path)                                             | `{changes: FeedLine[], lints: {added, fixed}}` |
| `changes`    | `{since?}`                                                                      | `{rev, lines: FeedLine[]}`                     |
| `wait`       | `{for?: change\|review, since?, timeoutMs?}`                                    | `{rev, reason: change\|review\|timeout}`       |

`ApplyReply`, `AstPatch`, `LintHit`, `FeedLine`, `SceneElement`, `Box` and
`Point` come from `@elkdraw/core` (CONTRACTS.md). `Skeleton` is loose
(`{type, id?, ...}`) until the phase 1 skeleton schema lands.

`start` and `stop` are CLI-only: an MCP host owns the lifecycle of the server
it talks to. `status` is both a tool (so a host learns which server, branch and
canvas URL it is on) and the CLI command, which reads `GET /api/status`.

In phase 0 only `status` is real. Every other tool rejects with
`NOT_IMPLEMENTED` and echoes its input JSON Schema.

Transports:

- Streamable HTTP at `/mcp` on the server.
- stdio via `bun elkdraw/adapters/mcp/src/stdio.ts`. It forwards every call to
  `POST /api/tools/<name>` on the running server (base URL as for the CLI), so
  it sees the same scene. It does not start the server; when the server is
  down, calls fail with `UNREACHABLE`. For portless https URLs, set
  `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem` (Bun's fetch reads it).

## Mapping from yctimlin

Kinds:

- **same**: same verb, same intent.
- **renamed**: covered by a differently named ELK draw tool.
- **new**: not in yctimlin.
- **dropped**: no equivalent, with the reason given.

### MCP tools

| yctimlin                   | ELK draw                                  | Kind    | Note                                                                            |
| -------------------------- | ----------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `create_element`           | `add`                                     | renamed | One skeleton in `elements`                                                      |
| `batch_create_elements`    | `add`                                     | renamed |                                                                                 |
| `update_element`           | `apply` (`set` patch)                     | renamed | By id; a label edit never changes the id                                        |
| `delete_element`           | `apply` (`delete` patch)                  | renamed | Edges touching a deleted node cascade                                           |
| `get_element`              | `get`                                     | renamed | Neutral `SceneElement`, not raw Excalidraw JSON                                 |
| `query_elements`           | `query`                                   | renamed | `bbox` is a `Box` `{x, y, width, height}`                                       |
| `describe_scene`           | `describe`                                | renamed | `scope` narrows it                                                              |
| `get_canvas_screenshot`    | `screenshot`                              | renamed | Rendered headlessly by the sidecar; no browser tab needed. Crops: `look`        |
| `export_scene`             | `export`                                  | renamed | `format: excalidraw\|obsidian`                                                  |
| `export_to_image`          | `export`                                  | renamed | `format: png\|svg`                                                              |
| `import_scene`             | `add` / `apply`                           | renamed | Elements via `add`, `.mmd` via `apply --text`                                   |
| `create_from_mermaid`      | `apply`                                   | renamed | `.mmd` through ELK layout, not mermaid-to-excalidraw                            |
| `snapshot_scene`           | `snapshot` (`action: save`)               | renamed |                                                                                 |
| `restore_snapshot`         | `snapshot` (`action: restore`)            | renamed |                                                                                 |
| `clear_canvas`             | `clear`                                   | renamed | Needs `yes: true`, like yctimlin's `clear --yes`                                |
| `align_elements`           | —                                         | dropped | Layout owns positions (ELK + placer). Human moves are kept by `apply`           |
| `distribute_elements`      | —                                         | dropped | Same                                                                            |
| `group_elements`           | —                                         | dropped | Zones replace groups (`apply` `move` patch)                                     |
| `ungroup_elements`         | —                                         | dropped | Same                                                                            |
| `lock_elements`            | —                                         | dropped | Pins in element meta replace locks (phase 1)                                    |
| `unlock_elements`          | —                                         | dropped | Same                                                                            |
| `duplicate_elements`       | —                                         | dropped | Add the nodes again with new ids                                                |
| `set_viewport`             | —                                         | dropped | The agent sees through `look` crops, not a shared camera                        |
| `read_diagram_guide`       | —                                         | dropped | The ELK draw skill ships the guide (P0.13)                                      |
| `get_resource`             | —                                         | dropped | No MCP resources in phase 0                                                     |
| `export_to_excalidraw_url` | —                                         | dropped | Local only; no upload to excalidraw.com                                         |
| —                          | `lint`, `look`, `diff`, `changes`, `wait` | new     | Rendered lint, crops, semantic diff with lint delta, change feed, blocking wait |

### CLI verbs

| yctimlin                       | `elkdraw`                                 | Kind    | Note                                                                 |
| ------------------------------ | ----------------------------------------- | ------- | -------------------------------------------------------------------- |
| (no args: MCP stdio)           | `bun elkdraw/adapters/mcp/src/stdio.ts`   | renamed | Separate entry, not the CLI bin                                      |
| `start`                        | `start`                                   | same    | Detached; prints the status JSON; a no-op when the server is running |
| `stop`                         | `stop`                                    | same    |                                                                      |
| `status`                       | `status`                                  | same    | `{port, url, branch, session, rev, clients}`                         |
| `add`                          | `add`                                     | same    | `--elements '<json>'` or `--input -` for stdin                       |
| `apply`                        | `apply`                                   | same    | Takes `.mmd` or AST patches, not `{create, update, delete}`          |
| `update`                       | `apply` (`set` patch)                     | renamed |                                                                      |
| `delete`                       | `apply` (`delete` patch)                  | renamed |                                                                      |
| `get`                          | `get --id`                                | same    |                                                                      |
| `query`                        | `query`                                   | same    | `--bbox '{"x":0,"y":0,"width":9,"height":9}'`, not `x0,y0,x1,y1`     |
| `describe`                     | `describe`                                | same    | JSON `{rev, text}`, not plain text                                   |
| `screenshot`                   | `screenshot`                              | same    | Headless; never needs a browser tab (no exit 4)                      |
| `export`                       | `export --format`                         | same    | Adds `mmd`, `svg`, `png`                                             |
| `import`                       | `add` / `apply`                           | renamed |                                                                      |
| `mermaid`                      | `apply --text`                            | renamed |                                                                      |
| `snapshot save\|list\|restore` | `snapshot --action`                       | same    |                                                                      |
| `arrange …`                    | —                                         | dropped | See the align/group/lock/duplicate rows above                        |
| `share`                        | —                                         | dropped | Local only                                                           |
| `clear --yes`                  | `clear --yes`                             | same    |                                                                      |
| `install-skill`                | —                                         | dropped | Deferred to the skill task (P0.13)                                   |
| —                              | `lint`, `look`, `diff`, `changes`, `wait` | new     |                                                                      |

snake_case aliases (`--compat yctimlin`, agent-native-diagramming.md §1a) are
deferred: yctimlin's skill and evals would need argument translation too, not
just names.

## CLI

- One command per tool. The flags are derived from the tool's input JSON
  Schema:
  - booleans become `--flag`;
  - numbers become `--flag <n>`;
  - string arrays are comma-separated;
  - objects and other arrays are JSON.
- camelCase fields become kebab flags (`dryRun` → `--dry-run`).
- `--input <json|->` gives the whole input object, and flags override it.
- The assembled object is validated by the same zod schema before any request.
- Results are JSON on stdout; errors go to stderr.
- Run it as `bun elkdraw/adapters/cli/src/main.ts <command>`. The package
  declares an `elkdraw` bin, but Bun does not link workspace bins at the root.

| Exit | Meaning                                         |
| ---- | ----------------------------------------------- |
| 0    | ok                                              |
| 1    | the server answered non-2xx (body on stderr)    |
| 2    | usage error or invalid input (nothing was sent) |
| 3    | server unreachable, or `start` timed out (10 s) |

The base URL is resolved in this order:

1. `--url`;
2. `$ELKDRAW_URL`;
3. `http://127.0.0.1:$PORT`;
4. `http://127.0.0.1:3940`.

`start [--no-open]` spawns `bun elkdraw/adapters/server/src/main.ts` detached,
with `PORT` set from the URL's port. It then polls `GET /api/status`.

## REST contract (server lane implements)

JSON in and out, on `127.0.0.1`. The port comes from `$PORT` and defaults to
**3940**. It must not collide with 3000, 3100, 8080 or 8081.

| Route                    | Body                           | 200 reply                                                                 | Errors                                               |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/status`        | —                              | `ServerStatus`                                                            | —                                                    |
| `POST /api/shutdown`     | —                              | `{"ok": true}`, then exits                                                | —                                                    |
| `POST /api/tools/<name>` | tool input (empty body = `{}`) | tool output                                                               | `{"error": ToolErrorBody}`, status from `httpStatus` |
| `/mcp`                   | MCP Streamable HTTP            | `createMcpServer(handlers)` on `WebStandardStreamableHTTPServerTransport` | —                                                    |

The schemas are exported from `@elkdraw/mcp`:

```ts
ServerStatus = {
  port: int, // the port the server listens on
  url: string, // the browser canvas URL (portless URL when set up, else http://127.0.0.1:<port>)
  branch: string, // git branch of the worktree the server runs from
  session: string, // the canvas session id
  rev: int, // current scene rev
  clients: int, // connected browser tabs (WebSocket clients)
};
ToolErrorBody = {
  code: "INVALID_INPUT" | "UNKNOWN_TOOL" | "NOT_IMPLEMENTED" | "INTERNAL" | "UNREACHABLE",
  message: string,
  tool: string,
  inputSchema?: object,
};
httpStatus = {
  INVALID_INPUT: 400, // bad input, or a body that is not JSON
  UNKNOWN_TOOL: 404,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500, // any other error, e.g. a handler output failing its schema
  UNREACHABLE: 503, // client-side only (stdio forwarding); the server never sends it
};
```

The route is implemented in `adapters/server/src/server.ts`: `dispatch` from
`@elkdraw/mcp` plus this mapping. `dispatch` validates the input, fills gaps
with `stubHandlers`, and validates the handler's output against the tool's
output schema.
