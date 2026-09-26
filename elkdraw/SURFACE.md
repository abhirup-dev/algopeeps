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

16 tools. `apply`, `add`, `validate`, `lint`, `look`, `diff`, `changes`, `get`,
`describe`, `query`, `screenshot`, `snapshot` and `clear` are real, over the
engines in `@elkdraw/core/engine` (besides `status`). Only `export` (Mermaid,
Phase 2) and `wait` still reject with `NOT_IMPLEMENTED` and echo their input
JSON Schema.

| Tool         | Input (JSON Schema via `z.toJSONSchema`)                                                                                        | Output                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `status`     | `{}`                                                                                                                            | `ServerStatus`                                                           |
| `add`        | `{elements: SkeletonElement[]}`                                                                                                 | `ApplyReply`                                                             |
| `apply`      | `{elements?, place?: PlaceOp[], patches?: ApplyPatch[], prune?, dryRun?, ifRev?}`, one of `elements`/`place`/`patches` required | `ApplyReply`                                                             |
| `validate`   | same as `apply`                                                                                                                 | `{ok: true, ids: Id[]}`                                                  |
| `get`        | `{id}`                                                                                                                          | `{rev, element: SceneElement}`                                           |
| `describe`   | `{scope?}`                                                                                                                      | `{rev, text}`                                                            |
| `query`      | `{type?, ids?, bbox?: Box, limit?}`                                                                                             | `{rev, elements: SceneElement[], truncated}`                             |
| `screenshot` | `{format?: png\|svg, out?, maxPx?}`                                                                                             | `{path, format, width, height}`                                          |
| `export`     | `{format: excalidraw\|obsidian\|mmd\|svg\|png, out?}`                                                                           | `{format, path?, content?}`                                              |
| `snapshot`   | `{action: save\|list\|restore, name?}`                                                                                          | `{rev, snapshots: {name, rev, time}[]}`                                  |
| `clear`      | `{yes: true}`                                                                                                                   | `{rev, deleted}`                                                         |
| `lint`       | `{scope?, ids?}`                                                                                                                | `{rev, hits: LintHit[]}`                                                 |
| `look`       | `{target, r?, marks?, maxPx?, out?}`                                                                                            | `{path, bbox: Box, scale, marks: {id: Point}, boxes: {id: Box}}`         |
| `diff`       | `{from?: rev, to?: rev}`                                                                                                        | `{changes: (FeedLine sans author/time)[], lints: {added, fixed}, delta}` |
| `changes`    | `{since?}`                                                                                                                      | `{rev, lines: FeedLine[]}`                                               |
| `wait`       | `{for?: change\|review, since?, timeoutMs?}`                                                                                    | `{rev, reason: change\|review\|timeout}`                                 |

`ApplyReply`, `ApplyPatch`, `PlaceOp`, `LintHit`, `FeedLine`, `SceneElement`,
`Id`, `Box` and `Point` come from `@elkdraw/core` (CONTRACTS.md).
`SkeletonElement` is the strict schema in `core/skeleton/schema.ts`.

`look`'s `marks` holds each target id's centre in crop pixels (only when
`marks: true` was given; nothing is drawn on the PNG); `boxes` holds each
target id's rendered box in scene coordinates. `diff`'s `from` defaults to the
rev before the last agent `apply` (not the CLI's last invocation); `to`
defaults to now. `validate` reads the live canvas to resolve arrow ends,
frame `children` and patch ids that aren't in the input itself.

`start` and `stop` are CLI-only: an MCP host owns the lifecycle of the server
it talks to. `status` is both a tool (so a host learns which server, branch and
canvas URL it is on) and the CLI command, which reads `GET /api/status`.

As of 1.10c, every tool except `export` and `wait` is real. `describe`'s
`scope` and `query`'s `bbox` filter over the element's own stored box (no
render pass, so no browser tab): a box/zone's `box`, a line's point bounds, a
text's `text.box`. `screenshot` renders headlessly via the sidecar (`look`'s
`snap`, unioned over every element's measured box); `format: "svg"` is not
supported yet and rejects `INVALID_INPUT`. `snapshot` names are kept in
memory only (rev + timestamp; the store's on-disk event format is untouched),
so they do not survive a server restart; `restore` writes the target rev's
elements back through the normal `apply` write path (bumping the store's rev
and appearing in `changes`), never rewinding the log itself. `clear` deletes
every element currently on the canvas in that one write.

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

| yctimlin                   | ELK draw                                              | Kind    | Note                                                                                                     |
| -------------------------- | ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `create_element`           | `add`                                                 | renamed | One skeleton in `elements`                                                                               |
| `batch_create_elements`    | `add`                                                 | renamed |                                                                                                          |
| `update_element`           | `apply` (`set` patch)                                 | renamed | By id; a label edit never changes the id                                                                 |
| `delete_element`           | `apply` (`delete` patch)                              | renamed | Edges touching a deleted node cascade                                                                    |
| `get_element`              | `get`                                                 | renamed | Neutral `SceneElement`, not raw Excalidraw JSON                                                          |
| `query_elements`           | `query`                                               | renamed | `bbox` is a `Box` `{x, y, width, height}`                                                                |
| `describe_scene`           | `describe`                                            | renamed | `scope` narrows it                                                                                       |
| `get_canvas_screenshot`    | `screenshot`                                          | renamed | Rendered headlessly by the sidecar; no browser tab needed. Crops: `look`                                 |
| `export_scene`             | `export`                                              | renamed | `format: excalidraw\|obsidian`                                                                           |
| `export_to_image`          | `export`                                              | renamed | `format: png\|svg`                                                                                       |
| `import_scene`             | `add` / `apply`                                       | renamed | Elements via `add`, `.mmd` via `apply --text`                                                            |
| `create_from_mermaid`      | `apply`                                               | renamed | `.mmd` through ELK layout, not mermaid-to-excalidraw                                                     |
| `snapshot_scene`           | `snapshot` (`action: save`)                           | renamed |                                                                                                          |
| `restore_snapshot`         | `snapshot` (`action: restore`)                        | renamed |                                                                                                          |
| `clear_canvas`             | `clear`                                               | renamed | Needs `yes: true`, like yctimlin's `clear --yes`                                                         |
| `align_elements`           | —                                                     | dropped | Layout owns positions (ELK + placer). Human moves are kept by `apply`                                    |
| `distribute_elements`      | —                                                     | dropped | Same                                                                                                     |
| `group_elements`           | —                                                     | dropped | Zones replace groups (`apply` `move` patch)                                                              |
| `ungroup_elements`         | —                                                     | dropped | Same                                                                                                     |
| `lock_elements`            | —                                                     | dropped | Pins in element meta replace locks (phase 1)                                                             |
| `unlock_elements`          | —                                                     | dropped | Same                                                                                                     |
| `duplicate_elements`       | —                                                     | dropped | Add the nodes again with new ids                                                                         |
| `set_viewport`             | —                                                     | dropped | The agent sees through `look` crops, not a shared camera                                                 |
| `read_diagram_guide`       | —                                                     | dropped | The ELK draw skill ships the guide (P0.13)                                                               |
| `get_resource`             | —                                                     | dropped | No MCP resources in phase 0                                                                              |
| `export_to_excalidraw_url` | —                                                     | dropped | Local only; no upload to excalidraw.com                                                                  |
| —                          | `lint`, `look`, `diff`, `changes`, `wait`, `validate` | new     | Rendered lint, crops, semantic diff with lint delta, change feed, blocking wait, dry-run reference check |

Note (1.11): the `apply` and `import`/`mermaid` rows above describe the
Phase 0 design (`.mmd` text, `{create, update, delete}`). As built (1.10),
`apply` takes `{elements?, place?, patches?, prune?, dryRun?, ifRev?}` (SURFACE
`## Tools` above); `.mmd` text is not accepted (see NOTES.md 1.10, "Mermaid
Conversion" in the skill).

Note (1.10c): `get`, `query`, `describe`, `screenshot`, `snapshot` and `clear`
above are now real, per their rows in `## Tools`. Only `export` (still
Phase 2 Mermaid) and `wait` remain `NOT_IMPLEMENTED`.

### CLI verbs

| yctimlin                       | `elkdraw`                                             | Kind    | Note                                                                 |
| ------------------------------ | ----------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| (no args: MCP stdio)           | `bun elkdraw/adapters/mcp/src/stdio.ts`               | renamed | Separate entry, not the CLI bin                                      |
| `start`                        | `start`                                               | same    | Detached; prints the status JSON; a no-op when the server is running |
| `stop`                         | `stop`                                                | same    |                                                                      |
| `status`                       | `status`                                              | same    | `{port, url, branch, session, rev, clients}`                         |
| `add`                          | `add`                                                 | same    | `--elements '<json>'` or `--input -` for stdin                       |
| `apply`                        | `apply`                                               | same    | Takes `.mmd` or AST patches, not `{create, update, delete}`          |
| `update`                       | `apply` (`set` patch)                                 | renamed |                                                                      |
| `delete`                       | `apply` (`delete` patch)                              | renamed |                                                                      |
| `get`                          | `get --id`                                            | same    |                                                                      |
| `query`                        | `query`                                               | same    | `--bbox '{"x":0,"y":0,"width":9,"height":9}'`, not `x0,y0,x1,y1`     |
| `describe`                     | `describe`                                            | same    | JSON `{rev, text}`, not plain text                                   |
| `screenshot`                   | `screenshot`                                          | same    | Headless; never needs a browser tab (no exit 4)                      |
| `export`                       | `export --format`                                     | same    | Adds `mmd`, `svg`, `png`                                             |
| `import`                       | `add` / `apply`                                       | renamed |                                                                      |
| `mermaid`                      | `apply --text`                                        | renamed |                                                                      |
| `snapshot save\|list\|restore` | `snapshot --action`                                   | same    |                                                                      |
| `arrange …`                    | —                                                     | dropped | See the align/group/lock/duplicate rows above                        |
| `share`                        | —                                                     | dropped | Local only                                                           |
| `clear --yes`                  | `clear --yes`                                         | same    |                                                                      |
| `install-skill`                | —                                                     | dropped | Deferred to the skill task (P0.13)                                   |
| —                              | `lint`, `look`, `diff`, `changes`, `wait`, `validate` | new     |                                                                      |

snake_case aliases (`--compat yctimlin`, agent-native-diagramming.md §1a) are
deferred: yctimlin's skill and evals would need argument translation too, not
just names.

Note (1.11): `get`, `query`, `describe`, `screenshot`, `export`, `snapshot`
and `clear` above are listed as `same`, but as built (1.10) every one of them
still replied `NOT_IMPLEMENTED` (`## Tools` above); only `add`, `apply`,
`validate`, `lint`, `look`, `diff` and `changes` (besides `status`) were real.

Note (1.10c): `get`, `query`, `describe`, `screenshot`, `snapshot` and `clear`
are now real too. Only `export` (Mermaid, Phase 2) is still
`NOT_IMPLEMENTED`.

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
