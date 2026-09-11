# Algopeeps — API Contract (v0)

How the React frontend talks to the Node/TS pi-agent-core backend. Pairs with `ui-ux-spec.md` and `stack-decision.md`.

**Stack reminder (converged):**
- Backend: Node 22 LTS + Fastify + pi-agent-core + Buddy-MCP bridge + testcase sandbox + Drizzle/SQLite (WAL) + pedagogy state machine
- Frontend: Vite + React 19 + TanStack Router + TanStack Query + Zustand (hot state only)
- **Hybrid RPC:** tRPC v11 for CRUD (queries + mutations) + **raw WebSocket with shared Zod schemas** for the live event stream
- Shared types/schemas live in `packages/shared` (Zod) — give end-to-end inference across both transports
- Buddy-MCP: child process or configured transport, owned by backend
- No OpenCode, no Bun, no Hono, no tRPC subscriptions

---

## 1. Transport

### tRPC v11 (CRUD)

All request/response work — problem catalog, profile, analytics, session listing, post-mortem detail, session start/end — runs over **tRPC v11**. Procedures are organized into routers (see §4). End-to-end inference; no codegen step. TanStack Query is the client integration. Auth context: `X-User-Id` header propagated via tRPC context (single-user v0; bearer tokens later).

### Raw WebSocket (event stream)

For everything live in `Active · *`. One persistent socket per active session, mounted on Fastify via `@fastify/websocket`. **Not** tRPC subscriptions — the multi-agent concurrent token streaming pattern fights the abstraction (head-of-line blocking, awkward concurrent iterators).

```
ws://{host}/v1/sessions/{session_id}/stream
```

Messages are JSON, line-delimited; both directions validated against Zod schemas exported from `packages/shared`:

```json
{ "type": "agent.message.token", "id": "msg_4f2", "delta": "you" }
```

Every server→client message has `type` (dot-namespaced) and a payload. Every client→server message has `op` and a payload. Client validates incoming messages with `WSEvent.parse()`; server validates ops with `WSOp.parse()`. Bad payloads close the socket with code 1008.

---

## 2. Lifecycle

```
1. user clicks "begin" on Today
   → trpc.sessions.create.useMutation() { problem_id, agent_config }
   → returns { session_id }

2. frontend opens WS at /v1/sessions/{session_id}/stream
   → server sends `session.snapshot` immediately (full initial state)

3. as the session runs, server pushes events over WS
   client pushes ops over WS (reply, defer, consult, draw, run-tests, pause)
   tRPC remains available in parallel for any CRUD that doesn't need to be event-shaped

4. user closes / pauses / completes
   → client sends `op: session.pause` or `op: session.end` over WS
   → server persists, emits `session.ended`, closes WS

5. for post-mortem
   → trpc.sessions.get.useQuery({ id }) returns full event log + computed stats
```

The WS is **only** open during `Active · *`. Hub, post-mortem, profile, analytics — all pure tRPC.

---

## 3. Domain models

```ts
type Problem = {
  id: string;             // "two-sum"
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  description_md: string;
  examples: { input: string; output: string; note?: string }[];
  constraints: string[];
  test_specs: TestSpec[]; // hidden inputs/outputs not exposed to client
  related_problem_ids: string[];
};

type Session = {
  id: string;
  problem_id: string;
  user_id: string;
  status: "running" | "paused" | "ended";
  started_at: string;     // ISO
  ended_at?: string;
  outcome?: "solved" | "abandoned" | "timeout";
  score?: number;
  agent_config: AgentConfig[];
  current_snapshot_id?: string;
};

type AgentConfig = {
  slot: 1 | 2 | 3;        // pane position
  agent_id: string;       // "cost-guide", "contrarian", "pattern-seer"
  role_label: string;     // "complexity & tradeoffs"
};

type Snapshot = {
  id: string;             // "s17"
  session_id: string;
  file: string;
  content: string;
  captured_at: string;
  trigger: "idle" | "test-run" | "explicit" | "session-start";
};

type Message = {
  id: string;
  session_id: string;
  agent_slot: 1 | 2 | 3 | "consultor" | "user";
  to_slots: (1 | 2 | 3)[]; // for user messages; empty = broadcast
  mode?: "reply" | "challenge" | "defer" | "draw" | "consult";
  text: string;
  in_reply_to?: string;   // message id
  attached_drawing_id?: string;
  snapshot_id: string;    // what code the message reasons about
  created_at: string;
  status: "streaming" | "complete" | "errored";
  deferred: boolean;
  user_verdict?: "helped" | "misled" | "unclear"; // (UI may collect; v0 optional)
};

type TestRun = {
  id: string;
  session_id: string;
  snapshot_id: string;
  triggered_by: "user" | "system";
  started_at: string;
  completed_at?: string;
  results: {
    name: string;
    status: "passed" | "failed" | "timeout" | "errored";
    duration_ms?: number;
    expected?: string;
    actual?: string;
    error?: string;
  }[];
};

type DeferredItem = {
  message_id: string;     // points back into the messages stream
  deferred_at: string;
};

type Drawing = {
  id: string;
  session_id: string;
  payload: object;        // tldraw schema (TLStoreSnapshot) — backend stores opaque
  png_url?: string;       // server-rendered for context to LLMs
  created_at: string;
};
```

---

## 4. tRPC procedures

Mounted under a single `appRouter` exported from `apps/server/src/trpc/router.ts`. Client builds via `createTRPCReact<AppRouter>()` in `apps/web/src/trpc.ts`. Inputs validated with Zod schemas from `packages/shared`.

```ts
appRouter
├── problems
│   ├── list           → query()                       → Problem[] (lightweight)
│   ├── get            → query({ id })                 → Problem (full)
│   ├── history        → query({ id })                 → ProblemHistory
│   │                                                    (drives `Active · ? problem peek` right panel)
│   └── sets           → query()                       → ProblemSet[]
│                                                        (for `Profile · cross-session`)
├── sessions
│   ├── create         → mutation({ problem_id, agent_config? }) → { session_id }
│   ├── list           → query({ status?, limit?, cursor? })     → Session[]
│   ├── get            → query({ id })                           → SessionDetail
│   │                                                              (full state + events; post-mortem)
│   ├── events         → query({ id, since? })                   → Event[]
│   ├── transcript     → query({ id })                           → Message[] (for export)
│   ├── replay         → query({ id })                           → ReplayTimeline (events w/ timing)
│   └── export         → mutation({ id, format })                → { url } | file blob
├── profile
│   └── get            → query()                       → Profile
│                                                        (kpis + 90d heatmap + session-score history)
├── analytics
│   ├── byTopic        → query()                       → AnalyticsByTopic
│   ├── patterns       → query()                       → { patterns, drill_queue }
│   └── agents         → query()                       → AgentEffectiveness
└── today
    └── get            → query()                       → TodayPayload
                                                        (computed convenience: kpis + recommended +
                                                         recent + patterns + drill — single round-trip)
```

**Notes:**
- All inputs/outputs typed end-to-end via `inferRouterInputs<AppRouter>` / `inferRouterOutputs<AppRouter>`.
- `today.get` is the computed convenience wrapper that backs the hub in one call (avoids 5 separate procedures).
- Mutations that touch session state during `Active · *` should generally be sent as **WS ops** instead — tRPC mutations are for CRUD outside the live session (e.g. `sessions.create`, `sessions.export`).

---

## 5. WebSocket — server → client events

All messages are `{ type, ...payload }`.

### Session lifecycle

```ts
// emitted right after WS open: full state for first paint
{ type: "session.snapshot",
  session: Session,
  problem: Problem,
  messages: Message[],          // existing messages, oldest first
  snapshots: Snapshot[],
  test_runs: TestRun[],
  deferred: DeferredItem[],
  agent_states: { slot: 1|2|3, state: AgentState }[],
}

{ type: "session.update", session: Partial<Session> }   // pause/resume/status
{ type: "session.ended", outcome, score, summary_md }
```

### Agent state

```ts
type AgentState = "thinking" | "idle" | "spoke-last" | "replied" | "errored";

{ type: "agent.state", slot: 1|2|3, state: AgentState, since: string }
```

### Streaming agent messages

```ts
// new agent message starting; client allocates a bubble + throb
{ type: "agent.message.start",
  id: "msg_4f2",
  slot: 1|2|3 | "consultor",
  in_reply_to?: string,
  snapshot_id: "s17",
  mode?: "reply" | "challenge",     // when agent is responding to a user mode
  created_at: string,
}

// repeated; client appends to the message body
{ type: "agent.message.token", id: "msg_4f2", delta: "hash" }

// finalizes the message; client stops the throb
{ type: "agent.message.end", id: "msg_4f2", text: "...full text...", status: "complete" }

// or, on error
{ type: "agent.message.error", id: "msg_4f2", error: "..." }
```

### User message echo

```ts
// when the user's send is accepted and persisted; UI may have shown it optimistically
{ type: "user.message", message: Message }
```

### Buffer / snapshots

```ts
{ type: "buffer.snapshot",
  snapshot: Snapshot,
  edits_since_prev: number,
}

// emitted when the buffer has changed but no fresh snapshot has been taken yet
{ type: "buffer.stale",
  current_snapshot_id: string,
  edits_since: number,
}
```

### Tests

```ts
{ type: "test.run.start", id: "tr_99", snapshot_id: "s17", triggered_by: "user" | "system" }
{ type: "test.run.progress", id: "tr_99", completed: 2, total: 4 }
{ type: "test.run.end", run: TestRun }
```

### Deferred

```ts
{ type: "defer.add",    item: DeferredItem }
{ type: "defer.remove", message_id: string }
```

### Consultor

```ts
{ type: "consultor.opened",  context_message_id?: string }
{ type: "consultor.closed" }
// agent.message.* events with slot: "consultor" carry consultor streams
```

### Drawing

```ts
{ type: "drawing.attached", drawing: Drawing, message_id: string }
```

### Pedagogy / grader (v0: surfaced only at end; live update reserved)

```ts
{ type: "pedagogy.update",
  hint_level: number,            // per agent
  misconception_flags: string[],
  user_state: "engaged" | "stalling" | "confident" | "lost",
}
```

The frontend can ignore `pedagogy.update` in v0 (no live grader gauge); the server should still emit so post-mortem can show an evolution graph if/when added.

---

## 6. WebSocket — client → server ops

```ts
// reply (default mode)
{ op: "reply.send",
  text: string,
  to_slots: (1|2|3)[],          // [] = broadcast
  mode: "reply" | "challenge",
  in_reply_to?: string,         // optional; the deferred-item case sets this
  attached_drawing?: { payload: object },
}

// defer the latest agent message of a given slot (or a specific message id)
{ op: "defer.add", message_id: string }
{ op: "defer.remove", message_id: string }

// consultor
{ op: "consultor.open", context_message_id?: string }   // server emits consultor.opened
{ op: "consultor.send", text: string }
{ op: "consultor.close" }

// drawing — sent inline as part of reply.send (see attached_drawing).
// no separate op for the canvas itself; client persists the draft client-side until send.

// tests
{ op: "tests.run", scope: "all" | { names: string[] } }

// session control
{ op: "session.pause" }
{ op: "session.resume" }
{ op: "session.end" }

// optional verdict on a single agent message (drives reveal/analytics later)
{ op: "verdict.set", message_id: string, verdict: "helped" | "misled" | "unclear" }
```

Server **acks** with either an event the client expects (e.g. `user.message` after `reply.send`) or an explicit ack:

```ts
{ type: "ack", op: "reply.send", request_id: string, ok: true }
{ type: "ack", op: "reply.send", request_id: string, ok: false, error: "..." }
```

(Each client op should carry an opaque `request_id` to correlate.)

---

## 7. Page → data mapping (concrete)

What each page consumes. Useful for the React wiring (`trpc.X.Y.useQuery()`, custom WS hook, Zustand slices).

### `Today`

- `trpc.today.get.useQuery()` once on mount.
- No WS.

### `Active · 3 agents`

- `trpc.sessions.get.useQuery({ id })` once on mount → seeds full state into Zustand chamber slice.
- Open WS at `/v1/sessions/{id}/stream` → handles all live updates; reduces into the same Zustand slice.
- Header `Two Sum {tags}`: from `session.problem`.
- Council strip glyphs: from `agent.state` events (and `session.snapshot.agent_states` initial seed).
- Pane content: filter `messages` by `agent_slot`, append `agent.message.token` deltas live.
- Per-pane action row: pure UI; click → WS `op: reply.send` / `op: defer.add` / `op: consultor.open` / opens Draw overlay (which then sends via `reply.send` with `attached_drawing`).
- Input bar `TO` chip: client-side Zustand state, derived from typed `@N` mentions, syncs into `to_slots` on send.
- Deferred bar: filter `messages` by `deferred: true`, sorted by `defer_add` time.
- Status bar: `buffer.snapshot` events update `@s17`. WS connection state drives `◐` color.
- Stale indicator: when `buffer.stale.edits_since > 0`, show on panes whose latest agent message has a snapshot ref older than the current snapshot.

### `Active · ? problem peek`

- Already loaded: `session.problem` (from session snapshot).
- `trpc.problems.history.useQuery({ id })` for the right panel (attempts, best score, etc.).
- Tests pane on this page is a *view* of the same `test_runs` from the session — no separate fetch.

### `Active · Consultor`

- All in WS. `op: consultor.open` → server emits `consultor.opened` → UI swaps input (Zustand chamber slice flips `consultor.open = true`).
- Consultor messages flow through the same `agent.message.*` events with `slot: "consultor"`.

### `Active · Draw overlay`

- Pure client state (Zustand draw slice) until send. WS `op: reply.send` with `attached_drawing` payload.
- Server emits `drawing.attached` + `agent.message.start` for whichever agents respond.

### `Post-Mortem · vertical timeline`

- `trpc.sessions.get.useQuery({ id })` → full state (read-only).
- `trpc.sessions.events.useQuery({ id })` if the timeline needs more granular event history than the messages list.
- Replay (autoplay) tab: `trpc.sessions.replay.useQuery({ id })` returns events with normalized timing; client plays them on a clock (Zustand replay slice owns playback cursor + speed).

### `Profile · cross-session`

- `trpc.profile.get.useQuery()` once.

### `Analytics · deep dive`

- `trpc.analytics.byTopic.useQuery()`
- `trpc.analytics.patterns.useQuery()`
- `trpc.analytics.agents.useQuery()`

(Three calls; could be consolidated but they map to different tabs and are independently cacheable by TanStack Query.)

---

## 8. Streaming semantics

1. **One open WS per active session.** Reconnection is automatic; on reconnect, the client sends `{ op: "resume", since_event_id: "..." }` and the server replays from the resume point or, if too old, sends a fresh `session.snapshot`.
2. **Token order is preserved per message id.** Different messages may stream interleaved (multiple agents simultaneously) — that's fine, the client routes by `id`.
3. **Server is the source of truth for ordering.** Client may render optimistically (e.g. user reply appears immediately on send) but `user.message` echo is authoritative; client reconciles on mismatch.
4. **No client-side LLM calls.** All generation goes through the backend's pi-agent-core. The frontend does not know which provider/model is in use beyond what the status bar shows.

---

## 9. Buddy-MCP boundary

The frontend never speaks to Buddy directly. The backend is the only consumer of Buddy's MCP. From the frontend's perspective:

- "Buffer" data appears as `buffer.snapshot` events.
- The `file`, `content`, and `captured_at` fields are populated by the backend, sourced from Buddy.
- The `agents reading code @s17` indicator in the status bar is purely informational.

If Buddy disconnects: backend sets `session.status` to `paused-disconnected` and emits `session.update`. Frontend dims the council strip and shows an unobtrusive banner (`◐ neovim disconnected — agents waiting`).

---

## 10. Errors

Server-side fatal errors are emitted as:

```ts
{ type: "error", code: "AGENT_TIMEOUT" | "BUDDY_DISCONNECTED" | "MODEL_RATE_LIMIT" | ...,
  message: string, recoverable: boolean }
```

Client maps codes to user-visible banners. Only `recoverable: false` prompts a session-end flow.

---

## 11. Versioning

- **tRPC:** `appRouter` is the source of truth. Breaking changes bump `protocol_version` (returned in `session.snapshot` and on a top-level `trpc.meta.version.useQuery()`); the client refuses to render against an incompatible server. Within a major version, additive procedures and optional fields are safe.
- **WS:** message `type` strings are stable contracts. Additions (new types, new fields) are minor; renames or removals are breaking. Zod schemas in `packages/shared` are the single source of truth — any change must update them and bump `protocol_version`.
- **WS path** (`/v1/sessions/{id}/stream`) carries the major version. A `/v2/` path may run alongside during a migration window.

---

## 12. Open questions for the backend implementer

1. **Snapshot capture cadence** — is it always `idle-3s`, or configurable per session? UI shows the trigger on the status bar, so the server must populate `Snapshot.trigger` accurately.
2. **Test sandbox isolation** — how long does a `tests.run` block other agents? UI assumes agents *do not* pause during a test run unless the model itself is gating; if there's a global lock, the council strip needs to reflect it.
3. **Pedagogy state at v0** — emit `pedagogy.update` always, or only when the v1 grader UI exists? Recommend always; client ignores until needed.
4. **Verdict capture** — does `op: verdict.set` exist in v0? UI design has hooks but the active-session screens do not currently surface the verdict input. If deferred to v1, this op can be cut.
5. **WS auth** — the `X-User-Id` header isn't available on browser WebSocket; auth piggybacks on the tRPC session cookie or a query param signed token. Backend implementer to choose; document in `apps/server/README.md`.

---

## Change log

- **v1.1** — reframed for converged stack: REST endpoints → tRPC procedures (§4 rewritten), explicit hybrid in §1 (tRPC for CRUD, raw WS for events), WS validation via shared Zod schemas in `packages/shared`, drawing payload typed as tldraw `TLStoreSnapshot`, page→data mapping examples updated to `trpc.X.Y.useQuery()` syntax, Zustand chamber/replay slices noted, WS auth question added.
- **v1.0** — initial spec assuming REST + custom WS.
