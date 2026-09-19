# WP-L plan — comment threads, server side (CONTRACT §11)

Working plan. Nothing in `server/`/`shared/` is edited until `## WP-J unlock` lands in
`canvas/NOTES.md` (WP-J is mid-flight: store.ts/server.ts already read v1.2, tests/smoke/NOTES
still v1.1). All line refs below are against the pre-WP-J tree and may shift.

## Types — `shared/src/types.ts`

```ts
export interface ThreadMessage { id: string; author: Owner; text: string; ts: string }
export interface Thread {
  id: string; anchorId: string; status: "open" | "resolved";
  collapsed: boolean; rev: number; messages: ThreadMessage[];
}
```

- `AgentKind` += `"comment"` (anchor `customData.kind`), so `toCompact` reports anchors as `kind:"comment"`.
- `CanvasEventType` += `"comment"`.
- `CanvasEvent` += `threads?: Thread[]` — mutating thread events embed the whole changed thread
  (same trick as `elements`); keyframes embed all threads. Replay = last keyframe + following events.
- Thread id `t_` + 6 chars: `t_${newId().slice(0,6)}` (no new helper). Message id `m${n}` = index in
  `messages` at append; stable under replay because events carry the whole thread.

## Store — `server/src/store.ts`

State: `threads: Map<string, Thread>` plus `threadAct: Map<string, {opened:{rev,author}, replies:{rev,author}[]}>`
(needed for `canvas_changes.threads`; rebuilt on replay from comment-event order).

New methods (dedicated, not routed through `draw()`, so event actor/type stay honest):

- `openThread(s, {anchorId?, x?, y?, text, author})` — if `anchorId`: anchor is that existing element
  (unknown → throw "refused: unknown anchorId"). Else require x,y and create the §11 anchor ellipse
  `{type:"ellipse", x, y, width:28, height:28, backgroundColor:"#fff3bf", fillStyle:"solid",
  customData:{kind:"comment", threadId}}` via `prepareElement` + `stampAgent(el,"comment")` only when
  author is agent (human anchors: no stamp → no owner, black stroke). One rev for anchor+thread+message.
- `replyThread(s, threadId, text, author)` — append `{id:"m"+(len+1), author, text, ts}`, thread.rev=rev.
- `resolveThread(s, threadId, resolved=true, actor)` — flip status.
- `setThread(s, threadId, {collapsed?, resolved?}, actor)` — `collapsed` is shared UI state; bumps rev
  (pull is the only propagation channel, threads share session rev).
- All four append ONE event: `{type:"comment", actor, detail:{threadId, author}, threads:[thread]}`
  (+ `elements:[anchor]` when one was created; the generic replay path already applies `ev.elements`).
- `save()`: after computing `deleted`, for each deleted id that is a live thread's `anchorId` →
  `status:"resolved"`, `rev` = the save rev, resolved thread embedded in the same `human_edit` event.
  Thread is never dropped, so `threadDeletes` is structurally always `[]` (kept in the pull shape for the app).
  Agent-side deletion doesn't exist as a tool (§3 has no agent delete); if one appears it must call the same
  resolve-on-anchor-delete helper.
- `changes()`: gains `threads: {opened: string[], replied: string[]}` — from `threadAct`: opened where
  `opened.rev > since && opened.author === "human"`; replied where any reply with `rev > since && author === "human"`.
- `appendKeyframe` embeds `threads: [...st.threads.values()]`; `rebuildFromDisk` replaces the map on
  keyframe, upserts per comment event, and rebuilds `threadAct` from event order
  (`messages.length === 1` → opened entry, else reply entry).
- `canvas_threads`/`canvas_pull` `since` answered from `thread.rev` (contract puts `rev` on the Thread
  itself; no second copy in `revOf`).

## Tools — `server/src/server.ts`

- `canvas_threads` (model): `{status?: "open"|"resolved"|"all", since?}` → `{rev, threads:[...]}`.
  Filter status (default open) then `rev > since` if given. Each entry carries `anchor:{x,y}`
  (anchor bbox centre? no — contract says `{x,y}`: use the anchor element's `x,y`) and `near`:
  compact elements whose bbox intersects the anchor-centre ±160 px box (L∞ "within 160 px"),
  nearest 8, excluding any element with `customData.kind === "comment"` (anchors). Anchor element
  gone (resolved-by-deletion shown under status all) → omit `anchor`/`near`.
- `canvas_comment` (model): `{anchorId?, x?, y?, text}` → author agent → `{rev, threadId, anchorId}`.
  Refuse: empty text; no anchorId and missing x/y; unknown anchorId.
- `canvas_reply` (model): `{threadId, text}` → `{rev, messageId}`. Unknown thread → refused.
- `canvas_resolve` (model): `{threadId, resolved?: true}` → `{rev}`; `resolved ?? true` (false reopens).
- `canvas_thread_post` (app-only): `{threadId?, anchorId?, x?, y?, text}` → human author; `threadId`
  → reply (`{rev, threadId, messageId}`), else open (`{rev, threadId, anchorId}`).
- `canvas_thread_set` (app-only): `{threadId, collapsed?, resolved?}` → `{rev}`.
- `canvas_pull`: add `threads` (rev > since) and `threadDeletes: []`.
- `canvas_changes`: add `threads: {opened, replied}` to the result JSON.
- AnchorId+x/y both given → anchorId wins.

## Guide — `server/src/guide.md`

One paragraph after Annotations: threads are questions/answers anchored to the canvas
(`canvas_comment`/`canvas_reply`/`canvas_resolve`/`canvas_threads`), not annotations; poll
`canvas_changes` (`threads.opened`) to notice the human's questions; resolving hides them from the default
`canvas_threads` view.

## Tests — `server/test/canvas.test.ts` (append; renumbering depends on WP-J's final shape)

1. human opens (`canvas_thread_post` x,y near an existing element) → `canvas_threads` returns it with
   `near` containing that element, `anchor {x,y}`, 1 human message.
2. agent `canvas_reply` → `canvas_pull` (since pre-reply) returns the thread with 2 messages;
   `canvas_threads since:` filtering.
3. anchor omitted from a full-scene `canvas_save` → thread `resolved` (status all shows it, open hides it).
4. `canvas_changes` reports `threads.opened` for the human open.
5. restart-from-disk (extend the existing rebuild test): threads + message ids survive replay.

## Smoke — `canvas/test/smoke.ts`

- Step 2 tool lists: `canvas_threads/comment/reply/resolve` → MODEL_TOOLS; `canvas_thread_post/set` → APP_TOOLS.
- New step 9: human open (canvas_thread_post near the human rect from step 4) → canvas_threads (agent view,
  near non-empty) → canvas_reply → canvas_pull since → thread with 2 messages. Final line 9/9.

## Order of operations

1. Wait for `## WP-J unlock` in NOTES.md (poll 2 min).
2. Re-read store.ts/server.ts/tests (WP-J's final diff may move everything).
3. shared types → store → server tools → tests → guide → smoke.
4. `bun run --cwd canvas check` green; restart :3100 myself (host :8080 untouched); smoke 9/9.
5. NOTES.md `## WP-L threads server` + exact `canvas_pull` thread JSON sample; `WP-L DONE`.
