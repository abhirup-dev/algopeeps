# Canvas ↔ agent contract (v1.4)

Deliverable for beads `algopeeps-wks`. This document is the interface between three independently built parts. Anyone building one part must be able to finish against this file alone.

```
 pi agent ──pi-mcp-adapter──▶ canvas MCP server (:3100/mcp) ◀──callServerTool── canvas app (iframe)
                              scene store · events.jsonl                        <Excalidraw/> view+editor
                                       ▲                                              ▲
                                       └──────── ext-apps basic-host (:8080) ─────────┘
```

Packages (Bun workspace under `canvas/`): `shared` (types, element normalisation, assets), `server`, `app`. `basic-host` is run from `ext-apps` unmodified.

## 1. Vocabulary

- **Session** — one whiteboard, keyed by a slug string (`^[a-z0-9][a-z0-9-]{0,63}$`). The server holds one scene per session in memory and on disk.
- **Element** — an Excalidraw element JSON object (as produced by `@excalidraw/excalidraw` 0.18.1). Stored and returned verbatim, plus the `customData` fields below.
- **Agent format** — the input shape agents write in (§4). Looser than an element; the app converts it with `convertToExcalidrawElements` and writes the result back.
- **Owner** — `customData.owner`. Absent or `"human"` = human. `"agent"` = agent. Ownership is decided at creation and never changes.
- **rev** — per-session monotonic integer, incremented on every accepted change in that session. Every element carries its last-changed rev in the server's side table; `canvas_pull` is rev-based. (v1.1: was "server-wide"; per-session is what replay from disk can reconstruct.)

## 2. Ownership and colour

```jsonc
"customData": {
  "owner": "agent",                   // or absent for human
  "kind": "circle" | "counterexample" | "invariant" | "asset" | "free",
  "ref": "<element id this annotation is about>",   // optional
  "asset": { "kind": "array", "name": "nums" }     // optional, present on asset members
}
```

Rules the **server** enforces (v1.2 — ownership is provenance, not a lock):
1. `canvas_draw` / `canvas_annotate` / `canvas_asset` set `owner:"agent"` and `strokeColor:"#9c36b5"`. The caller cannot override owner or colour. Agent elements are **not** locked.
2. (v1.2) Agent tools may update or delete any element, human-owned included. On a human-owned id the server accepts, keeps `owner` as provenance, stamps `customData.editedBy:"agent"`, and logs the event with `detail.humanOwned: true`. Nothing is enforced here any more — "do not edit the learner's elements unless asked" is a tutor rule (`canvas/AGENTS.md`), not a server refusal. (v1.1 refused agent writes to human ids; dropped for the demo.)
3. `canvas_save` (from the app) may change or delete **any** element. When it changes or deletes an agent-owned element the server keeps `owner:"agent"`, adds `customData.editedBy:"human"` (on change), and logs a `human_edit` event naming the ids so the learner model can tell the human's reasoning from the agent's. `rejected` is now only used for malformed elements.
4. Human elements are never recoloured or locked by the server. Nothing is ever locked by the server.

(v1.1 locked agent elements and rejected human edits to them; dropped 2026-09-19 after dogfood: a whiteboard where you cannot move the other party's drawing is not a shared whiteboard.)

## 3. Server tools

All tools take `session` (string). Text results are JSON unless noted. Errors are `isError:true` with a one-line reason.

### Model-visible

| Tool | Input | Result |
|---|---|---|
| `canvas_open` | `{session}` | text: summary line (`session, rev, counts by owner`). `_meta.ui.resourceUri = "ui://algopeeps/canvas.html"`. Idempotent: reopening an existing session does not reset it. |
| `canvas_guide` | `{}` | text: the element cheat-sheet (agent format, colours, camera rules, worked examples). |
| `canvas_read` | `{session, owner?: "human"\|"agent", ids?: string[], bbox?: [x0,y0,x1,y1]}` | `{rev, elements: CompactElement[]}` — see §5. |
| `canvas_describe` | `{session}` | text: `describe.ts` output with `[agent]`/`[human]` tag per line. |
| `canvas_changes` | `{session, since?: number}` | `{rev, human: {added: CompactElement[], changed: CompactElement[], deleted: string[]}}` — human-owned changes with rev > `since`; `since` defaults to the rev of the caller's previous `canvas_read`/`canvas_changes`/`canvas_describe` in this session (server remembers one cursor per session). |
| `canvas_draw` | `{session, elements: AgentElement[]}` | `{rev, ids: string[]}` |
| `canvas_annotate` | `{session, kind: "circle"\|"counterexample"\|"invariant"\|"reply", ref: string, text?: string}` | `{rev, ids}`. `circle`: ellipse around `ref`'s bbox with 12 px padding. `counterexample`: a text box with `text` placed 24 px below `ref`, prefixed `✗ `. `invariant`: text placed 24 px above `ref`, prefixed `⟂ `. `reply` (v1.2): plain `text` 24 px below `ref`, left-aligned, width `max(ref.width, 240)`, fontSize 20, no prefix. All `owner:"agent"`, `kind` set, `ref` set. |
| `canvas_asset` | `{session, kind, x, y, ...params}` (§6) | `{rev, ids, groupId}` |
| `canvas_camera` | `{session, x, y, width, height}` or `{session, fitIds: string[]}` or `{session, fitAll: true}` | `{rev}`; stores a pending camera the app applies once. |
| `canvas_screenshot` | `{session}` | image content block `image/png` when a view answers within 10 s; otherwise `isError` text `no view connected`. |
| `canvas_snapshot` | `{session, name}` | `{rev}`; writes a keyframe event. |

### App-only (`_meta.ui.visibility: ["app"]`)

| Tool | Input | Result |
|---|---|---|
| `canvas_pull` | `{session, since: number}` | `{rev, upserts: Element[], deletes: string[], camera?: Camera & {rev}, screenshot?: {requestId}}` — everything with rev > `since`. `since: 0` returns the full scene. |
| `canvas_save` | `{session, elements: Element[]}` | `{rev, rejected: string[]}`. `elements` is the app's full non-deleted scene. Server diffs by id: new/changed human elements are accepted (compare `version`/`versionNonce`), human ids missing from the payload are deleted, agent-owned changes/deletions are rejected. Elements that came in as agent format and return converted keep their ids and owner. |
| `canvas_screenshot_result` | `{session, requestId, pngBase64}` | `{ok: true}` |

## 4. Agent format (input to `canvas_draw`)

Same as `yctimlin/mcp_excalidraw`'s normaliser so existing prompts and the local `excalidraw-skill` transfer. `shared/normalize.ts` is vendored from there.

```jsonc
{
  "id": "a1",                          // optional; server generates a 12-char id if absent
  "type": "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line" | "freedraw",
  "x": 100, "y": 100, "width": 160, "height": 60,
  "text": "label",                     // on shapes → bound label; on type "text" → the text
  "startElementId": "a0", "endElementId": "a2",   // arrows: auto-routed to element edges
  "points": [[0,0],[100,0]],           // arrows/lines without bindings
  "strokeColor": "#1971c2", "backgroundColor": "#a5d8ff", "fillStyle": "solid",
  "strokeStyle": "solid" | "dashed" | "dotted", "strokeWidth": 2, "roughness": 1,
  "fontSize": 20, "fontFamily": "helvetica",
  "groupIds": ["g1"], "customData": { "note": "anything; owner/kind are overwritten" }
}
```

Server behaviour: normalise (`text`→`label`, `startElementId`→`start:{id}`), stamp owner/colour/lock, assign rev, store. The **app** converts to real elements on pull (`convertToExcalidrawElements(...,{regenerateIds:false})`), applies with `captureUpdate: NEVER`, then `canvas_save`s the converted elements so the store holds full elements.

Coordinates: scene space, origin top-left, y down, CSS px. Agents should keep a 20 px grid and ≥ 40 px gaps.

## 5. CompactElement (what the model reads)

```jsonc
{ "id": "a1", "type": "rectangle", "owner": "human",
  "x": 100, "y": 100, "w": 160, "h": 60,
  "text": "nums[0]",                        // bound label or own text, if any
  "from": "a0", "to": "a2",                 // arrows only: bound element ids
  "group": "g1",                            // first groupId, if any
  "kind": "circle", "ref": "h7",            // agent elements only
  "rev": 42 }
```

Numbers are rounded to integers. Deleted elements are never returned.

## 6. Assets (`canvas_asset`)

All generators live in `shared/assets/`. Each returns `AgentElement[]` sharing one `groupIds:[groupId]`, with `customData.asset = {kind, name}` on every member. Cells are 56×56, gap 0, font 20, `fillStyle:"solid"`. The `owner` parameter (`"agent"` default, or `"human"`) lets a human stamp a template without it being an agent annotation.

| kind | params | layout |
|---|---|---|
| `array` | `name, values: (string\|number)[], pointers?: {label, index}[], showIndex?: true` | cells in a row at `(x,y)`; index labels 18 px below each cell; pointers as small text + up-arrow beneath |
| `linked_list` | `name, values[], doubly?: false` | 96×56 nodes with 40 px gap, arrows between successive nodes; `null` text after the last |
| `binary_tree` | `name, values: (string\|null)[]` (level order, `null` = missing) | ellipses 56×56; level height 96; subtree width halves per level |
| `stack_frames` | `name, frames: {fn, args?, locals?}[]` | 220×72 boxes stacked upward from `(x,y)`; topmost = last frame; left label "call stack" |
| `state_table` | `name, columns: string[], rows: string[][]` | header row + rows, cell 120×40, header `backgroundColor:"#e9ecef"` |
| `hash_map` | `name, entries: {key, value}[], buckets?: number` | bucket column 80×48 with index; entries as `key → value` boxes to the right of their bucket |

## 7. Camera

`Camera = {x, y, width, height}` in scene space (top-left + size of the visible area), or `fitIds` / `fitAll` which the app resolves via `scrollToContent(elements, {fitToContent:true, animate:true})`. The app applies a camera once, keyed by its rev, and never fights the human afterwards.

## 8. Events (`~/.local/share/algopeeps/canvas/<session>/events.jsonl`)

One JSON object per line:

```jsonc
{ "ts": "2026-09-19T07:12:03.412Z", "session": "two-sum", "rev": 42,
  "actor": "agent" | "human" | "system",
  "type": "open" | "draw" | "annotate" | "asset" | "camera" | "human_edit" | "snapshot" | "screenshot" | "keyframe",
  "ids": ["a1"], "detail": { "kind": "circle", "ref": "h7" } }
```

`keyframe` events carry `elements: Element[]` (full scene) and are written on `canvas_snapshot` (with `detail.name`; there is no separate `snapshot` line) and every 50 events. Mutating events additionally embed `elements` (the changed upserts) and `detail.deleted` (ids) so replay = last keyframe + following events without re-deriving anything. (v1.1, matching the server as built.)

## 9. Ports and processes

| Process | Port | Start |
|---|---|---|
| canvas server | 3100 (`/mcp`, Streamable HTTP, stateless) | `bun run --cwd canvas/server dev` |
| basic-host | 8080 (+8081 sandbox) | `canvas/scripts/host.sh` → `SERVERS='["http://127.0.0.1:3100/mcp"]'` |
| pi | — | `cd canvas && pi` (reads `.mcp.json`, `.pi/settings.json`) |

## 10. Out of scope for v1

App-provided tools, push from server to view, multi-user presence, auth, PLAN gate, replay UI, tiered describe. Listed in the plan as P2/P3.

## 11. Comment threads (v1.3, 2026-09-19)

Post-it style threads anchored to the canvas. Either party opens one, both reply, the app renders the thread as a collapsible DOM overlay above the Excalidraw canvas. No locking. Threads live beside elements in the same session store and share the session `rev`.

```
 scene element (anchor)              server thread record                     app overlay (DOM, not Excalidraw)
 ellipse 28×28, owner as usual   ◀──▶ { id, anchorId, status, collapsed,  ──▶ badge (collapsed: "💬 2")
 customData.kind:"comment"            messages:[{id, author, text, ts}] }      card (expanded: thread + reply box)
 customData.threadId                                                            positioned from anchor x,y via appState
```

```jsonc
Thread = { "id": "t_9f2a", "anchorId": "el_...", "status": "open" | "resolved",
           "collapsed": false, "rev": 57,
           "messages": [ { "id": "m1", "author": "human" | "agent", "text": "why does j start at i+1?", "ts": "2026-..." } ] }
```

Tools (all take `session`):

| Tool | Visibility | Input | Result |
|---|---|---|---|
| `canvas_threads` | model | `{status?: "open"\|"resolved"\|"all", since?: number}` | `{rev, threads: Thread[]}`; default `open`. Each thread also carries `anchor: {x,y}` and `near: CompactElement[]` (≤ 8 elements whose bbox is within 160 px of the anchor) so the agent knows what the question points at. |
| `canvas_comment` | model | `{anchorId?: string, x?: number, y?: number, text}` | creates anchor element (owner agent) + thread with one agent message → `{rev, threadId, anchorId}`. |
| `canvas_reply` | model | `{threadId, text}` | appends `{author:"agent"}` → `{rev, messageId}`. |
| `canvas_resolve` | model | `{threadId, resolved?: true}` | flips status → `{rev}`. |
| `canvas_thread_post` | app | `{threadId?, anchorId?, x?, y?, text}` | human path: same as `canvas_comment`/`canvas_reply` with `author:"human"`; creates an anchor when `threadId` and `anchorId` are absent. |
| `canvas_thread_set` | app | `{threadId, collapsed?: boolean, resolved?: boolean}` | UI state; `collapsed` is shared (both views see the same fold). |

`canvas_pull` gains `threads: Thread[]` (those with rev > since) and `threadDeletes: string[]`. Deleting the anchor element (either party, via `canvas_save` or an agent delete) resolves the thread; it is never dropped. Events: `type:"comment"` with `detail.threadId` and `detail.author`; keyframes embed `threads`.

`canvas_changes` gains `threads: {opened: string[], replied: string[]}` for human activity since the cursor, so a polling agent notices new questions in one call.

## 12. Threads sidebar and id-anchored comments (v1.4, 2026-09-19)

Supersedes the anchor ellipse and the floating card of §11. The collaboration layer moves off the drawing: threads live in a docked **sidebar**; the canvas shows only a numbered **badge** per thread, computed from the target elements' bounding box. Nothing new is added to the scene when a comment is created.

```
 canvas (Excalidraw)                       threads sidebar (app DOM, Excalidraw <Sidebar>)
 [2][7][11][15]  ← frame "nums"            ● 1  nums[1]              open
    i ①    j ②                             │  human: why j = i+1?
 ┌──────┐                                  │  agent: what would j = i compare against?
 │ test │ ③                                ● 2  pointer j            open
 └──────┘                                  ○ 3  "test"               resolved
 badge ①②③ = 20 px circle at target bbox    [ Comment on selection ]  [ filter: open|all ]
 top-right; click ↔ selects thread          click ↔ camera fits target (scrollToContent)
```

Data: `Thread.targetIds: string[]` (≥ 1; the selection at creation), `Thread.anchor?: {x,y}` (last known target bbox top-right, refreshed by the app on save, used when all targets are gone → thread shows `detached`). `Thread.anchorId` (v1.3) is kept as `targetIds[0]` for compatibility; no anchor element is created any more. The server sets `customData.threads: string[]` on each target element (append on open, keep on resolve) so agents see thread membership in `canvas_read`.

Tools: `canvas_thread_post {targetIds?: string[], threadId?, text}` replaces `{anchorId?, x?, y?}` (point-anchored comments are removed; a comment always targets ≥ 1 element). `canvas_comment {targetIds, text}` likewise. `canvas_threads` adds `targetIds` and `detached: boolean`. `canvas_thread_set` unchanged (`collapsed` now means "collapsed in the sidebar list"). Everything else in §11 stands.
