# Stack Architecture (v2 — Converged)

**Status:** Converged after 3-round debate between `rearchitect` (architecture/domain track) and `uiux` (UI/UX track) on 2026-05-09. Living document.
**Scope:** Frontend + backend platform/framework choices for the Algopeeps rearchitecture.
**Companions:**
- `docs/pi-integration.md` — Pi runtime + MCP integration design
- `design/stack-decision.md` (uiux) — peer source-of-truth, may have residual UI-side notes
- `design/api-contract.md` (uiux) — wire contract, REST→tRPC + WS event schemas
- `design/ui-ux-spec.md` (uiux) — UI behavior spec

---

## Final Converged Stack

```
runtime         Node.js 22 LTS
monorepo        pnpm workspaces (apps/web, apps/server, packages/shared)
backend         Fastify + @fastify/websocket
agent runtime   @earendil-works/pi-agent-core
mcp bridge      pi-mcp-adapter OR custom on @modelcontextprotocol/sdk —
                budget 300–600 LOC once reconnection, error mapping, and
                capability negotiation are handled. Don't anchor on smaller
                estimates. (Phase-0 spike resolves; see docs/pi-integration.md §4.3)
frontend        Vite 7 + React 19 + TanStack Router
rpc             HYBRID:
                  • tRPC v11 for CRUD (sessions.*, problems.*, runs.start,
                    hints.request, settings.*, profile, analytics.*)
                  • Raw WebSocket + shared Zod schemas for high-volume Pi event
                    stream (agent.message.*, buffer.snapshot, test.run.*,
                    defer.*, consultor.*, pedagogy.update)
data fetching   TanStack Query
state (hot)     Zustand — chamber/replay only (token streams, focus mode,
                deferred shelf, replay cursor, playback speed)
db              Drizzle + SQLite (WAL from day one) → Postgres migration path
validation      Zod everywhere; shared schemas in packages/shared
styling         Tailwind v4
ui kit          shadcn/ui (Radix primitives)
canvas          tldraw (Draw overlay — custom tldraw license; watermark
                required for free use, commercial license to remove. Fine
                for v0; revisit license posture before any public release.
                Ref: tldraw.dev/license)
code mirror     CodeMirror 6 read-only
                (EditorView.editable.of(false) + tabindex=-1 prevents focus theft)
charts          Recharts or @visx
don't-add       Next.js, Prisma, Turborepo, Storybook, Redux, Bun, OpenCode
```

### Resolved debates (between `rearchitect` and `uiux`)

| Topic | Outcome | Why |
|---|---|---|
| Bun vs Node 22 | **Node 22 LTS** | `pi-agent-core` uses `child_process` (Buddy stdio), `worker_threads` (testcase sandbox), `node:inspector` — Bun has gaps on all three. Runtime compatibility > DX. |
| Hono vs Fastify | **Fastify** | Hono's portability advantage dies once Node-locked. Fastify has deeper WS plugin ecosystem (`@fastify/websocket`). |
| tRPC vs custom WS | **Hybrid** (tRPC for CRUD, raw WS+Zod for events) | Sidesteps tRPC concurrent-iterator question; honors high-volume event fanout pattern; keeps tRPC's CRUD DX wins; shared Zod schemas cover both layers. |
| Zustand inclusion | **Yes, hot state only** | Token deltas (~30–60/sec), replay cursor, playback speed are wrong shape for TanStack Query. Server state stays on Query. |
| pi-web-ui (Lit) | **Skip** | Mixing Lit web components into a React tree means shadow-DOM theming gymnastics + separate event systems. Rebuild ChatPanel/ArtifactsPanel in React+shadcn faster than re-skinning Lit. |
| Monorepo tool | **pnpm workspaces** | Stricter dep resolution (catches phantom deps), faster cold install, smaller `node_modules`. |

### Phase-0 spike items (still [open])

1. **`pi-mcp-adapter` integration mode** — α (programmatic) / β (extension-host wrapped) / γ (custom 150 LOC bridge). Read adapter source. See `docs/pi-integration.md` §4.3.
2. **Buddy MCP transport** — stdio vs HTTP/SSE. 5-min check of Buddy docs.
3. **TanStack Start revisit** — in ~6 months. If stable by Q4 2026, migration is small (Vite + React + Router → Start adds server functions, removes Fastify).

---

## Codex Platform Research (2026-05-09) — original recommendation

> The remainder of this doc is the original Codex research output. Most recommendations were adopted as-is during convergence; UI-side picks (Tailwind, shadcn/ui, tldraw, CodeMirror 6, Recharts) were added by `uiux` and merged into the final stack above.

### Recommendation

Use a split app, not a meta-framework:

- **Runtime:** Node.js 22 LTS
- **Backend:** Fastify + `@trpc/server` v11
- **Frontend:** Vite 7 + React 19 + TanStack Router
- **RPC:** tRPC v11 with TanStack Query integration
- **Streaming:** tRPC subscriptions over SSE/WebSocket; raw Fastify routes only for non-RPC streams if needed
- **State:** TanStack Query for server state, Zustand for live session/event/timeline state
- **DB:** Drizzle ORM + SQLite now, Postgres later

> **Note (post-convergence):** the streaming line above was refined during the rearchitect↔uiux debate. The final position is **hybrid**: tRPC v11 for CRUD only; raw WS + shared Zod schemas for the Pi event stream. This sidesteps tRPC's concurrent-iterator behavior under multiple in-flight subscriptions and matches `api-contract.md`'s 15+ event types with high-volume fanout.

---

## Why This Stack

Algopeeps is an app-shell product: live chamber, replay timeline, code snapshots, streaming agent turns, local persistence, and a Node-only agent runtime. A split Vite SPA plus standalone Node backend fits that better than Next/Remix/SvelteKit/Astro. You do not need SSR, edge deployment, file-route magic, or server components. You need a long-running Node process that can own `pi-agent-core`, stdio MCP, SQLite, sandbox execution, and durable streams.

**Vite 7** is the right frontend base: official Vite 7 requires Node `20.19+ / 22.12+`, is ESM-only, and targets modern browsers by default, fine for a local-first app. HMR stays fast and boring.

**React 19** wins despite Solid/Svelte having better fine-grained reactivity. React 19 is stable, adds Actions, `useOptimistic`, and `use`. More importantly, React has the best ecosystem for code editors, virtualized timelines, devtools, syntax highlighting, resizable panes, command palettes, and replay UIs. For streaming token deltas, the performance answer is not "use Solid" — it is "batch deltas, virtualize lists, and isolate hot state."

**tRPC v11** is the best fit for solo TypeScript velocity. No codegen, end-to-end inference, framework-agnostic adapters, and v11's TanStack Query integration is the explicitly recommended path. For Algopeeps, model procedures as `sessions.create`, `sessions.history`, `runs.start`, `catalog.list`, plus `sessionEvents.subscribe`.

**Fastify** is the pragmatic Node host. Use it for lifecycle, logging, plugins, static serving, WebSocket upgrade, and raw HTTP escape hatches. `@fastify/websocket` is built on `ws@8` with TypeScript types. Hono is elegant but needs `@hono/node-ws` for WebSocket on Node and is more compelling when you want Web-standard portability — not relevant here since you are deliberately Node-bound.

**Zustand** should own the hot live chamber state: appended transcript deltas, testcase events, buffer indicators, timeline cursor, playback speed. It is small, provider-free, selector-based, and handles React concurrency pitfalls. Keep TanStack Query for fetched server state and mutations; do not force streaming deltas through the query cache.

**Drizzle** beats Prisma/Kysely here. SQLite-first, schema-in-TS, migrations, SQL closeness, clean Postgres path. Kysely is excellent for pure query-builder discipline but Drizzle gives a faster solo path with schema/migration ergonomics. Prisma is heavier and generator-driven — less pleasant for event-log-shaped local SQLite work.

---

## Meta-Framework Verdict

Skip them all.

Next.js 16 is impressive (Turbopack stable/default, React Compiler support stable, more explicit caching). Still wrong here: App Router/server boundaries add complexity around long-running local agent processes and streaming control.

TanStack Start is the most tempting — Vite, Router, server functions, typed streaming, deploy-anywhere — but it is still in beta/RC and moving fast. Revisit in 6 months.

Remix/React Router v7 is stable with Vite/HMR/type safety, but its full-stack model buys less than a clean API process for this product.

Astro is wrong: content sites, not live agent chambers.

---

## Alternatives

1. **Vite + Solid + Hono RPC + Drizzle** — fastest reactive UI and elegant HTTP types, but weaker ecosystem for the complex coding/timeline UI you are building.
2. **TanStack Start + React + server functions + Drizzle** — attractive in 2026, but beta/RC instability is the wrong foundation for a solo project's core.
3. **Next.js 16 + tRPC + Drizzle** — best if you later need hosted SaaS conventions, auth, SSR, and Vercel deployment; overbuilt for local-first v1.

---

## DX Wins

**Hot reload:** Vite handles the chamber UI fast; backend runs separately with `tsx watch` or `node --watch`.

**Type sharing:** export `AppRouter` from backend; frontend imports only `type AppRouter`; tRPC infers inputs/outputs with no codegen.

**Deploy story:** one Node process serving `/api`, `/trpc`, `/ws` or `/events`, and static `dist/`. Local SQLite file beside app data.

**Inspector tools:** React DevTools, TanStack Query Devtools, Redux DevTools via Zustand middleware, Drizzle Studio, Fastify structured logs.

---

## Traps

**Bun on the backend:** do not use it for v1. Bun's own docs still show gaps in Node compatibility — partial `child_process`, partial `worker_threads`, `node:inspector` gaps. `pi-agent-core` is Node-only. Use Node 22 LTS.

**Effect RPC:** powerful, typed, stream-capable, but too much ceremony for a solo learning product unless you already live in the Effect ecosystem.

**GraphQL + codegen:** excellent for multi-client public APIs, but schema/codegen overhead is unnecessary here. tRPC is faster for a private TS monorepo.

**Svelte 5/Solid for perf:** Solid signals and Svelte 5 runes are real fine-grained wins — the ecosystem cost is not worth it for an editor/timeline-heavy app where you will lean on Monaco, CodeMirror, virtualized lists, and command-palette libraries that all have primary React support.

---

## Top 3 Risks

1. **tRPC subscriptions can shape your architecture badly.** Keep event persistence as plain append-only DB rows, not "whatever the subscription emits." Design the event schema first, subscription is just a view over it.
2. **React streaming UIs re-render badly without discipline.** Batch assistant deltas and virtualize replay/timeline rows from day one — do not defer this until you have performance issues.
3. **SQLite concurrency around testcase runs and agent transcripts needs WAL mode from the start.** Use WAL mode, short writes, explicit event ordering, and sketch the Postgres migration schema early before the SQLite schema hardens.

---

## Change log

- **2026-05-09 — v1.** Initial draft from Codex platform research. Stack locked at the boundary level (Node 22 / Fastify / tRPC v11 / Vite 7 / React 19 / TanStack Router+Query / Zustand / Drizzle+SQLite-WAL). Revisit TanStack Start in ~6 months.
- **2026-05-09 — v2 (converged).** Three-round debate between `rearchitect` and `uiux` peers. Confirmed Node 22 over Bun (Pi compat), Fastify over Hono, hybrid RPC (tRPC for CRUD + raw WS+Zod for events) over pure tRPC subscriptions. Added pnpm workspaces, Tailwind v4, shadcn/ui, tldraw, CodeMirror 6, Recharts/@visx from `uiux` track. Skip pi-web-ui Lit components.
- **2026-05-09 — v2.1.** Corrections from manager-peer review (advisor-checked):
  - tldraw license clarified — custom tldraw license, not MIT. Watermark required for free use; commercial license to remove. Revisit posture before any public release.
  - MCP bridge LOC estimate revised from "~150" → "300–600 once reconnection, error mapping, and capability negotiation are handled." Don't anchor scope on the smaller figure.
  - **Spike discipline:** Phase-0 spike items (pi-mcp-adapter mode, Buddy transport, TanStack Start revisit) must not be silently dropped under deadline pressure.
