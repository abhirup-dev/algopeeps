# elkdraw notes

Facts a later agent needs: structure, pinned versions, gotchas, timings. The
reference sections come first; `## Log` at the end has one entry per phase or
task, newest last. Agents append their own log entry (see `AGENTS.md`).

## Package graph

```
core  <- backends/excalidraw, backends/fake, sidecar, adapters/mcp, app (types only)
sidecar <- backends/excalidraw (Playwright stays in sidecar's own package)
adapters/server <- core, backend-excalidraw, backend-fake, mcp
adapters/cli    <- core, mcp (spawns server/src/main.ts by path; no import)
test/parity, eval <- anything
```

Enforced three ways: each package's `package.json` (Bun's isolated linker only
links declared deps, so undeclared imports do not resolve), `tsconfig.json`
project references (`tsc -b` fails on cycles and on files outside a project),
and `no-restricted-imports` in `eslint.config.js` (`allowedDeps`). Change all
three together. `adapters/mcp` stays core-only for good: server depends on it.

Core has two entries (`core/package.json` `exports`): `@elkdraw/core` =
contracts + `json.ts` (zod only), `@elkdraw/core/engine` = `src/engine/`
(mermaid adapter, elkjs layout, lint engine, later libavoid, and skeleton,
apply, diff, place, merge, lift, print, router, families). The deep-import
lint rule exempts exactly `@elkdraw/core/engine`; `app`, `adapters/mcp` and
`adapters/cli` are banned from it, so Vite never bundles an engine into the
app (mermaid touches `window` at import; libavoid is LGPL WASM, design §15.3).

## TypeScript

- TypeScript is pinned `~6.0.3`: typescript-eslint 8.70 requires
  `typescript <6.1.0`, so 7.x is out until typescript-eslint supports it.
- Every package is `composite` with `emitDeclarationOnly` into `dist/`
  (gitignored). Packages export `./src/index.ts`; Bun and Vite run source,
  `tsc -b` maps imports to the referenced project's `.d.ts`.
- `@total-typescript/ts-reset` is loaded once, via `types` in
  `tsconfig.base.json`, so it applies to every package (a `.d.ts` import in core
  would only reach core's own program).

## Dependencies

New dependencies go through the orchestrator; do not run `bun add` on a task
branch (`AGENTS.md`, Dependencies). Every dependency is listed here.

| Package                                               | Where                                              | Version  | Why                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| zod                                                   | core, adapters/mcp, server, cli; test/parity (dev) | ^4.6.5   | Schemas for IR, payloads and tool inputs; v4 has `z.toJSONSchema` (verified).                    |
| elkjs                                                 | core                                               | ^0.12.0  | ELK layout engine; ships `.d.ts` (`lib/main.d.ts`) for the IR types.                             |
| safe-stable-stringify                                 | core                                               | ^2.5.0   | Deterministic JSON for the event log.                                                            |
| @modelcontextprotocol/server                          | adapters/mcp, adapters/server                      | 2.0.0    | MCP server SDK, same as canvas; peer `zod ^4.2.0`.                                               |
| @modelcontextprotocol/client (dev)                    | adapters/mcp, server, eval                         | 2.0.0    | MCP client for tests and the eval harness.                                                       |
| commander                                             | adapters/cli                                       | ^15.0.0  | CLI parsing.                                                                                     |
| @commander-js/extra-typings                           | adapters/cli                                       | ^15.0.0  | Inferred option/argument types for commander.                                                    |
| mermaid (dev)                                         | test/parity                                        | 11.17.2  | Parses the Mermaid fixtures in the parity suite; pinned to the `getData()` version (design §16). |
| happy-dom (dev)                                       | test/parity                                        | ^20.14.5 | DOM `Window` so Mermaid's parser runs under `bun test`.                                          |
| react, react-dom                                      | app                                                | ^19.3.0  | Browser canvas UI.                                                                               |
| @excalidraw/excalidraw                                | app, backends/excalidraw                           | 0.18.1   | Canvas component (app) and scene/element types (backend); same as canvas/app.                    |
| vite (dev)                                            | app                                                | ^8.3.1   | App dev server and build; Vite 8 + Excalidraw 0.18.1 build verified.                             |
| @vitejs/plugin-react (dev)                            | app                                                | ^6.1.1   | React transform for Vite 8 (its extra peers are optional).                                       |
| @types/react, @types/react-dom (dev)                  | app                                                | ^19.3.0  | React types.                                                                                     |
| playwright (dev)                                      | sidecar, eval                                      | 1.63.0   | Headless browser; matches the cached chromium-1243, so no browser download.                      |
| typescript (dev)                                      | root                                               | ~6.0.3   | `tsc -b`; capped by typescript-eslint's peer range.                                              |
| eslint, @eslint/js (dev)                              | root                                               | ^10.11.0 | Linter and its recommended JS rules.                                                             |
| typescript-eslint (dev)                               | root                                               | ^8.70.1  | strictTypeChecked + stylisticTypeChecked.                                                        |
| eslint-config-prettier (dev)                          | root                                               | ^10.1.8  | Turns off style rules that fight Prettier.                                                       |
| eslint-plugin-react-hooks (dev)                       | root                                               | ^7.1.1   | Hooks and React Compiler rules for app/.                                                         |
| @eslint-community/eslint-plugin-eslint-comments (dev) | root                                               | ^4.8.1   | Inline disables must carry a description; no blanket disables.                                   |
| globals (dev)                                         | root                                               | ^17.12.0 | Browser/node globals for ESLint.                                                                 |
| prettier (dev)                                        | root                                               | ^3.9.9   | The only formatter.                                                                              |
| @types/bun (dev)                                      | root                                               | ^1.4.2   | Bun runtime and `bun:test` types.                                                                |
| @total-typescript/ts-reset (dev)                      | root                                               | ^0.6.1   | `JSON.parse`/`Response.json()` return `unknown`; `.filter(Boolean)` narrows.                     |

## MCP HTTP transport

`@modelcontextprotocol/server@2.0.0` ships a web-standard Streamable HTTP
transport: `WebStandardStreamableHTTPServerTransport`, exported from the package
root, with `handleRequest(req: Request, options?): Promise<Response>`. It plugs
straight into `Bun.serve({ fetch })`, so no express. The same root export also
has `createMcpHandler` (per-request handler factory) and
`validateHostHeader` / `localhostAllowedHostnames` for DNS-rebinding checks.

## Sidecar and elkjs

`@elkdraw/sidecar` (`sidecar/src/index.ts`): `new Sidecar(dist = app/dist)`,
`start()` (idempotent; `Bun.serve` on a random 127.0.0.1 port serves the bundle,
headless Chromium loads it and waits for `.excalidraw`), `measure(elements) ->
Record<Id, Box>` (core `Box`), `snap(bbox, scale = 1) -> Uint8Array` (PNG), `close()`. P0.7: both calls
are stubs (100x40 box per element at the origin; a 1x1 PNG), but they go through
`page.evaluate` and zod validates inputs before the page and outputs after it.

- The app has no headless mode. The sidecar serves no `/ws`, so the app's sync
  client retries every second in the background; harmless for measuring. A
  `?headless=1` flag in `app/` would silence it if that ever matters.
- Timings (M-series Mac, Bun 1.4.2, chromium-1243): cold `start()` ~0.25 s
  (bundle already built); warm `measure`/`snap` 0.3-3 ms. The e2e asserts < 2 s.
- Run: `bun run --cwd elkdraw/sidecar test:e2e` (builds the app, then
  `bun test ./src/sidecar.e2e.ts`). Not part of `check`: it needs `app/dist`.

elkjs under Bun (probe B1, `sidecar/src/elk.test.ts`, runs in `check`): the
bundled build throws (`new _Worker` undefined). This works:

```ts
import ELK from "elkjs/lib/elk-api.js";
const elk = new ELK({
  workerUrl: Bun.resolveSync("elkjs/lib/elk-worker.min.js", import.meta.dir),
});
await elk.layout(graph); // elk-api's default factory: new Worker(url), Bun's Web Worker
elk.terminateWorker();
```

3-node layered layout: ~90 ms including worker start.

## Log

### Phase 0: scaffolding (2026-09-26)

Run as one branch per task, `wt switch --create elkdraw/p0.N-<slug> --base
abhirup/canvas --no-cd`, each merged `--no-ff` into `abhirup/canvas` by the
orchestrator. Every later-phase dependency was installed up front in P0.1, so
later tasks should not need `bun add`.

- P0.1 workspace: ten packages, composite projects, strict tsconfig
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`), the lint baseline, `parseJson` / `safeParseJson`.
- P0.11 CI: `.github/workflows/elkdraw-check.yml`; `.githooks/pre-commit` runs
  a check only for the tree whose files are staged. Hooks stay opt-in.
- P0.4 app: Excalidraw shell as a static Vite bundle; syncs over same-origin
  `/ws` (override `?ws=` or `VITE_ELKDRAW_WS`); remote deltas apply with
  `captureUpdate NEVER`; fonts ship under `/fonts`.
- P0.2 contracts: zod schemas and types in `core/src/contracts/`, JSON Schema
  in `core/schemas/` (stale files fail a test). See `CONTRACTS.md`.
- P0.7 sidecar: Chromium skeleton and the elkjs-under-Bun probe (above).
- P0.10 fake backend: in-memory `BackendAdapter` (NeutralScene scene, deep
  zones, no bindings, fixed char-width measure); `test/parity` snapshots.
  A changed snapshot always fails; a missing one fails only when `CI=true`.
- P0.5 server: one Bun process serves `app/dist`, `/ws`, REST (`/api/status`,
  `/api/shutdown`, `/api/tools/:name`) and MCP at `/mcp` behind Host/Origin
  checks; per-session `events.jsonl` with keyframes, replayed on start.
- P0.8 fixtures: dogfood scenes with defect manifests, task and Mermaid
  samples.
- P0.3 surface: 14 MCP tools with zod schemas and `NOT_IMPLEMENTED` stubs,
  the `elkdraw` CLI (flags derived from the same schemas), `SURFACE.md`.
- P0.6 portless: `bun run --cwd elkdraw dev` serves each worktree at
  `https://<branch-tail>.elkdraw.localhost:1355` (README).
- P0.5b wiring: the server uses `@elkdraw/mcp`; REST maps `ToolError` to
  400/404/501 (else 500 `INTERNAL`); stdio forwards to the running server and
  replies `UNREACHABLE` when it is down; cli no longer depends on server.
- P0.12 agent rules: `AGENTS.md`. Checked: `dev` in a linked worktree prints
  the branch URL and `/api/status` there reports the branch; `curl` needs
  `--cacert ~/.portless/ca.pem`, Bun/Node need `NODE_EXTRA_CA_CERTS`.
- Pending at the time of writing: P0.9 eval harness, P0.13 registration docs
  and skill, P0.14 exit smoke.
- P0.14 exit smoke: `bun run --cwd elkdraw smoke:p0` (`scripts/smoke-p0.sh`
  sets `NODE_EXTRA_CA_CERTS`, then runs `eval/src/smoke-p0.ts`). It creates
  `elkdraw/smoke-p0-b` off the current branch (`wt switch --create --no-hooks`),
  runs `CI=true check` in both worktrees (one after the other), starts `dev` in
  both, and per URL checks `/api/status`, MCP `listTools` + `status` (branch)
  - `lint` (`NOT_IMPLEMENTED`), CLI `status`, and the app pill
    `<branch> · open`; screenshots land in `eval/test-results/`. Teardown (also
    on SIGINT/SIGTERM) stops both servers, the browser, and `wt remove -D -f
--foreground` drops the worktree and branch. Passed 2026-09-26 in ~45 s
    (checks ~20 s each, both app builds included). Playwright's Chromium does
    not trust portless's CA, so the page opens with `ignoreHTTPSErrors`; the
    URLs print at the end for opening by hand while a `dev` runs.

### Phase 0 review fixes B3, B4 (2026-09-26)

- B3: edge `backends/excalidraw -> sidecar` added in `package.json`, tsconfig
  references and `allowedDeps`. The sidecar's local `BBox`/`Box` schemas are
  gone: it uses core `Box`, and `measure` returns `Record<Id, Box>` (was an
  array of boxes with `id`). Bead 1.3's Owns should read `elkdraw/sidecar/**`.
- B4: `@elkdraw/core/engine` entry added (empty barrel, `core/src/engine/`).
  Lint verified with scratch files: app, mcp and cli importing it error;
  server and backends/excalidraw pass. `app/dist` after `vite build` has no
  elkjs (grep for `elkjs`, `elk-worker`, `org.eclipse.elk`: 0 files).

### 1.1 Skeleton input schema (2026-09-26)

- `core/skeleton/schema.ts`: `SkeletonInput` (`{elements}`, the `add` input),
  `SkeletonElement`, `SkeletonId`, `validateSkeleton(input)` →
  `{ok, value} | {ok: false, errors: string[]}`, `skeletonErrors(zodError)`.
  Re-exported from `@elkdraw/core` (zod only, so the root entry, not
  `engine`: `adapters/mcp` needs it). Hand-written zod; core does not depend on
  `@excalidraw/excalidraw`. No transforms, so `z.toJSONSchema` works.
- Strict per type (`z.discriminatedUnion("type")` of `strictObject`s: a plain
  union loses per-field paths): rectangle, ellipse, diamond, text, arrow, line,
  frame. Image, freedraw, embeddable, iframe, magicframe left out. Text on
  shapes is `label`, bindings are `start`/`end: {id}` (no inline-created
  ends). Store-owned fields (seed, version, versionNonce, updated, index,
  isDeleted, boundElements, containerId, lastCommittedPoint) are rejected.
  `allow` uses the contract `Allow`, so 1.0's new lint codes flow in.
- Ids required, pattern `^[a-z0-9][a-z0-9._/#@:>-]*$` (rejects Excalidraw's
  mixed-case nanoids; a lowercase random id still passes). Duplicate ids are
  reported at `elements[i].id`, also when other errors exist (`when`).
  References (`start/end.id`, `children`) are not resolved here: they may
  name elements already on the canvas; that is apply's job (1.2).
- Errors: one `path: message` line each; `unrecognized_keys` split into one
  `path.key: unknown key` line per key.
- `core/tsconfig.json`: `rootDir` `src` → `.`, `include` += `skeleton`
  (the bead's Owns is `core/skeleton/**`, outside `src`).
- Negative fixture `core/skeleton/negative.jsonl` is JSONL so Prettier leaves
  it at 20 lines (JSON would be reformatted to ~60).
- Dogfood scenes are wire scenes, not skeleton input: raw, they fail. The test
  projects them (bound text → `label`, bindings → `start`/`end`, store fields
  dropped by name) and the projection validates. Keys Excalidraw ignores are
  dropped by name and counted: `fontSize` on non-text (yct 3, batch 26, most
  disagreeing with the label's fontSize) and `elbowed` (yct 20, batch 21).
