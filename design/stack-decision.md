# Algopeeps — Stack Decision (v0)

Converged stack after peer debate between `uiux` and `rearchitect` sessions, plus Advisor research. Final.

---

## Final converged stack

```
runtime         Node 22 LTS for backend; Bun for frontend dev/build only (split per user direction)
monorepo        pnpm workspaces (apps/web, apps/server, packages/shared)
backend         Fastify + @fastify/websocket  (Node 22 — pi-agent-core compat)
frontend tooling  Bun (install, dev server, build) — does not host pi-agent-core, so the Node-only constraint doesn't apply here
agent runtime   @earendil-works/pi-agent-core
mcp bridge      pi-mcp-adapter (or ~300–600 LOC custom — Phase-0 spike resolves)
frontend        Vite 7 + React 19 + TanStack Router
rpc             tRPC v11 (CRUD) + raw WS with shared Zod schemas (event stream) — hybrid
data fetching   TanStack Query
state (hot)     Zustand (chamber/replay only)
db              Drizzle ORM + SQLite (WAL day one) → Postgres migration path
validation      Zod everywhere, shared in packages/shared
styling         Tailwind v4
ui kit          shadcn/ui (Radix primitives)
canvas          tldraw (Draw overlay)
code mirror     CodeMirror 6 read-only (editable.of(false) + tabindex=-1)
charts          Recharts or @visx
```

---

## Key decisions, rationale, and what we explicitly rejected

### Runtime: Node 22 LTS (NOT Bun)

**Rejected Bun** despite its DX edge. The discriminating fact: pi-agent-core touches exactly the Bun gap surface — `child_process` stdio (Buddy MCP), `worker_threads` (testcase sandboxes), `node:inspector` (debug). Bun's documented gaps in these areas would cost us more in runtime-mismatch debugging than we'd gain in install speed. Locked Node 22.

### Backend: Fastify + @fastify/websocket (NOT Hono, NOT Elysia)

- **Hono:** sole advantage was Web-standard portability. Dies once Node-locked. Hono on Node also requires `@hono/node-ws` shim — net friction without payoff.
- **Elysia:** Eden type-link is sexy but locks to Bun.
- **Fastify:** mature on Node, deep plugin ecosystem, native WS integration. Pragmatic pick.

### RPC: Hybrid — tRPC v11 (CRUD) + raw WS with Zod (events)

**Why hybrid, not tRPC-only or WS-only:**

- tRPC v11 subscriptions *can* handle our streaming, but they're shaped for query/mutation. Multi-agent concurrent token streams (3 agents generating in parallel + buffer events + test events + state changes) push tRPC subscriptions into territory where the abstraction fights us — risk of head-of-line blocking, awkward concurrent-iterator patterns, weak resume-since-event-id support.
- Custom-WS-only forces us to hand-roll request/response correlation, optimistic acks, retry logic, devtools — for the 80% of API surface (CRUD) where tRPC handles all of that for free.
- **Hybrid:** tRPC owns CRUD (sessions.*, problems.*, runs.start, hints.request, profile, analytics.*); raw WS owns the event stream (agent.message.*, buffer.*, test.run.*, defer.*, consultor.*, pedagogy.update). Shared Zod schemas in `packages/shared` give end-to-end inference across both layers.

### State: TanStack Query (server) + Zustand (hot)

- **TanStack Query** for all server-state caching, mutation acks, invalidation.
- **Zustand** for hot live-chamber state only — token deltas at 30–60/sec, focus mode toggles, deferred shelf state, replay timeline cursor, playback speed. React state + props alone is wrong shape; `useSyncExternalStore` over a vanilla emitter is just rebuilding Zustand minus devtools.
- **No Redux.** No global state lib for non-streaming UI.

### DB: Drizzle + SQLite (WAL from day one)

- **Drizzle over Prisma:** smaller, faster startup, better TS inference, no separate codegen step. SQLite-first.
- **WAL from day one:** non-negotiable for our streaming write pattern.
- **Postgres migration path:** Drizzle's migration tooling supports both; we won't be locked in.

### Frontend: Vite 7 + React 19 + TanStack Router (NOT Next.js)

- **React 19 over Solid/Svelte:** discriminating constraint is the React-first ecosystem — tldraw (Draw overlay), CodeMirror 6 (problem peek), shadcn/ui + Radix (brutalist primitives), Recharts/visx. Rebuilding the canvas in Solid/Svelte costs more than streaming-perf wins are worth. React 19 + Zustand handles concurrent token streams fine.
- **Vite 7 over Next.js 15/16:** Algopeeps is a single-user signed-in streaming SPA. Next/RSC streams *initial render*, not token-by-token messages. Wrong tool. RSC complexity unjustified.
- **TanStack Router:** type-safe routes, integrates cleanly with TanStack Query.

### Canvas / Editor / UI

- **tldraw:** custom tldraw license (free use requires the watermark; commercial license to remove it — see tldraw.dev/license). ~500KB minified. Acceptable for v0 personal project; revisit if going commercial.
- **CodeMirror 6 read-only:** `EditorView.editable.of(false)` + `tabindex=-1` on wrapper prevents focus theft from the unified input.
- **shadcn/ui:** Radix primitives, copy-paste, we own the component code. Fits brutalist aesthetic without skin-fighting.

---

## Don't-add list

- ❌ Bun (Pi compat)
- ❌ Next.js / RSC (wrong shape for streaming SPA)
- ❌ Hono (portability moot under Node lock)
- ❌ Elysia (Bun lock)
- ❌ Prisma (heavier than Drizzle for our use case)
- ❌ tRPC subscriptions for the event stream (use raw WS instead)
- ❌ Redux (premature)
- ❌ Turborepo / Nx (overkill for 2 apps)
- ❌ Storybook (screens are integrated)
- ❌ OpenCode (replaced by pi-agent-core)

---

## Phase-0 spikes (verify before building — do not drop)

1. **pi-mcp-adapter mode (α/β/γ)** — confirm which adapter mode wires Buddy MCP cleanly into pi-agent-core. Falls back to ~300–600 LOC custom bridge if needed (real bridges land in this range; 150 was optimistic).
2. **Concurrent WS streams under Fastify** — spin up 3 mock subscriptions on one wsClient yielding 100 events/sec each, measure end-to-end p99 latency per stream, check for head-of-line blocking under load. **Pass:** no single stream's p99 degrades when others are active. **Fail:** drop to typed-WS fallback (already the converged choice for the event stream).
3. **CodeMirror 6 read-only focus behavior** — confirm `editable.of(false)` + `tabindex=-1` actually prevents focus capture from the unified input. (Rearchitect believes solved; verify in our specific layout.)
4. **tldraw bundle size + perf** under our actual canvas use (sketch-and-send, not collaborative editing).

## Open items (track, don't drop)

- **pi-mcp-adapter integration mode (α/β/γ)** — open until Phase-0 spike #1 resolves.
- **TanStack Start revisit ~Q4 2026** — if Start stabilizes, migration from Vite + React + Router → Start adds server functions and removes Fastify. Small migration; worth re-evaluating then.

---

## Convergence history

- **uiux original:** Bun + Hono + Vite + React + Drizzle + custom WS, no state lib, no router.
- **rearchitect original:** Node 22 + Fastify + Vite + React + TanStack Router + Drizzle + tRPC v11 + Zustand.
- **Convergence:**
  - uiux conceded Bun (Pi compatibility), Hono (portability moot), Zustand (hot state need real), TanStack Router (good add).
  - rearchitect conceded tRPC-for-everything (hybrid better fits multi-stream events).
  - Both agreed: Node 22, Fastify, Vite + React 19, Drizzle + SQLite WAL, Zod-everywhere, no Next.js / Prisma / Turborepo / Bun.

---

## Change log

- **v2.2** — runtime split per user direction: Bun used for the **frontend** dev server / install / build only (`apps/web`); backend (`apps/server`) stays Node 22 LTS because pi-agent-core requires Node-specific APIs (child_process / worker_threads / node:inspector). Frontend never imports from `apps/server` at runtime, only types from `packages/shared`, so the runtime split is clean. CI lanes split accordingly.
- **v2.1** — manager + advisor review corrections:
  - tldraw license corrected (not MIT — custom tldraw license; watermark required for free use, commercial license to remove). Doesn't change the pick; does change pre-release posture.
  - MCP bridge LOC estimate corrected (~300–600 LOC realistic, not ~150 — accounts for reconnection, error mapping, capability negotiation).
  - **Spike discipline:** Phase-0 spikes are blocking decisions, not optional. They must not be silently dropped under deadline pressure. Section now explicitly labeled "do not drop."
- **v2.0** — peer-debate convergence between `uiux` and `rearchitect`. uiux conceded Bun → Node 22, Hono → Fastify, added Zustand + TanStack Router. rearchitect conceded tRPC-everywhere → hybrid (tRPC for CRUD + raw WS for events).
- **v1.0** — initial uiux pick (Bun + Hono + Vite + React + Drizzle + custom WS, no state lib).

---

## Source-of-truth files

- `/design/stack-decision.md` (this file) — converged stack
- `/design/api-contract.md` — wire protocol (REST → tRPC procedures + raw WS event types)
- `/design/ui-ux-spec.md` — UI behavior spec
- `/docs/pi-integration.md` (rearchitect) — Pi runtime + MCP adapter detail
- `/docs/stack-architecture.md` (rearchitect) — full platform architecture
