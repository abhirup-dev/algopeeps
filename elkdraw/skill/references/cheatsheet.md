# ELK draw Skill Cheatsheet

## Defaults

- Canvas base URL: `--url <url>`, else `ELKDRAW_URL`, else `http://127.0.0.1:$PORT` (default `http://127.0.0.1:3940`)
- Canvas health: `GET /api/status` or `bun elkdraw/adapters/cli/src/main.ts status`
- No auto-start: run `start --no-open` once; commands against a stopped server exit 3
- Portless URLs (`https://<branch>.elkdraw.localhost:1355`): set `NODE_EXTRA_CA_CERTS=~/.portless/ca.pem`

## CLI Reference

`bun elkdraw/adapters/cli/src/main.ts <command>`, run from the repository root.
JSON results on stdout, always. Diagnostics on stderr. Exit codes: 0 ok, 1 error (server answered non-2xx; its `{"error": {code, message, tool}}` body on stderr), 2 usage or invalid input (nothing was sent), 3 server unreachable or `start` timed out (10 s).

Flags come from each tool's input schema: booleans are `--flag`, numbers `--flag <n>`, string arrays comma-separated (`--ids a,b`), objects and other arrays JSON (`--bbox '{...}'`). camelCase fields are kebab flags (`dryRun` → `--dry-run`). `--input <json|->` gives the whole input object (`-` reads stdin); flags override it. `help [command]` or `<command> --help` lists them.

### Server

| Command             | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `start [--no-open]` | Start the canvas server (detached); prints the status JSON; no-op when running |
| `stop`              | Stop the canvas server                                                         |
| `status`            | `{port, url, branch, session, rev, clients}` (`clients` = open browser tabs)   |

### Elements

| Command                        | Description                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apply --input - < scene.json` | Upsert elements by id, run placement ops, apply patches. Input: `{elements?, place?, patches?, prune?, dryRun?, ifRev?}` (one of `elements`, `place`, `patches` required) |
| `apply --patches '[...]'`      | Patches by id: `{"op":"delete","id":"a"}` (arrows bound to it go too), `{"op":"set","id":"a","label":"New"}`                                                              |
| `apply --dry-run`              | Validate, place and lint; write nothing                                                                                                                                   |
| `apply --if-rev <rev>`         | Fail unless the canvas is at this rev                                                                                                                                     |
| `add --input -`                | Create only, from `{"elements":[...]}`; an existing id is an error                                                                                                        |
| `validate --input -`           | Same input as `apply`: strict schema, placement, then reference check (reads the canvas to resolve ids). Replies `{ok: true, ids}`; writes nothing                        |

### Scene

Not available on this server: `describe`, `get`, `query`, `screenshot`, `export`, `snapshot`, `clear`. Each still has a CLI command and MCP tool (so they show up in `help` and a host's tool list) but every call replies `{"error": {"code": "NOT_IMPLEMENTED", ...}}`, exit 1. `scene.json` is the only source of truth; `look` and `lint` are the only rendered views; `apply --patches` (`delete` per id) is the only way to remove elements.

### Perception

| Command                                                           | Description                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lint [--scope ...] [--ids a,b]`                                  | `{rev, hits: [{code, ids, bbox, severity, hint, suppressed?}]}`                                                                                                                                                                                                                            |
| `look --target <t> [--r px] [--marks] [--max-px n] [--out f.png]` | Crop → `{path, bbox, scale, marks, boxes}`; `<t>` = `<id>`, `<id>,<id>`, `frame:<id>` or `x,y,w,h`; `r` = margin in scene px. `marks` is each id's centre in crop pixels (only with `--marks`; nothing is drawn on the PNG); `boxes` is each target id's rendered box in scene coordinates |
| `changes [--since <rev>]`                                         | `{rev, lines: [{author, time, op, ids, detail?}]}`; `op` = `added\|removed\|moved\|relabelled\|restyled\|reconnected\|applied`; default since your last read                                                                                                                               |
| `diff [--from <rev>] [--to <rev>]`                                | `{changes, lints: {added, fixed}, delta}`; `changes` is `FeedLine` without `author`/`time`; `delta` names the code counts (`+1 node-overlap, -1 crossing`) or `"lint unchanged"`; `from` defaults to the rev before the last agent `apply`, `to` defaults to now                           |
| `wait`                                                            | Not available: `NOT_IMPLEMENTED`                                                                                                                                                                                                                                                           |

### Not available

`describe`, `get`, `query`, `screenshot`, `export`, `snapshot`, `clear`, `wait`: `NOT_IMPLEMENTED` on this server (see Scene above). `arrange` (align, distribute, group, lock, duplicate), `import`, `mermaid`, `share`, `install-skill`: no tool at all — use placement ops and re-apply your file instead.

## MCP Tools

Names are namespaced by the host (`mcp__elkdraw__apply` in Claude Code, `elkdraw_apply` in pi). Inputs are the CLI input objects above.

### Element CRUD

| Tool       | Description                             | Required params                       |
| ---------- | --------------------------------------- | ------------------------------------- |
| `apply`    | Upsert elements, placement ops, patches | one of `elements`, `place`, `patches` |
| `add`      | Create elements                         | `elements[]`                          |
| `validate` | Check input without writing             | as `apply`                            |

### Scene Awareness (Iterative Refinement)

| Tool      | Description                                                          | Required params                                   |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `lint`    | Rendered lint hits with ids, bbox and hint                           | (optional) `scope`, `ids`                         |
| `look`    | Cropped PNG around ids + rendered boxes                              | `target`, (optional) `r`, `marks`, `maxPx`, `out` |
| `changes` | Change feed since a rev                                              | (optional) `since`                                |
| `diff`    | Changes (no author/time) between two revs, lint added/fixed, `delta` | (optional) `from`, `to`                           |

### State

| Tool     | Description                                   | Required params |
| -------- | --------------------------------------------- | --------------- |
| `status` | Server, canvas URL, branch, rev, browser tabs | (none)          |

### Not implemented (present in the tool list, reply `NOT_IMPLEMENTED`)

`get`, `query`, `describe`, `screenshot`, `export`, `snapshot`, `clear`, `wait`.

Notes:

- Labels are `"label": {"text": "..."}` on shapes and arrows; arrow binding is `"start": {"id": "..."}` / `"end": {"id": "..."}`. `text` on a shape and `startElementId`/`endElementId` are rejected, with a hint naming the field to use instead.
- Every element needs an `id`. Re-sending an id updates it; unchanged elements count as `kept`.
- Zones are `"type": "frame"` with `name` and `children` (ids).
- `fontFamily` is Excalidraw's number (`5` Excalifont, `6` Nunito, `8` Comic Shanns) or omitted.
- `allow: [{"rule": "<code>", "why": "..."}]` on an element suppresses one lint code for it; hits come back with `suppressed`.
- Prefer creating shapes first, then arrows, then placement — all in one `apply`.

## Placement and Asset Ops

`place` in the `apply` input, run in order before writing. Placed elements still need `"x": 0, "y": 0` (the op overwrites them). Coordinates are scene px; `at` is the top-left of the first element; `gap` is edge-to-edge.

| Op                                       | Shape                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `row`                                    | `{"op":"row","ids":[...],"at":[x,y],"gap":60}` — left to right, centres on one horizontal line                        |
| `column`                                 | `{"op":"column","ids":[...],"at":[x,y],"gap":80}` — top to bottom, centres on one vertical line                       |
| `grid`                                   | `{"op":"grid","ids":[...],"cols":3,"at":[x,y],"gap":[60,80]}` — row-major                                             |
| `rightOf` / `leftOf` / `below` / `above` | `{"op":"rightOf","id":"a","of":"b","gap":80}` — next to `b`, centres aligned                                          |
| `array`                                  | `{"op":"array","id":"arr","values":[1,3,5],"at":[x,y]}` → cells `arr-0`…, index labels `arr-0-idx`…                   |
| `linkedList`                             | `{"op":"linkedList","id":"ll","values":[...],"at":[x,y]}` → nodes `ll-0`…, arrows `ll-0-1`…                           |
| `tree`                                   | `{"op":"tree","id":"t","keys":[8,4,12],"at":[x,y]}` (inserted as a binary search tree) → nodes `t-8`…, edges `t-8-4`… |
| `stack`                                  | `{"op":"stack","id":"s","frames":["main","f(3)"],"at":[x,y]}` → frames `s-0`… (top last)                              |
| `table`                                  | `{"op":"table","id":"tb","rows":[["a","b"],["1","2"]],"at":[x,y]}` → cells `tb-r0c0`…                                 |
| `hashMap`                                | `{"op":"hashMap","id":"h","buckets":4,"entries":[["k","v"]],"at":[x,y]}` → buckets `h-0`…, entries `h-k`              |

Generated ids can be styled or connected in the same `apply` by listing them in `elements` (fields you give override the generated ones).

## Canvas REST API (HTTP)

| Method | Endpoint            | Description                                                     |
| ------ | ------------------- | --------------------------------------------------------------- |
| `GET`  | `/api/status`       | `{port, url, branch, session, rev, clients}`                    |
| `POST` | `/api/tools/<name>` | Run a tool; body = its input (empty = `{}`); reply = its output |
| `POST` | `/api/shutdown`     | Stop the server                                                 |
| —      | `/mcp`              | MCP Streamable HTTP                                             |

Errors: `{"error": {"code", "message", "tool", "inputSchema?"}}` with status `INVALID_INPUT` 400, `UNKNOWN_TOOL` 404, `NOT_IMPLEMENTED` 501, `INTERNAL` 500.

## Design Guide (quick version)

Stroke/fill pairs: `#e03131`/`#ffc9c9` red, `#2f9e44`/`#b2f2bb` green, `#1971c2`/`#a5d8ff` blue, `#9c36b5`/`#eebefa` purple, `#e8590c`/`#ffd8a8` orange, `#0c8599`/`#99e9f2` cyan, `#868e96`/`#e9ecef` gray.
Styling: `"fillStyle": "solid"` for crisp flat fills (default is sketchy hachure); `"strokeStyle": "dashed"` for zone borders / async arrows; `ellipse` or `diamond` to set stores apart from services.
Sizing: shapes ≥ 120×60 with width ≥ `labelChars * 12`, fonts ≥ 16 (titles ≥ 20), gaps 40–80px (120px+ for labeled arrows), align to a 20px grid.
Order of work: zones (frames) → primary shapes (with `label`) → arrows (bound via ids) → annotations → placement → apply → lint → look → fix.
