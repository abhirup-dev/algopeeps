# Agent-native diagramming: how to package an agent-first Excalidraw

Research date 2026-09-25. Builds on `agent-canvas-landscape.md` (landscape up to 2026-09-19),
`collab-canvas-invariants.md` (edit stability, ownership, undo) and `custom-canvas-options.md`
(Excalidraw ceiling, fork cost, tldraw licence). Those findings are linked, not repeated.
Items marked **[unverified]** come from a secondary source or could not be checked first-hand.

---

## TL;DR

1. **The big vendors converged in 2026 on one shape: a small surface, one expressive language,
   stable ids, and search before read.** Miro deleted its `diagram_*`/`layout_*`/`context_*`
   tools for "read and write SVG with `data-miro-id`, applied as a diff". tldraw offline dropped
   discrete actions for code against the live Editor. Figma splits reads into a sparse outline
   plus drill-down calls. Excalidraw+ ships `search_scene_content` + `edit_scene_content`. Raw
   element JSON as the agent's working format is the thing everyone is moving away from.
2. **The closest competitor is tldraw offline** (July 2026). It is a free local desktop app with
   a local HTTP API and an installed skill for Claude Code, Codex, Cursor and Gemini, and it runs
   in code mode. It is **not open source** and has no review/comment loop for the agent.
3. **"Agent can draw" is commodity, so the differentiator is pair diagramming.** That means
   Crit-style comments anchored to elements or regions, agent *proposals* placed beside human
   work instead of overwriting it, and perception the agent controls (crop, lint, diff). The
   verdict is a real but narrow gap: worth building as an open, local-first "Crit for diagrams",
   not a defensible business against tldraw offline, Excalidraw+, Figma and Miro.
4. **Existing Excalidraw MCPs.** Ignore the official `excalidraw-mcp` as a dependency: no
   commits since 2026-03-24, ext-apps 0.4, SDK 1.25, and no LICENSE file. We already copied its
   patterns. Make ours **adapter-compatible** with `yctimlin/mcp_excalidraw`, which is active
   (v2.0.0 on 2026-08-19, MIT). Accept its tool and command names as aliases, and keep vendoring
   its pure modules. Don't fork it: its single global canvas and full-scene sync conflict with
   our sessions and ownership.
5. **The two local skills already teach "describe → screenshot → fix → re-screenshot", plus a
   7-point checklist and a design rubric.** The checklist should become `lint` codes. The render
   script should become the headless renderer, and the rubric a `critique` template. What stays
   as prose goes into a shipped skill.
6. **Perception evidence is thin but points one way.** Deterministic lints and precise,
   actionable feedback help most. Crops help small details. Set-of-mark labels help modestly,
   and only on dense scenes. **No published eval measures crops or set-of-marks on diagram
   editing.** Rank: lints > text scene graph > crop > set-of-mark > full screenshot.
7. **A region screenshot is doable on stock 0.18.1, but not with one call.** Passing a subset of
   elements to `exportToCanvas` renders only those elements; it does not crop. Do bbox →
   `elementsOverlappingBBox` → export with known padding → crop with `drawImage` → draw marks on
   the 2D canvas. **Headless render is the first real gap**: today `canvas_screenshot` fails with
   "no view connected", and every prior tool (yctimlin, the official MCP) also needs a browser
   tab.
8. **Actions should work at three levels:** semantic patch ops with relative placement, a graph
   DSL laid out by ELK, and raw elements as the escape hatch. Use elbowed bound arrows
   (`elbowed: true` plus `FixedPointBinding` exist in 0.18.1) so the agent never computes arrow
   points.
9. **Ship both a CLI and an MCP as thin adapters over one engine.** The CLI is primary for coding
   agents: files instead of image bytes, pipes, a blocking `wait`. The MCP is for chat hosts, at
   10 tools. Keep code mode as a later option; its sandboxing cost is real.
10. **Excalidraw headroom is good for perception, presence and comments, weak for custom
    shapes.** No custom element types without a fork. MIT covers the code; "Excalidraw" is a
    trademark application, so don't put it in the product name.

---

## 1. Landscape: what changed since 2026-09-19, and the last 6 months

Rows already covered in `agent-canvas-landscape.md` §1 are only re-listed where something new
matters.

| Tool (date) | What the agent sees | What it can do | How it verifies itself |
|---|---|---|---|
| **tldraw offline** (launched 2026-07; harness post 2026-09-22) | Viewport bounds, a screenshot, and shape data "behind tool calls, pulled on demand" (RLM-inspired) | **Writes code against the live Editor** (CodeAct / Code Mode); scripts can persist in the `.tldraw` file; local HTTP API (`/exec`, `/api/search`) | Canvas **lints** (e.g. overlapping text); `api.getScreenshot` → PNG path; `script-status` digest check. The skill says: "Agents are far better at scripting the canvas than at drawing on it" |
| **Miro MCP, Canvas tools** (legacy tools removed by 2026-09-14) | `canvas_search` (with an overview mode), then `canvas_read_as_svg`; every item carries a stable `data-miro-id` | `canvas_create_from_svg`, and `canvas_update_from_svg` **applied as a diff**; diagrams are Mermaid inside the SVG | none published |
| **Figma MCP** (2026) | `get_metadata`: a sparse XML outline (ids, names, types, positions, sizes), then `get_design_context` per node; `get_screenshot` of the selection | `use_figma` (a general writer), `generate_diagram` (Mermaid → FigJam) | Screenshot; docs say "recommended to keep on", off only to save tokens |
| **Excalidraw+ MCP** (public beta) | `search_scene_content` (fuzzy text match, returns only the matching nodes); full payload only via `get_scene_content` | `edit_scene_content`: add/update/delete with label expansion, bound-text handling, `tempId` for same-request references | n/d |
| **Official `excalidraw-mcp`** (MCP App) | none; generation only | `read_me` cheat sheet + `create_view` streamed with camera; checkpoints | none |
| **draw.io MCP** (2026-02-03, JGraph) | the diagram XML | `create_diagram` (XML/CSV/Mermaid); `search_shapes` over 10k+ shapes returns exact style strings | none |
| **Eraser MCP** (2026) | Eraser diagram-as-code | generate, search, read, update, with style presets | none |
| **mcp_excalidraw v2** (~2.4k★) | `describe_scene` + `get_canvas_screenshot` | 26 tools; CLI + skill recommended over MCP for coding agents | Screenshot, but "**image export requires a browser**; headless mode planned" |
| **aiworx-excalidraw-plugin** (2026) | measured layout | ELK layout, mermaid → nodes/edges, real text metrics | **Headless render via system Chrome** + `check.js` gates |
| **excalidraw-cli** (swiftlysingh) | none | `(Start) -> [Process] -> {Decision?}` DSL → ELK → `.excalidraw`, PNG/SVG export | none |
| **Crit** (2026) | Markdown/code diff/live page/HTML preview, line-anchored | `crit comment file:42 '…'`, `crit comments`, `--json`, a `/crit` loop that waits for review; `agent_cmd` gets the comment on stdin and its stdout becomes the reply | The human's review is the verifier |

Research added since the last report:

| Work | Date | Finding for us |
|---|---|---|
| [DrawingBench](https://arxiv.org/abs/2512.01174) | 2025-12 | External structured feedback: **+3.2% on average, up to +32.8%** on complex scenes. Explicit, verifiable criteria gave **100%**. "External oversight [is] more reliable than self-correction." |
| [Imperfect Visual Verification (TikZ)](https://arxiv.org/abs/2606.15693) | 2026-04 | Visual verifiers reach **F1 ≤ 0.815**. Feedback added 11–20 perfect edits for a weaker model and +5 for Gemini-3. Feedback helps **only when it is precise, actionable, complete and grounded in the instruction.** |
| [Render-in-the-Loop](https://arxiv.org/abs/2604.20730) | 2026-04 | A naive render → look loop on off-the-shelf models is "suboptimal"; the gains needed training. Screenshots alone are not a silver bullet. |
| [See it. Say it. Sorted](https://arxiv.org/abs/2508.15222) | 2025-08 | A critic VLM proposes **qualitative, relational edits**; the authors say this beats "brittle numerical estimates". This supports relative-placement verbs. |
| [PlanarBench](https://arxiv.org/abs/2606.02010) | 2026-06 | Layout difficulty tracks **edge count (r = −0.85)**, not node count, and frontier models still fail. Delegate layout to an engine. |
| [SciDiagramEdit](https://arxiv.org/abs/2607.15272) | 2026-07 | Edits the **editable vector source** that "users can inspect and co-edit"; patch-and-merge; skills evolved from traces. |
| [OmniDiagram](https://arxiv.org/abs/2604.05514) | 2026-04 | Reward by **visual interrogation**: generate targeted questions about the render. This is the pattern for a `check` tool. |
| [MermaidSeqBench](https://arxiv.org/pdf/2511.14967) | 2025-11 | A dedicated NL→Mermaid benchmark exists; Mermaid is the model's default diagram language. |

### 1a. Existing Excalidraw MCPs and the local skills: audit and verdict

State checked with `gh api` and `npm view` on 2026-09-25.

| | **excalidraw/excalidraw-mcp** (official) | **yctimlin/mcp_excalidraw** |
|---|---|---|
| Activity | 5.4k★; **last push 2026-03-24**; v0.1.0 → v0.3.2 in 2026-02-04..09, nothing since. 59 open issues, including "modernize for 0.4.0" (#96, 2026-09-15), "Add tool get_comments" (#84), "agent-accessible image export" (#87), "Add MIT license file" (#83) | 2.5k★; **20 commits since 2026-03-25**, last 2026-09-08; npm 1.0.6 (04-04) → 1.1.0 (07-06, CLI-first) → **2.0.0 (08-19**, MCP 2026-07-28, export fidelity). 40 open issues |
| Stack | `@mcp-demos/excalidraw-server`, ext-apps ^0.4, SDK 1.25.2, Excalidraw ^0.18, Upstash Redis checkpoints | Express canvas server on :3000 + stdio MCP + browser frontend over WebSocket; in-memory store; no auth (binds 127.0.0.1) |
| Tool surface | `read_me`, `create_view` (streamed elements plus `cameraUpdate`/delete pseudo-elements); app-only `export_to_excalidraw`, `save_checkpoint`, `read_checkpoint` | 26 MCP tools (CRUD, `query_elements` with `bbox` since #76, align/distribute/group/lock, `describe_scene`, `get_canvas_screenshot`, mermaid, snapshots, `set_viewport` with `scrollToElementIds` since #86); a CLI that mirrors it (`add`, `apply {create,update,delete}`, `query --bbox`, `describe`, `screenshot`, `snapshot`, `mermaid`, `export`/`import` including Obsidian `.excalidraw.md`, `share`, `install-skill`) |
| Agent perception | **None**: the model never sees the result | `describe` (plain-text ids, positions, labels, connections) + **full-canvas** screenshot. No region, crop, lint or diff |
| Iteration loop | Regenerate from a checkpoint with delete markers | Draw → screenshot → update by id → screenshot (taught by the skill) |
| CLI | none | yes: JSON on stdout; exit codes 3 = canvas unreachable, **4 = browser tab required**; auto-starts the server |
| Licence | `"license": "MIT"` in package.json, **no LICENSE file** (#83, #92 open) | MIT |
| Human in the loop | Inline editing in fullscreen | Human edits the same canvas, but no ownership, no comments, and full-scene auto-sync (the skill documents duplicate bound-text side effects) |
| **Verdict** | **Ignore as a dependency.** Stale, pinned to old ext-apps/SDK, one view per call, Redis. Keep the patterns already copied (`read_me`, camera pseudo-element, checkpoint ids). Optionally alias `read_me` → `guide` and `create_view` → `edit` so prompts written for it still work | **Adapter-compatible**, not fork, not depend. Speak a superset of its tool and command names behind a `--compat yctimlin` flag, so its skill and evals run against our engine. Keep vendoring `normalize`/`geometry`/`describe` (MIT). A fork would inherit a single global canvas, full-scene sync and 40 issues; a dependency would couple us to port 3000 and its store |

Name mapping for the compat layer (hidden by default, to keep the tool list short):

| theirs | ours |
|---|---|
| `describe_scene` / `describe` | `describe` |
| `query_elements {bbox}` / `query --bbox` | `find 'in:…'` |
| `get_canvas_screenshot` / `screenshot` | `look viewport` |
| `create_element`, `batch_create_elements`, `update_element`, `delete_element`, `apply` | `edit` (L3 skeletons, or `{create,update,delete}` patch) |
| `align_elements`, `distribute_elements`, `group_elements` / `arrange …` | `edit` ops |
| `create_from_mermaid` / `mermaid` | `layout --dsl mermaid` |
| `snapshot_scene`, `restore_snapshot` | `snapshot` |
| `set_viewport` | `camera` |
| `read_diagram_guide`, `read_me` | `guide` |
| `create_view` (official) | `edit` + `camera` |

**Local skills** (read-only audit of `~/.config/skillshare/skills/`):

| | `excalidraw-skill` (yctimlin's bundled skill: SKILL.md 18 KB, cheatsheet, 5 evals) | `excalidraw-diagram` (SKILL.md 24 KB, palette, templates, `render_excalidraw.py`) |
|---|---|---|
| Loop it teaches | Pick an interface (MCP > CLI > REST). Plan the grid. Batch-add. **Screenshot after every batch**, run the 7-point checklist, then "stop, fix, re-screenshot"; say "I see [issue], fixing it". Refine **by id, not coordinates**. Snapshot before risky changes | Assess depth, research, map concepts to patterns, then **build section by section** (the output-token limit is the stated reason). Mandatory **render → view → audit against the plan → defect check → fix**, 2–4 rounds, with "don't stop at no bugs" |
| Guidance | Spacing numbers (tiers 80–120 px, siblings 40–60 px, width `max(160, chars×12)`); anti-patterns (no label on zone rectangles, avoid cross-zone arrows, few arrow labels); error recovery keyed to exit codes | "Argue, not display"; isomorphism test; evidence artifacts; multi-zoom; a 9-pattern library (fan-out, convergence, timeline, …); fewer than 30% of text in containers; semantic palette file |
| What works | The checklist is effectively a **lint spec**; ids over coordinates; describe for identity, screenshot for visuals | Separates **vision audit** (does it match the plan?) from **defect check**; **headless render needs no human tab** (Playwright + Chromium) |
| Weak | Every check is visual on a whole-canvas screenshot (costly and imprecise); `chars×12` is a guess (the font trap); manual arrow waypoints; no notion of a human editing, comments or turns | The renderer imports `@excalidraw/excalidraw` from esm.sh **unpinned**; whole file only; no font check; it forbids generator scripts, which conflicts with tldraw's "script it" finding |

**What becomes first-class in the clone:**

| From the skills | Becomes |
|---|---|
| Checklist items: truncation, overlap, arrow crossing, arrow-label overlap, gap < 40, font < 16, label on zone | `lint` codes: `text-overflow`, `overlap`, `arrow-crosses`, `arrow-label-overlap`, `tight-gap`, `tiny-text`, `zone-label-center`, plus `unbound-arrow` and `zone-not-containing` |
| Spacing and size heuristics | Placement-solver defaults, with widths from **measured** text |
| Describe for ids, screenshot for visuals | `find`/`describe` + `look` |
| Snapshot before risky changes | Automatic checkpoint per agent turn (`undo --turn`) |
| Section by section | Frame-scoped work: `look frame:f1`, `layout f1`, `lint frame:f1` |
| Vision audit vs defect check | `lint` (deterministic) + a `critique` prompt template (rubric: isomorphism, hierarchy, flow, balance) that returns comments, not edits |
| `render_excalidraw.py` | The headless renderer sidecar, pinned to our own bundle |
| Philosophy, palette, patterns, anti-patterns | A shipped `SKILL.md` (prose stays prose) |
| `evals.json` (5 prompts) | Seed of the eval set in Open questions |

---

## 2. Perception design

### What the evidence says

| Primitive | Best evidence | Effect | Verdict for us |
|---|---|---|---|
| Deterministic lints (overflow, overlap, unbound arrow, off-frame) | DrawingBench; TikZ study; tldraw's harness ships lints | Largest and most reliable gains; precise feedback is what works | **Must have.** Return lints with every write. |
| Text scene graph, tiered by attention | tldraw Blurry/Simple/Peripheral; Figma `get_metadata`; OSWorld (a11y tree 12.24% vs screenshot-only ~5%) | Structure beats pixels for identity and bounds | **Must have.** It is already `describe.ts`; add detail levels. |
| Screenshot + structure together | OSWorld; SeeAct ("best grounding leverages both HTML text and visuals") | Best combination in every study | Default for `look` |
| Cropped region / zoom | [MLLMs Know Where to Look](https://arxiv.org/abs/2502.17422) (ICLR 2025): cropping improves small-detail perception | Strong for small text and arrowheads | **Must have**, and cheap in tokens |
| Set-of-mark (numbered overlays) | [SoM](https://arxiv.org/abs/2310.11441): beats fine-tuned models on RefCOCOg; VisualWebArena +1.3pp overall (15.05→16.37%), +4.8pp on the dense Classifieds site; OSWorld: weaker on dense desktop UIs; SeeAct: not effective | Modest, and only helps with density | Optional `--marks`; label with **our short ids** so the image and the text agree |
| Before/after diff render | none found for diagrams | unknown | Text diff by default, image only on request |
| Full-canvas screenshot every turn | tldraw kit does it; Render-in-the-Loop says naive loops underperform | Costly and noisy | Don't. Fit to a region instead. |

**Honest gap.** Nobody has published an ablation of crop vs full vs set-of-mark for diagram
*editing*. We would be first. A cheap internal eval is 20 seeded diagrams × 5 edit instructions,
scored by our own lints plus a human pass (see Open questions).

### Token budget (Claude vision docs, fetched 2026-09-25)

An image costs ⌈w/28⌉ × ⌈h/28⌉ visual tokens. The cap is 1568 px / 1568 tokens on standard
models and 2576 px / 4784 tokens on the high-resolution tier.

| View | Size | ≈ tokens |
|---|---|---|
| Crop around one element, r = 150 | 512×384 | 19×14 = **266** |
| Frame or region | 1024×768 | 37×28 = **1,036** |
| Full-canvas fit | 1568×1176 | capped **1,568** (standard) |
| One element as a compact line (`n12 rect "Auth" 120,80 200×60 →n13`) | n/a | ~15–25 (our estimate) |
| One element as raw Excalidraw JSON (~30 fields, seed, versionNonce, …) | n/a | ~150–250 (our estimate) |

Two consequences. First, **short ids matter.** Excalidraw ids are ~20-character random strings
repeated in every binding, so alias them to `n1…nN` per session, the same way the set-of-mark
numbers work. Second, a 266-token crop is cheaper than the JSON for ~2 elements. Crops are the
cheap way to check work, not the expensive one.

### Query language (read side)

A small filter grammar, parsed server-side. Every result supports `detail=ids|compact|full`:

```
near:n12,r=200      elements whose bbox is within 200 px of n12's bbox
in:0,0,800,600      inside the bbox (in~: partially overlapping)
leftOf:n12 / rightOf / above / below     half-plane, with vertical/horizontal overlap
overlaps            pairs whose bboxes intersect (excluding container/label and frame/child)
frame:f1   type:arrow   owner:human   text~"auth"   bound:n12   changed:since=41
```

Terms combine with spaces (AND). Example: `near:n12,r=300 type:arrow owner:human`.

---

## 3. Action design

| Level | Verb shape | When to use | Precedent |
|---|---|---|---|
| **L1 semantic patch** | `add node n "Cache" rightOf:n12 gap:40` · `connect n12→n13 "reads"` · `move n5 below:n4` · `align n1,n2,n3 top` · `restyle frame:f1 stroke=#1971c2` · `rm n7` | Most edits; the output is small and diffable | Excalidraw+ `edit_scene_content`; Miro SVG diff; tldraw align/distribute/stack |
| **L2 graph DSL → ELK** | Mermaid flowchart subset, or `[A] -> [B]` DSL, scoped to a frame | New diagrams, or re-laying out one frame | excalidraw-cli, aiworx, draw.io, Figma `generate_diagram` |
| **L3 raw skeleton** | `ExcalidrawElementSkeleton[]` through `convertToExcalidrawElements` | Freehand shapes, one-offs | the current `canvas_draw` |
| **L4 code mode** (later) | sandboxed JS against a narrow scene API | Bulk or programmatic edits | tldraw offline; Cloudflare Code Mode (2,500 endpoints in ~1,000 tokens) |

Design rules:

- **Relative placement resolves server-side into absolute x, y.** The agent never does arithmetic.
  `gap` defaults to 40 and is overridable. Collisions push along the stated direction; a failure
  returns a lint, not a silent overlap.
- **Arrows are always bound and elbowed** (`elbowed: true`, `FixedPointBinding`, both present in
  the 0.18.1 types). The agent names endpoints; Excalidraw routes them.
- **Writes return `{rev, ids (short), lints[], crop?}`.** The check comes back in the write
  response, so the agent does not need a second call to see whether it broke something.
- **Human edits stay stable under re-layout.** Mark any element a human moved as pinned
  (`customData.pin = "human"`). Re-layout a frame with ELK layered using the INTERACTIVE
  strategies, which reuse existing positions, plus `layerChoiceConstraint` /
  `positionChoiceConstraint` for pinned nodes. Or lay out only the new nodes around fixed ones.
  ELK's own issue tracker lists rough edges in interactive mode
  ([#883](https://github.com/eclipse/elk/issues/883)), so test before relying on it. Ownership
  and rejection rules stay as in `collab-canvas-invariants.md`.
- **Patch format.** Accept both the L1 line format and a JSON op list
  `[{op:"add",…},{op:"set",id,…}]`. Always echo the normalised ops, so the transcript is a
  replayable log.

---

## 4. Interface packaging: CLI, MCP, or both

| Argument | Source | Implication |
|---|---|---|
| MCP loads every tool schema up front; Playwright MCP costs ~3.6k tokens before the first action; one benchmark measured ~114k vs ~27k tokens for the same task over MCP vs CLI **[secondary blog]** | bug0 / testcollab, 2026 | The CLI writes artifacts to disk and the agent reads only what it needs |
| "Tool results pass through the model; shell pipes don't" | Mario Zechner (pi) via Firecrawl, 2026 | `cv find … \| cv look` composes without spending tokens |
| Return concise vs detailed via a parameter; paginate and truncate with steering errors | [Anthropic, *Writing tools for agents*](https://www.anthropic.com/engineering/writing-tools-for-agents) | the `detail=` parameter; actionable errors |
| Progressive disclosure; code over tools; filter data before it reaches the model | [Anthropic, *Code execution with MCP*](https://www.anthropic.com/engineering/code-execution-with-mcp) (2025-11-04); [Cloudflare Code Mode](https://blog.cloudflare.com/code-mode-mcp/) | Keep a `guide <topic>` tool; code mode later |
| MCP wins on continuity and on chat hosts with no shell | bug0, 2026 | Claude.ai / MCP Apps users need the MCP |
| Crit: CLI + skill + slash-command loop; "an unqualified command fails instead of guessing" | [Crit](https://github.com/tomasz-tomczyk/crit) | Session resolution rule; blocking wait |

**Recommendation: one engine with two adapters.**

- The **CLI `cv`** is primary for coding agents. PNGs go to paths, JSON output is behind
  `--json`, it reads stdin, and it has `wait`.
- The **MCP** has 10 tools for chat hosts. Images come back as content blocks, and each tool has
  a `detail` parameter.
- **Code mode waits until v1.** tldraw needed security work before shipping it. Arbitrary JS also
  breaks per-op attribution and replay.

---

## 5. Excalidraw headroom (0.18.1, checked against the shipped `.d.ts`)

| Capability | Status | API / route |
|---|---|---|
| Region crop at any radius | **Stock** (4 steps) | `getCommonBounds` → pad by r → `elementsOverlappingBBox({elements, bounds, type:"overlap"})` → `exportToCanvas({elements, appState, files, exportPadding, getDimensions})` → offset is `minX − padding`, so `drawImage` crops to the requested bbox |
| Frame screenshot | **Stock** | `exportToCanvas({exportingFrame})` crops to the frame |
| Scale / resolution control | **Stock** | `maxWidthOrHeight`, `getDimensions → {width, height, scale}` |
| Set-of-mark overlay | **Stock** | Draw on the exported 2D canvas; scene→pixel is `(x − minX + pad) × scale`. Never insert marks into the scene |
| SVG export for a text-plus-vector check | **Stock** | `exportToSvg` (`skipInliningFonts`, `renderEmbeddables`) |
| Spatial queries | **Stock** client-side (`isElementInsideBBox`, `elementPartiallyOverlapsWithOrContainsBBox`, `elementsOverlappingBBox`); server-side needs our own bbox maths (trivial; rotated elements need the AABB) | |
| Viewport, camera, "look where the human looks" | **Stock** | `getVisibleSceneBounds(appState)`, `sceneCoordsToViewportCoords`, `viewportCoordsToSceneCoords`, `zoomToFitBounds`, `scrollToContent` |
| Agent presence and pointing | **Stock** | `updateScene({collaborators: Map})` with `Collaborator{pointer:{x, y, tool:"laser"}, selectedElementIds, username, color, avatarUrl}`. The agent can **laser-point** at an element and show its selection. Human deixis comes from `onPointerUpdate` and the selection |
| Semantic roles, pins, owner | **Stock** | `customData` on every element |
| Regions or "pages" | **Stock** | frames (`frameId`); `updateFrameRendering` |
| Auto-routed arrows | **Stock** | `elbowed` arrows + `FixedPointBinding` |
| Mermaid → elements | **Stock, but heavy** | `@excalidraw/mermaid-to-excalidraw`: ~6.5 MB tree (NOTES.md), so run it in the server or the headless renderer, not the MCP App bundle |
| Comment layer | **Stock** (DOM overlay + Sidebar, as built in v1.4) | `Sidebar`, `renderTopRightUI`, `onScrollChange` for re-positioning |
| **Headless render with no human view** | **Needs a sidecar** | A headless Chrome page loads the same bundle and runs `exportToCanvas`. Register fonts via `document.fonts` before measuring (the aiworx trap). Node-only jsdom/canvas is not a supported path |
| "Ghost" preview of a suggested change | **Hack or thin patch** | Insert locked, low-opacity elements with `customData.ghost`, which pollutes the scene and history. A clean version needs a render hook (patch) |
| Per-author undo | **Fork** | see `collab-canvas-invariants.md` §3–4 |
| Custom element types or interactive widgets | **Blocked** without a deep fork | tldraw's ShapeUtil has no Excalidraw equivalent (see `custom-canvas-options.md`) |

**Licensing.** Excalidraw is MIT, so fork, embed and sell are all allowed, provided you keep the
copyright notice. Excalidraw s.r.o. holds a trademark application for "EXCALIDRAW"
([USPTO report](https://uspto.report/company/Excalidraw-S-R-O)). Use "built on Excalidraw", not
"Excalidraw Agent". Check the font licences (Excalifont, Virgil, Nunito) before bundling
**[unverified]**. `.excalidraw` compatibility is free distribution: files open on
excalidraw.com.

---

## 6. Product potential

| Who | Overlap with "agent-first Excalidraw + review" | Missing |
|---|---|---|
| tldraw offline | Local app, agent drives the live canvas, lints, screenshots, code mode | Not open source; no agent↔human review threads; tldraw file format |
| Excalidraw+ MCP | Official, search + edit | Closed, cloud, beta; no agent-review loop documented |
| mcp_excalidraw | CLI + skill + MCP, draw → look → adjust | Screenshots need a browser; no comments; element-JSON surface |
| Crit | The review loop itself | Not spatial; the HTML-preview mode could show an exported SVG, but anchors are lost |
| Figma, FigJam, Miro | Enterprise canvases with MCP and comments | Closed, cloud, heavyweight, not local-first |

**Why it could be worth it:**

- Nobody combines an open, local-first canvas with element- or region-anchored review threads
  the agent works through from a CLI.
- It fits the existing algopeeps tutoring use case (annotate, don't solve).
- The perception tooling (crop + lint + short ids) is also publishable as an eval, which is a gap
  in the literature.

**Why it might not be:**

1. tldraw offline covers most of the "agent draws in a local app" value (our judgement), with a funded team behind it. They already
   moved agent feedback into comments (see the prior report, lesson 1).
2. Excalidraw's team could add comments to Excalidraw+ MCP at any time.
3. Many engineers keep diagrams as Mermaid in the repo. For them, "Crit on a rendered Mermaid
   file" is enough.
4. Custom shapes are blocked, which caps how far it goes beyond diagrams.
5. Running a standalone product (desktop packaging, persistence, sync) is mostly non-agent work.

Suggested framing: build it as an **open-source tool first** (`cv` CLI + MCP + app). Measure
whether the review loop changes outcomes before building any product shell.

---

## Pair diagramming loop

### Prior art

| Source | Finding | Design consequence |
|---|---|---|
| Pair programming, driver/navigator ([ai4se taxonomy](https://arxiv.org/abs/2409.18048)) | The driver builds; the navigator reviews "systemic and strategic concerns" | The agent drives only when handed the floor; by default it navigates, through comments and critique |
| [CLEO / "When to Hand Off, When to Work Together"](https://arxiv.org/abs/2603.02050), 2026-03 (N=10 + 12 designers) | Concurrent interaction in **33.73% of turns**. Users **avoided intervening when the agent misinterpreted their edits**. The fix was an agent that tracks user actions and **selectively updates its plan**. Users also "independently develop copies of unfinished outputs" | Re-read `changes` before every write; re-plan instead of overwriting; working on copies is a natural move |
| CHI 2026 co-editing study ([arXiv 2509.11826](https://arxiv.org/html/2509.11826), in the prior report) | Own-trigger suggestions accepted in 1.92 min vs 59.56 min otherwise; floods of autonomous comments get ignored | The agent acts on explicit triggers; unsolicited critique is batched and capped |
| [LACE](https://arxiv.org/abs/2504.14827), 2025-04 (N=21) | Turn-taking **and** parallel modes via **layers** raised ownership and satisfaction | Proposals live in their own layer (frame), never mixed into human elements |
| [Human-Human-AI triadic programming](https://arxiv.org/abs/2601.12134), 2026-01 (N=20) | When AI use was **visible to a peer**, people relied less on AI code and understood suggestions before applying them | Proposals are visible objects with a before/after, not silent edits |
| Patchwork (Ink & Switch, in the prior report); [SmartHopper #816](https://github.com/architects-toolkit/SmartHopper/pull/816) | Bot edits land on a branch you can partially merge; AI canvas changes are painted for approval before applying | Partial accept (`--only n3,n4`) |
| tldraw starter kit and harness (2026-09-22) | The agent can "schedule further work and reviews"; lints warn it; presence shows *where* it works | A self-review step in every turn; presence = laser pointer + status |
| Crit | Review rounds are human-paced: Finish Review unblocks the agent, and each comment can be sent to the agent on its own | `cv wait --review`; per-thread `agent_cmd` |
| Self-iteration: DrawingBench, TikZ verifier, See it. Say it. Sorted, and the two local skills | External, precise checks beat self-judgement; a critic proposes relational edits; the skills loop 2–4 rounds | Bound the self-loop (max 3), lint first, crop second, then hand back to the human |

"Control is a trajectory, not a point" ([CHI 2026](https://dl.acm.org/doi/10.1145/3772318.3790861))
frames control as something that shifts over a session; only the title and framing were
checked **[unverified detail]**.

### The loop

```
             ┌───────────── human floor ─────────────┐
             │ draws / edits freely; comments on ids, │
             │ regions or points; "@agent" = trigger  │
             └───────────────┬───────────────────────┘
                             │ cv wait → {threads, changes}
                             ▼
   ┌──────────────── agent turn (checkpointed) ────────────────┐
   │ 1 READ     changes since last turn + threads + describe   │
   │ 2 LOOK     crop around each anchor (r=200)                │
   │ 3 PLAN     mode per target: direct │ propose │ comment    │
   │ 4 DRAFT    edit {mode, ifRev} — proposals go in a frame   │
   │            placed beside:<target frame>                   │
   │ 5 CHECK    lint scope → look lint hits → fix (≤3 rounds)  │
   │            optional critique template → notes, not edits  │
   │ 6 HAND BACK reply per thread: summary + before/after crop │
   └───────────────┬───────────────────────────────────────────┘
                   ▼
   human: accept (all / --only ids) │ reject │ comment again ──▶ loop
```

Rules:

1. **Floor and trigger.** The agent acts only on a trigger: an `@agent` comment, a
   `cv wait --review` return, or an explicit request. Otherwise it stays quiet. Unsolicited
   critique goes into at most **one summary thread per turn**, with ≤ 3 items (the CHI 2026
   finding and AGENTS.md's two-annotation cap).
2. **Mode by ownership.** `direct` covers agent-owned elements and empty space. `propose` covers
   anything a human owns or touched. `comment` is critique only (tutoring mode stays
   comment-only, per AGENTS.md).
3. **Proposals sit beside, not on top.** v0 needs no fork: the proposal is a *copy* of the
   affected subgraph in a new frame `P1`, placed `rightOf` the target frame, with changed
   elements highlighted. Accept maps changes back by source id (`customData.proposalOf`) and
   deletes the frame. A ghost overlay drawn on top of the original waits for the render-hook
   patch.
4. **Concurrency.** Every write carries `ifRev`. If the human changed any target since the read,
   the op is skipped and reported, never forced. The agent re-reads and re-plans only the
   affected ops (the CLEO lesson).
5. **Presence.** While working, the agent is a collaborator: its laser pointer sits on the
   current target, with status text such as "revising f1". The human can see *where* it is and
   step in.
6. **Undo by turn.** Each agent turn is a checkpoint; `undo --turn` reverts the whole turn.
   Per-author undo stays a fork-level item (`collab-canvas-invariants.md`).
7. **Bounded self-loop.** At most 3 lint/look rounds. Whatever lints remain are listed in the
   reply rather than hidden.

---

## Proposed agent surface v0

### Architecture

```
  coding agent (Claude Code / Codex / pi)        chat host (Claude.ai, MCP Apps)
        │  shell: cv …  (files, --json, stdin)           │  MCP tools (10)
        ▼                                                ▼
  ┌──────── adapters: cli/ ─────────┬──── mcp/ ────┬── compat/ (yctimlin, official names) ─┐
  │                   one engine (server, per-session store)                              │
  │  query parser ─ scene store (elements+threads+proposals, rev) ─ id aliases            │
  │  placement solver ─ ELK layout ─ linter ─ turn checkpoints ─ ops log (events.jsonl)   │
  └───────┬──────────────────────┬──────────────────────┬────────────────────────────────┘
          │ pull/save 700 ms     │ render jobs           │ wait/notify
          ▼                      ▼                       ▼
   human app (Excalidraw   headless renderer        review events
   + threads sidebar,      (Chrome, same bundle,    (finish / approve
   laser pointer = agent)  exportToCanvas + crop    → unblocks `cv wait`)
                           + marks → PNG path)
```

### MCP tools (10)

| Tool | Signature | Returns |
|---|---|---|
| `find` | `{q: string, detail?: "ids"\|"compact"\|"full", limit?: 50}` | `{rev, items, truncated?}` |
| `describe` | `{scope?: "all"\|"viewport"\|"frame:f1"\|"near:n12,r=300"}` | tiered text: focus = compact, viewport = ids + bbox, rest = cluster counts |
| `look` | `{target: id\|ids[]\|bbox\|"viewport"\|"frame:f1", r?: 120, marks?: false, maxPx?: 768}` | image + `{bbox, scale, marks: {n12: [x, y]}}` |
| `lint` | `{scope?, critique?: false}` | `[{code, ids, bbox}]` (codes from §1a); `critique:true` adds the rubric prompt and a crop for the model to judge |
| `edit` | `{ops: string \| Op[], mode?: "direct"\|"propose", ifRev?: rev, dryRun?: false, look?: false}` | `{rev, ids, skipped: [{op, reason}], proposal?: "P1", lints, image?}` |
| `proposals` | `{status?: "open"\|"all"}` | `[{id, target, frame, changed: ids, threadId, state}]`; accept/reject are app-only (human) |
| `layout` | `{frame: id, dsl?: string, direction?: "LR"\|"TB", keepPinned?: true}` | `{rev, ids, lints}` |
| `changes` | `{since?: rev}` | `{rev, human: {added, changed, deleted}, threads: {opened, replied}}` |
| `comments` | `{status?: "open"\|"resolved"\|"all", near?: id}` | threads, each with `anchor`, `near` (compact) and `cropPath?` |
| `comment` | `{thread?: id, anchor?: id\|bbox\|[x, y], text, resolve?: bool}` | `{rev, thread}` |

`guide {topic}` and `open` stay as today. Everything else in the current ~20 tools folds into
`edit` ops or is app-only. Presence (laser pointer + status) is set implicitly by `look` and
`edit` targets. The compat names from §1a are exposed only with `--compat`.

### CLI (`cv`), with examples

```sh
cv open algo-42                                    # session; errors if ambiguous (Crit rule)
cv find 'near:n12,r=300 type:arrow' --detail compact
cv look n12 --r 150 --marks -o /tmp/n12.png        # prints path + bbox + mark map
cv lint --json | jq '.[] | select(.code=="text-overflow")'
cv edit <<'EOF'
add node "Cache" rightOf:n12 gap:40
connect n12->@new "reads"
align n12,@new middle
EOF
cv layout f1 --dsl '[API] -> [Cache] -> [DB]' --keep-pinned
cv look $(cv lint --ids | head -1) --r 80          # crop on the first problem found
cv comment n14 "why is the DB behind the cache?"   # anchor: id | x,y | x0,y0,x1,y1
cv comments --unresolved --json
cv reply t_9f2a "Read-through cache; see arrow label" --resolve
cv wait --review                                   # blocks until human hits Finish/Approve
cv changes --since 41 --json
cv edit --propose --if-rev 57 <<'EOF'              # human-owned target → copy in frame P1, rightOf f1
move n5 below:n4
EOF
cv look P1 --diff -o /tmp/p1.png                   # before | after side by side
cv proposals --json                                # human accepts in the app (all or --only ids)
cv undo --turn                                     # revert the agent's last turn
cv lint f1 --critique                              # rubric + crop; returns notes, not edits
```

A Crit-style hook: `agent_cmd` in the config receives `{thread, anchor, near, cropPath}` on
stdin, and its stdout is posted as the reply. That gives the app a per-thread "Send to agent"
button.

### Shipped skill

This replaces both local skills for the clone. It has one `SKILL.md`:

- the pair loop above, as the procedure;
- the design rubric and pattern library from `excalidraw-diagram`;
- the anti-patterns from `excalidraw-skill`, now enforced by `lint`;
- a palette file;
- exit codes.

`cv install-skill --dir <root>` copies it, the same mechanism yctimlin uses.

---

## Open questions

1. **Short-id lifetime.** Are aliases stable per session, or per file? Stable per file (stored in
   `customData`) makes comments and transcripts portable, at the cost of polluting exports.
2. **Proposal rendering.** Is a side-by-side copy frame (v0, stock) good enough, or do users need
   a ghost overlay on the original (render-hook patch)? Test with the eval's human pass.
3. **Eval before product.** Run 20 diagrams × 5 edits × {text-only, +full screenshot, +crop,
   +crop+marks, +lints} on Opus and Sonnet, scored by lints plus a blind human. Seed it from
   `excalidraw-skill/evals/evals.json`, and run the same prompts through yctimlin's CLI as the
   baseline via the compat layer. This decides what `edit` returns by default.
4. **Code mode.** Worth a sandboxed `cv exec` (QuickJS/isolate against the engine API, not the
   DOM) in v1, given tldraw's result?
5. **Scope of the spin-out.** Does it stay inside algopeeps (tutoring) or become a separate repo?
   Packaging, persistence and desktop work are ~50% of a standalone product and 0% of the
   agent research.

---

## Sources

- tldraw, *How we built a spatial harness for agents on the canvas*, 2026-09-22 — https://tldraw.dev/blog/harnessing-the-agents
- tldraw, *Introducing tldraw offline*, 2026-07 — https://tldraw.dev/blog/tldraw-offline ; repo (licence "not open source") https://github.com/tldraw/tldraw-offline
- Syntackle, *i love tldraw offline*, 2026 — https://syntackle.com/blog/tldraw-offline-is-a-whiteboard-your-coding-agent-can-draw-on/
- Hermes Agent, tldraw offline skill, 2026 — https://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/creative/creative-tldraw-offline
- tldraw agent template, 2026 — https://github.com/tldraw/agent-template
- Miro MCP tools (Canvas Composer SVG), fetched 2026-09-25 — https://developers.miro.com/docs/miro-mcp-tools ; ContextBolt on Miro MCP, 2026 — https://contextbolt.com/blog/miro-mcp/
- Figma MCP tools and prompts, fetched 2026-09-25 — https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- Excalidraw+ MCP tools (beta), fetched 2026-09-25 — https://plus.excalidraw.com/docs/mcp/tools
- excalidraw/excalidraw-mcp, 2026 — https://github.com/excalidraw/excalidraw-mcp
- jgraph/drawio-mcp, released 2026-02-03 — https://github.com/jgraph/drawio-mcp
- Eraser, *Best diagramming MCP servers in 2026* — https://www.eraser.io/guides/best-diagramming-mcp-servers-in-2026 ; https://docs.eraser.io/docs/mcp
- yctimlin/mcp_excalidraw v2, 2026 — https://github.com/yctimlin/mcp_excalidraw
- Gharib89/aiworx-excalidraw-plugin, 2026 — https://github.com/Gharib89/aiworx-excalidraw-plugin
- swiftlysingh/excalidraw-cli — https://github.com/swiftlysingh/excalidraw-cli
- excalidraw/mermaid-to-excalidraw — https://github.com/excalidraw/mermaid-to-excalidraw
- Crit — https://github.com/tomasz-tomczyk/crit ; https://crit.md/
- Anthropic, *Writing effective tools for agents*, 2025 — https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic, *Code execution with MCP*, 2025-11-04 — https://www.anthropic.com/engineering/code-execution-with-mcp
- Anthropic vision docs (visual-token formula), fetched 2026-09-25 — https://docs.anthropic.com/en/docs/build-with-claude/vision
- Cloudflare, *Code Mode: give agents an entire API in 1,000 tokens*, 2026 — https://blog.cloudflare.com/code-mode-mcp/
- Bug0, *Playwright CLI vs MCP* (2026, secondary) — https://bug0.com/blog/playwright-cli-vs-playwright-mcp-ai-browser-testing-2026 ; Firecrawl, *MCP vs CLI* — https://www.firecrawl.dev/blog/mcp-vs-cli
- DrawingBench, arXiv 2512.01174, 2025-12-01 — https://arxiv.org/abs/2512.01174
- Imperfect Visual Verification (TikZ), arXiv 2606.15693, 2026-04-09 — https://arxiv.org/abs/2606.15693
- Render-in-the-Loop, arXiv 2604.20730, 2026-04-22 — https://arxiv.org/abs/2604.20730
- OmniDiagram, arXiv 2604.05514, 2026-04-07 — https://arxiv.org/abs/2604.05514
- SciDiagramEdit, arXiv 2607.15272, 2026-07-16 — https://arxiv.org/abs/2607.15272
- PlanarBench, arXiv 2606.02010, 2026-06-01 — https://arxiv.org/abs/2606.02010
- See it. Say it. Sorted, arXiv 2508.15222, 2025-08-21 — https://arxiv.org/abs/2508.15222
- DiagramEval, arXiv 2510.25761, 2025-10-29 — https://arxiv.org/abs/2510.25761
- MermaidSeqBench, arXiv 2511.14967, 2025-11 — https://arxiv.org/pdf/2511.14967
- MLLMs Know Where to Look, ICLR 2025 — https://arxiv.org/abs/2502.17422
- Set-of-Mark prompting, 2023 — https://arxiv.org/abs/2310.11441
- VisualWebArena, 2024 — https://arxiv.org/abs/2401.13649 ; SeeAct, 2024 — https://arxiv.org/abs/2401.01614 ; OSWorld, 2024 — https://arxiv.org/abs/2404.07972
- ELK constraints — https://eclipse.dev/elk/blog/posts/2023/23-01-09-constraining-the-model.html ; https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-layering-layerChoiceConstraint.html ; interactive-mode issues https://github.com/eclipse/elk/issues/883
- Excalidraw trademark application — https://uspto.report/company/Excalidraw-S-R-O
- Local verification: `@excalidraw/excalidraw@0.18.1` `dist/types` (`utils/export.d.ts`, `utils/withinBounds.d.ts`, `excalidraw/types.d.ts`, `excalidraw/element/types.d.ts`, `excalidraw/index.d.ts`)
- excalidraw/excalidraw-mcp repo state (commits, releases, issues #83 #84 #87 #92 #96, package.json), via `gh api`, 2026-09-25 — https://github.com/excalidraw/excalidraw-mcp
- yctimlin/mcp_excalidraw commits 2026-03-25..09-08 and npm `mcp-excalidraw-server` versions 1.0.6→2.0.0, via `gh api` / `npm view`, 2026-09-25 — https://github.com/yctimlin/mcp_excalidraw
- Local skills (read-only): `~/.config/skillshare/skills/excalidraw-skill/` (SKILL.md, references/cheatsheet.md, evals/evals.json) and `~/.config/skillshare/skills/excalidraw-diagram/` (SKILL.md, references/render_excalidraw.py, render_template.html)
- CLEO, "When to Hand Off, When to Work Together", arXiv 2603.02050, 2026-03-02 — https://arxiv.org/abs/2603.02050
- LACE, arXiv 2504.14827, 2025-04-21 — https://arxiv.org/abs/2504.14827
- Human-Human-AI Triadic Programming, arXiv 2601.12134, 2026-01-17 — https://arxiv.org/abs/2601.12134
- ai4se taxonomy (driver/navigator), arXiv 2409.18048 — https://arxiv.org/abs/2409.18048
- "Control Is a Trajectory, Not a Point", CHI 2026 — https://dl.acm.org/doi/10.1145/3772318.3790861
- Collaborative Document Editing with Users and AI Agents, CHI 2026 — https://arxiv.org/html/2509.11826
- SmartHopper PR #816, staged visual review of AI canvas changes — https://github.com/architects-toolkit/SmartHopper/pull/816
