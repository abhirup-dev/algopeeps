# Pi Integration — Design Doc (Draft v1)

**Status:** Draft. Living document. Expect revision as we learn from a v0 spike.
**Scope:** How Algopeeps' rearchitected backend uses the Pi agent toolkit (`@earendil-works/pi-*`) and `pi-mcp-adapter` to drive Socratic-style coding sessions, with Buddy MCP as the editor source and a React UI as the front end.
**Out of scope:** UI/UX sketches (owned by the `uiux` track), domain schema details (separate doc), Buddy MCP internals (separate doc once Buddy transport is confirmed).

> **Reading this doc:** sections marked **[locked]** are decisions we're committing to. Sections marked **[open]** are explicit branch points where we expect the design to change once we run a spike or get more information. Treat **[open]** items as parking spots, not as finished prescriptions.

---

## 1. Decision summary

**[locked]**

| Decision | Choice | Rationale |
|---|---|---|
| Agent runtime | `@earendil-works/pi-agent-core` library | Pi's stateful agent + custom message types + tool hooks fit Socratic pedagogy primitives more directly than OpenCode's CLI-server shape. ([Pi monorepo README][pi-readme]) |
| LLM provider abstraction | `@earendil-works/pi-ai` | Multi-provider (Anthropic, OpenAI, Google, Bedrock, OpenRouter, OAuth Codex/Copilot, OpenAI-compatible local), token + cost tracking, mid-session handoff. ([pi-ai README][pi-ai-readme]) |
| Architecture shape | **Option B**: Pi runs in a Node/TS backend; React UI consumes events via WS/SSE | Keys server-side, durable pedagogy state at source, single source of truth for replay events. ([Codex audit, this repo][codex-audit-summary]) |
| Backend language | TypeScript / Node | Required to consume Pi as a library; Codex audit found ~80% of v0 Go is throwaway, so the language flip cost is small. |
| MCP client | `pi-mcp-adapter` (token-efficient proxy) for the agent-facing surface; raw `@modelcontextprotocol/sdk` if/when we need server-side MCP plumbing not exposed by the adapter | Adapter avoids burning context with full MCP tool dumps; lazy-loads servers; supports both stdio + HTTP MCP transports. ([pi-mcp-adapter package page][pi-mcp-adapter]) |
| Editor source | Buddy MCP (Neovim-first; other IDEs later) | Replaces v0's custom TCP+Lua plugin entirely. ([Codex audit][codex-audit-summary]) |
| OpenCode dependency | **Removed** | No longer required once Pi is wired in. |

---

## 2. Known unknowns / open questions

**[open]**

These directly affect the design and are not decided yet. Each gets a follow-up before its dependent work starts.

1. **`pi-mcp-adapter` consumability from `pi-agent-core`.**
   The adapter is documented as a Pi *extension* — it registers via the `pi-coding-agent` CLI's `ExtensionAPI` (`pi.registerTool(...)`) and reads `mcp.json` from Pi-managed config locations. ([pi-mcp-adapter package page][pi-mcp-adapter])
   Our backend uses `pi-agent-core` as a library, *not* the CLI. So the open question is:
   - **a)** Does `pi-mcp-adapter` export a programmatic surface (factory that returns `AgentTool[]` + a config object) that we can consume from `pi-agent-core` directly, or
   - **b)** Is it tied to `ExtensionAPI` only — meaning we'd have to either embed `pi-coding-agent` headless, fork the adapter, or fall back to writing a thin MCP→Pi bridge ourselves on top of `@modelcontextprotocol/sdk`.
   - **Decision gate:** read the adapter's source (`nicobailon/pi-mcp-adapter` on GitHub, [source repo][pi-mcp-adapter-repo]) before committing the bridge implementation. If (b), we keep the *config format* (`mcp.json` shape) for compatibility but write our own 300–600 LOC realistic budget programmatic loader.

2. **Buddy MCP transport.** stdio vs HTTP/SSE. Affects lifecycle wrapper but not the agent contract. 5-minute check of Buddy's docs before bridge work.

3. **Pedagogy state location.** Owned by backend per Codex audit, but is it (a) a separate state machine the agent calls into via tools, or (b) custom `AgentMessage` types declared via Pi's declaration merging and filtered out of `convertToLlm`? Likely (b) for replay fidelity, (a) for clarity. Will spike both.

4. **Sessions/storage.** Pi's `pi-web-ui` ships an IndexedDB store, but we're server-side. SQLite via `better-sqlite3` for v1 looks right, with the JSONL append-only event log mirroring Pi's session format ([Pi sessions JSONL][pi-coding-agent-readme]).

5. **Provider strategy for v1.** Anthropic-only to start, but `pi-ai`'s cross-provider handoff is a v2 lever for cost (e.g., Haiku for routine Socratic prompts, Sonnet for failure-mode review).

---

## 3. Target architecture

**[locked at the boundary level; component internals are [open]]**

```
┌──────────────────────────┐                ┌─────────────────────────────────┐
│       Neovim             │                │        Browser (React)          │
│  ┌────────────────────┐  │                │  ┌───────────────────────────┐  │
│  │   Buddy.nvim       │  │                │  │ Live session view         │  │
│  │   (MCP server)     │  │                │  │ History / replay timeline │  │
│  └─────────┬──────────┘  │                │  │ Problem catalog / dash    │  │
└────────────┼─────────────┘                │  └─────────────┬─────────────┘  │
             │ stdio (or HTTP/SSE)          │                │ WS + HTTP      │
             ▼                              └────────────────┼────────────────┘
┌────────────────────────────────────────────────────────────┼────────────────┐
│                    Algopeeps Backend (Node/TS)             │                │
│                                                            ▼                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  HTTP / WebSocket layer  (Fastify/Hono — TBD)                        │  │
│  └──────────────┬───────────────────────────────────┬───────────────────┘  │
│                 │                                   │                       │
│      ┌──────────▼─────────────┐         ┌───────────▼────────────┐         │
│      │  SessionService        │         │  ProblemService /      │         │
│      │  (lifecycle, replay)   │         │  TestcaseService       │         │
│      └──────────┬─────────────┘         └───────────┬────────────┘         │
│                 │                                   │                       │
│      ┌──────────▼─────────────────────────────────────────────────┐        │
│      │  AgentOrchestrator                                          │        │
│      │   • wraps Pi `Agent` instance per session                   │        │
│      │   • subscribes to event stream → persists + fans out to WS  │        │
│      │   • owns pedagogy state machine (hint level, misconceptions)│        │
│      │   • registers tools: buddy.*, testcase.*, problem.*, hint.* │        │
│      │   • beforeToolCall hook = pedagogy gate                     │        │
│      └──────────┬──────────────────────────────────┬──────────────┘        │
│                 │                                  │                        │
│   ┌─────────────▼─────────────┐    ┌───────────────▼─────────────┐         │
│   │  pi-agent-core            │    │  MCP client                 │         │
│   │  (Agent, events, tools)   │    │  (pi-mcp-adapter or raw     │         │
│   │                           │    │   @modelcontextprotocol/sdk)│         │
│   └─────────────┬─────────────┘    └───────────────┬─────────────┘         │
│                 │                                  │                        │
│   ┌─────────────▼─────────────┐                    │                        │
│   │  pi-ai (LLM providers)    │                    │                        │
│   └───────────────────────────┘                    │                        │
│                                                    │                        │
│   ┌────────────────────────────────────────────────┼─────────────────────┐ │
│   │  Persistence: SQLite (problems, sessions,      │  Testcase sandbox   │ │
│   │  snapshots, test_runs, agent_turns,            │  (Node worker /     │ │
│   │  replay_events, transcript_messages)           │  language-specific) │ │
│   └────────────────────────────────────────────────┴─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
                                          External: LLM provider
                                          (Anthropic API, etc.)
```

### Layer responsibilities

| Layer | Responsibility | Owns |
|---|---|---|
| **Buddy MCP (external)** | Editor state access | Active buffer, cursor, diagnostics |
| **MCP client (in backend)** | Bridge MCP tools → Pi tools | Connection lifecycle, tool registration, schema translation |
| **`pi-agent-core`** | Agent runtime | LLM streaming, tool execution loop, event emission, context transformation |
| **`pi-ai`** | Provider abstraction | LLM API calls, cost tracking, OAuth flows |
| **AgentOrchestrator (ours)** | Per-session glue | Pi `Agent` lifecycle, pedagogy gate, persistence fan-out, WS broadcast |
| **SessionService (ours)** | Session lifecycle | Start/end/resume, replay event ordering, snapshot correlation |
| **TestcaseService (ours)** | Testcase domain | Run testcases, persist results tied to snapshot IDs |
| **ProblemService (ours)** | Problem catalog | Problems, starter code, visible/hidden testcases |
| **Persistence (ours)** | Durable store | SQLite for v1; JSONL append log for replay |
| **HTTP/WS (ours)** | Transport | REST for CRUD; WS for live event stream |
| **React UI (separate track)** | Render | No agent runtime in browser |

---

## 4. Pi component deep-dive

### 4.1 `pi-ai` — LLM provider layer **[locked]**

Wraps ~20 providers behind a unified interface with token + cost tracking and provider handoff. Tools are defined with TypeBox schemas. ([pi-ai README][pi-ai-readme])

```ts
import { getModel, Type, Tool } from "@earendil-works/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-6");
```

**For Algopeeps:** start Anthropic-only. Keep model selection per-session in case we want Haiku-vs-Sonnet experiments later.

### 4.2 `pi-agent-core` — agent runtime **[locked]**

Stateful `Agent` class with event subscription, tool calls, parallel/sequential execution, and pedagogy-friendly hooks. ([pi-agent-core README][pi-agent-readme])

Key features we will lean on:

- **Event stream:** `agent_start`, `turn_start`, `message_start/update/end`, `tool_execution_start/update/end`, `turn_end`, `agent_end`. The `message_update` events carry assistant deltas. We persist every event to the replay log and fan out subsets to WS clients.
- **Custom `AgentMessage` types** via TypeScript declaration merging. Lets us add `problem_card`, `hint_offered`, `testcase_run`, etc. as first-class context messages without polluting LLM input. The `convertToLlm` function strips them before each LLM call.
- **`transformContext`** for compaction on long sessions.
- **`beforeToolCall` hook** — our **pedagogy gate** lives here (block "show solution" tool until hint level threshold met).
- **Tool `terminate: true`** — used by `testcase.run` when a critical failure should pause the agent for student review before continuing.
- **Per-tool `executionMode`** — pedagogy tools sequential, observation tools parallel.
- **`sessionId`** — passed through for provider prompt caching.

```ts
import { Agent } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  initialState: {
    systemPrompt: socraticPrompt,
    model: getModel("anthropic", "claude-sonnet-4-6"),
    tools: [...buddyTools, ...testcaseTools, ...problemTools, ...hintTools],
    messages: [],
  },
  convertToLlm: algopeepsConvertToLlm, // strips problem_card, hint_offered, etc.
  transformContext: pruneByTokenBudget,
  beforeToolCall: pedagogyGate,
  sessionId,
});

agent.subscribe(async (event) => {
  await replayLog.append(sessionId, event);
  ws.broadcast(sessionId, projectForUi(event));
});
```

### 4.3 `pi-mcp-adapter` — MCP client **[open: integration mode]**

Token-efficient adapter that exposes a single `mcp()` tool to the LLM instead of dumping every MCP tool definition into the system prompt. Supports stdio, HTTP, and SSE transports; OAuth (authorization_code + client_credentials); lazy server connections; metadata caching for offline discovery; per-server `lifecycle` and `idleTimeout`; `directTools` to promote selected tools to first-class. Reads `mcp.json` from layered config locations. ([pi-mcp-adapter package page][pi-mcp-adapter])

**Configuration shape (we will adopt this format regardless of integration mode):**

```jsonc
// algopeeps backend: config/mcp.json
{
  "mcpServers": {
    "buddy": {
      "command": "buddy-mcp",
      "args": [],
      "lifecycle": "keep-alive",
      "directTools": ["buffer.read", "buffer.cursor", "buffer.diagnostics"]
    }
  },
  "settings": {
    "toolPrefix": "short",
    "idleTimeout": 30
  }
}
```

**Integration mode — to be decided after reading adapter source:**

- **Mode α (preferred if exposed):** Programmatic — call adapter's tool factory from inside `AgentOrchestrator`. Tools register on the Pi `Agent`. `mcp.json` is read by the adapter as documented.
- **Mode β (fallback):** Adapter is `ExtensionAPI`-bound. We embed a minimal `pi-coding-agent` host headlessly, register the adapter, and bridge its tool registry into our `pi-agent-core` `Agent`. Heavier than Mode α; only worth it if it preserves config compatibility and OAuth flows we'd otherwise rewrite.
- **Mode γ (last resort):** Write our own 300–600 LOC realistic budget bridge using `@modelcontextprotocol/sdk` directly. Lose the proxy-tool token savings but keep architectural simplicity. Re-use `mcp.json` format manually.

**Why this matters:** Buddy will likely expose a small fixed tool set (~5–10), so Mode γ's "no proxy, every tool first-class" is acceptable token-wise. The proxy-tool benefit shines when you're plugging into many MCP servers with hundreds of tools. **For Algopeeps v1, Mode γ is acceptable**; Mode α is preferred if available cheaply.

### 4.4 What Pi does NOT give us

Important to be explicit — these stay our responsibility:

- **Pedagogy state machine** (hint levels, misconception model, student answer log).
- **Testcase execution sandbox** (run user code against testcases, capture stdout/stderr/exit/timing).
- **Problem catalog** (problem statements, starter code, hidden testcases).
- **Snapshot correlation** (which buffer state did the agent see for turn N).
- **Replay timeline** (ordering snapshots, turns, testcase runs into a scrubable timeline).
- **Auth / multi-user** (deferred — single-user v1 per current scope).

---

## 5. Custom message types and the LLM boundary

**[open: exact set, but pattern is locked]**

Pi's `AgentMessage` declaration merging is the cleanest place to model Socratic context. Sketch:

```ts
declare module "@earendil-works/pi-agent-core" {
  interface AgentMessageMap {
    problem_card: { problemId: string; statement: string; constraints: string };
    snapshot_ref: { snapshotId: string; bufferDigest: string; capturedAt: string };
    hint_offered: { level: 1 | 2 | 3; text: string; tied_to_misconception?: string };
    testcase_run: { runId: string; snapshotId: string; results: TestcaseResult[] };
    student_answer: { in_response_to: string; text: string };
  }
}
```

`convertToLlm` decides which of these become real LLM `user`/`assistant`/`toolResult` messages. For example:

- `problem_card` → injected as `system`/`user` block at session start, then suppressed thereafter.
- `snapshot_ref` → suppressed; metadata only, attached to subsequent messages for replay correlation.
- `hint_offered` → kept as assistant turns (LLM should know it already offered hint level 2).
- `testcase_run` → summarized to a compact `user` message for the LLM ("tests: 3 passed, 1 failed: dup_input expected [0,1] got [0,0]"); full record kept for replay.
- `student_answer` → user message.

This keeps replay fidelity (every event preserved) decoupled from LLM context (only what's pedagogically relevant).

---

## 6. Pedagogy gating via `beforeToolCall`

**[open: full ruleset, but pattern is locked]**

```ts
const pedagogyGate: Agent["beforeToolCall"] = async ({ toolCall, args, context }) => {
  const state = pedagogyStateFor(context);

  if (toolCall.name === "hint.reveal_solution" && state.hintLevel < 3) {
    return {
      block: true,
      reason: `hint level ${state.hintLevel}; offer level ${state.hintLevel + 1} first`,
    };
  }

  if (toolCall.name === "testcase.run_hidden" && !state.studentRequestedTests) {
    return { block: true, reason: "hidden tests run only on student request" };
  }

  return { block: false };
};
```

Block reasons surface as `toolResult` messages, so the LLM gets a structured nudge about why a tool wasn't allowed — and can adapt the next turn. This is the pedagogy lever Codex flagged as risk #2 ("Socratic agents will collapse into prompt templates without backend-owned state"). The hook is the enforcement point.

---

## 7. Replay event log

**[open: storage format, locked: that it exists]**

Pi's event stream IS the replay log. We append every emitted event to a per-session JSONL file (matching `pi-coding-agent`'s session format for compatibility, [Pi sessions docs][pi-coding-agent-readme]), and mirror structured rows into SQLite for query.

Tables (sketched, schema doc separately):

- `sessions(id, problem_id, started_at, ended_at, outcome, hint_count)`
- `code_snapshots(id, session_id, captured_at, content, source_event)`
- `agent_turns(id, session_id, turn_index, snapshot_id, role, content, hint_level)`
- `tool_calls(id, turn_id, tool_name, args, result, blocked, block_reason)`
- `test_runs(id, session_id, snapshot_id, requested_by, results_json, passed, failed)`
- `replay_events(id, session_id, seq, ts, event_type, payload_json)`

Replay UI scrubs by `seq`; on each tick the UI requests the latest snapshot at-or-before that seq plus the most recent agent_turn and test_run. No magic — just ordered events with snapshot refs.

---

## 8. Migration path

**[locked sequence; specific PR boundaries [open]]**

### Phase 0 — Spike (1–2 days)
- Build a minimal Node service that instantiates `pi-agent-core` `Agent` with one mock tool, streams events to stdout.
- Confirm `pi-mcp-adapter` integration mode (α / β / γ) by reading source. **Decision gate.**
- Confirm Buddy MCP transport.
- **Deliverable:** Hello-world agent + decision on MCP integration mode written back into this doc.

### Phase 1 — Backend skeleton
- Fastify/Hono HTTP + WS server.
- SQLite schema migrated.
- AgentOrchestrator with one session at a time, no pedagogy yet.
- Buddy bridge (registers `buffer.read` / `buffer.cursor`).
- One trivial Socratic prompt; no hints, no testcases.
- **Deliverable:** Connect via WS, prompt the agent, see it call `buffer.read`, see streamed response.

### Phase 2 — Domain
- ProblemService + seed problem catalog (3–5 problems).
- TestcaseService with sandbox (Node `vm` for JS, `child_process` for Python/Go).
- Custom `AgentMessage` types wired with `convertToLlm`.
- `testcase.run` tool + persistence.
- **Deliverable:** Pick a problem, write code in Neovim, see agent reference your buffer, run tests, get verdict.

### Phase 3 — Pedagogy
- Hint levels, misconception tagging, `beforeToolCall` gate.
- Pedagogy state machine wired into agent context.
- **Deliverable:** Agent uses Socratic method, refuses to leak solutions early.

### Phase 4 — Replay
- JSONL event log + replay query API.
- React UI consumes it (UI work owned by `uiux` track; backend ships the API).
- **Deliverable:** Scrubable replay of a completed session.

### Phase 5 — Polish
- Multi-session concurrency.
- Cost dashboard.
- Provider handoff experiments.
- Optional: revisit MCP Apps once it has wider host support.

---

## 9. Risks (carried from Codex audit)

**[locked]**

1. **Mistaking buffer access for session intelligence.** Buddy gives buffers; doesn't know which snapshot mattered. Mitigated by AgentOrchestrator deciding when to capture (debounced + on tool call), and `code_snapshots.source_event` recording the trigger.
2. **Treating Socratic agents as prompt templates.** Mitigated by `beforeToolCall` gate + pedagogy state machine + custom `AgentMessage` types. The hook is the enforcement point; without it, this collapses to "friendlier feedback dump."
3. **Testcase execution as a UI feature.** Mitigated by `test_runs` table tied to `snapshot_id` and `agent_turn_id` from day one. Replay can answer "what failed, under which code, and what changed after."

Pi-specific risks added:

4. **0.x API churn.** Pi is actively developed (latest commit today, ([Pi releases][pi-releases])). Pin minor versions; revisit on each minor bump. Acceptable for a personal project; would not be acceptable for production.
5. **`pi-mcp-adapter` extension vs library question.** The integration-mode decision (§4.3) is the single largest unknown; misjudging it could mean a chunk of rework. Mitigated by spiking this in Phase 0.

---

## 10. References

| # | Source | Used for |
|---|---|---|
| 1 | [Pi monorepo README — `earendil-works/pi`][pi-readme] | Overall toolkit scope, package list |
| 2 | [`pi-agent-core` README][pi-agent-readme] | Event stream, custom message types, `beforeToolCall`, `transformContext` |
| 3 | [`pi-ai` README][pi-ai-readme] | Provider list, tool definitions, cross-provider handoff |
| 4 | [`pi-coding-agent` README][pi-coding-agent-readme] | Extension model, sessions JSONL format, `mcp.json` config layering |
| 5 | [`pi-mcp-adapter` package page on pi.dev][pi-mcp-adapter] | Adapter API, transport types, config shape, `directTools`, `lifecycle` |
| 6 | [`pi-mcp-adapter` source — `nicobailon/pi-mcp-adapter`][pi-mcp-adapter-repo] | To be read in Phase 0 to decide integration mode α/β/γ |
| 7 | [Model Context Protocol — modelcontextprotocol.io][mcp-spec] | MCP transport semantics, JSON-RPC framing, OAuth flows |
| 8 | [`@modelcontextprotocol/sdk` (TypeScript)][mcp-ts-sdk] | Fallback path (Mode γ) for MCP client |
| 9 | [Codex architectural audit (this session, 2026-05-08)][codex-audit-summary] | Throwaway %, risk list, target architecture sketch |
| 10 | [Pi releases][pi-releases] | Version cadence, churn awareness |
| 11 | [Agent Skills standard — agentskills.io][agent-skills] | Optional path for packaging Socratic personas as Pi skills later |
| 12 | [MCP Apps spec — `modelcontextprotocol/ext-apps`][mcp-apps] | Deferred; revisit when host support broadens |

---

## 11. Change log

- **2026-05-09 — v1 (this doc).** Initial draft. Architecture locked at boundary level. Phase-0 spike pending to resolve `pi-mcp-adapter` integration mode and Buddy transport.
- **2026-05-09 — v1.1.** Corrections from manager-peer review (advisor-checked):
  - Custom MCP bridge LOC estimate revised from "~150" → "300–600 once reconnection, error mapping, and capability negotiation are handled." Don't anchor scope on the smaller figure.
  - **Spike discipline:** Phase-0 spike items must not be silently dropped under deadline pressure. They are blocking decisions, not nice-to-haves.

[pi-readme]: https://github.com/earendil-works/pi
[pi-agent-readme]: https://github.com/earendil-works/pi/blob/main/packages/agent/README.md
[pi-ai-readme]: https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
[pi-coding-agent-readme]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md
[pi-mcp-adapter]: https://pi.dev/packages/pi-mcp-adapter
[pi-mcp-adapter-repo]: https://github.com/nicobailon/pi-mcp-adapter
[pi-releases]: https://github.com/earendil-works/pi/releases
[mcp-spec]: https://modelcontextprotocol.io/docs/getting-started/intro
[mcp-ts-sdk]: https://github.com/modelcontextprotocol/typescript-sdk
[mcp-apps]: https://github.com/modelcontextprotocol/ext-apps
[agent-skills]: https://agentskills.io
[codex-audit-summary]: ../README.md
