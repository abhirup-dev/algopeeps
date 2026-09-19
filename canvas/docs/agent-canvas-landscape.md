# Agent canvas landscape: who has put an AI on a whiteboard, and what they learned

Products, prototypes, research and interaction patterns for a **shared** canvas where a human and an
agent draw together. Companion to `custom-canvas-options.md` (libraries) and
`collab-canvas-invariants.md` (structure durability). Researched 2026-09-19. **[unverified]** marks
claims resting on secondary blogs or talk write-ups rather than primary docs.

---

## 1. Landscape table

| Project | Date | Open? | What the agent perceives | Action model | Pointing / deixis | Attribution | Notable |
|---|---|---|---|---|---|---|---|
| [tldraw agent starter kit](https://tldraw.dev/starter-kits/agent) ([repo](https://github.com/tldraw/agent-template)) | 2025→2026, active | MIT template, SDK licensed | **Both.** Screenshot + tiered JSON: `BlurryShape` (bounds/id/type/text) in viewport, `FocusedShape` (full props) in focus, `PeripheralShapeCluster` (counts) outside | LLM emits JSON actions → Editor ops. CRUD, freehand, align/distribute/stack, move viewport, todo list, schedule follow-up, call APIs | Message + current **selection** + current **viewport**; plus user bounds, recent user actions, and "lints" on shapes | Not a first-class feature | Actions stream and apply incrementally, so you watch shapes appear. Best-documented perception design anywhere |
| [tldraw fairies](https://fairies.tldraw.com/) | 2025→; removal [#7652](https://github.com/tldraw/tldraw/issues/7652) filed 2026-01-07, **site live 2026-09-19** | closed | same harness as starter kit | Multi-agent: group-select fairies, one orchestrates, plans, assigns, waits for reports **[unverified]** | each agent is a visible animated sprite | sprite identity | Agents signal progress by **animation, not chat logs** **[unverified]**. Removal specced with no public rationale; [#7589](https://github.com/tldraw/tldraw/issues/7589) backports fairy work into the starter kit |
| [tldraw MCP App](https://tldraw.dev/blog/tldraw-mcp-app) | 2026-03-03 | [source](https://github.com/tldraw/tldraw/tree/main/apps/mcp-app) | Canvas state passed **back into chat context** after each change | **Three tools**: create, edit, delete shapes | Inherits host chat selection; no canvas-native pointing | none | Closest prior art to our architecture: the MCP server returns a **full interactive tldraw canvas** inside the chat host. Cursor first, then VS Code / ChatGPT / Claude |
| [mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) (~2.4k★) | v2.0, 2026 | MIT | **Both.** Element JSON + PNG screenshots for self-correction | 26 tools: CRUD, batch, align/group/lock, describe, screenshot, export, Mermaid import, snapshot/restore, `set_viewport` | id-based refs and groups; no pointing UI | none | Explicit **draw → look → adjust** loop; screenshots catch truncated labels, overlaps, bad arrow routing |
| [Excalidraw+ MCP](https://plus.excalidraw.com/docs/mcp) (official) | beta, 2026 | closed | Built on the Excalidraw+ API; tool list not on the docs landing page | Renders interactive hand-drawn diagrams into Claude / ChatGPT / VS Code with camera control **[unverified]** | n/d | n/d | Official but thin and explicitly unstable during beta |
| [Miro Canvas 26](https://miro.com/blog/canvas-26-product-highlights/) | May 2026 | closed | Canvas made "AI-readable and writeable by third-party agents" via MCP + agent-friendly formats | **Sidekicks** (agents that ask clarifying questions) and **Flows** (multiplayer AI workflows living as board objects) | n/d | n/d | Only vendor treating the board itself as the multi-agent substrate |
| [Figma design agent](https://www.figma.com/blog/the-figma-canvas-is-now-open-to-agents/) | 2026-03-24, GA 2026-05-20 | closed | Real file structure (components, variables, auto-layout) + **screenshot self-healing loop** | `use_figma` MCP tool writes to files; steered by markdown **skills** | none | **Undocumented** — a real gap | Agent works inside the multiplayer canvas, not a floating prompt box |
| [FigJam for coding agents](https://www.figma.com/blog/figjam-your-coding-agents-whiteboard/) | 2026-04-28 | closed | `get_figjam` reads board content | `figma-use-figjam` skill, `generate_diagram`, `generate-project-plan` | none | Agent output is ordinary board objects | Workflow is **agent drafts → humans annotate → implement** |
| [ChatGPT Canvas](https://openai.com/index/introducing-canvas/) | 2024; removed from current models 2026-05-28 for in-chat "writing blocks" **[unverified]** ([src](https://felloai.com/chatgpt-canvas/)) | closed | document text only | inline rewrite of a highlighted passage | highlight-a-passage | none | Never spatial. Its one good idea, select → ask about it, is what everyone copied |
| [Gemini Canvas / Docs visuals](https://workspaceupdates.googleblog.com/2026/07/generate-and-edit-visuals-with-gemini-in-Google-Docs.html) | 2026-07-28 | closed | document context | generate + re-style diagrams by prompt | none | none | Generation, not co-drawing. Batch restyle is the only spatial-ish verb |
| Anthropic Artifacts / Claude | ongoing | closed | the artifact's source, not a scene graph | full-rewrite or targeted update | none | none | Our host. Artifacts are **regenerated**, not co-edited; MCP Apps is the path to a shared surface inside Claude |
| [Cursor Canvas / Design Mode](https://www.startuphub.ai/ai-news/technology/2026/cursor-s-agents-get-visual) | 2026 **[unverified]** | closed | rendered surface + code | select an element, annotate inline, agent takes the annotation as structured context | **inline annotation on the element** | "every agent-generated line is visually distinct" **[unverified]** | Best articulation of annotation-as-prompt |
| [Eraser DiagramGPT](https://www.eraser.io/diagramgpt) | ongoing | closed | diagram-as-code text | generates code; you fix a line, not drag boxes | n/a | n/a | Text layer makes agent edits diffable — cheap provenance |
| [showwork](https://github.com/averymkeller83-hub/showwork) | 2026-09 | open | reads the handwritten page (vision) | **crosses out the wrong bit, writes the corrected line underneath**, explains in chat | the cross-out *is* the pointing | agent ink vs student ink | Closest thing to the tutoring interaction we want |
| [AI-notebook](https://github.com/abdulhamid-n/AI-notebook) | 2025-26 | open | Mathpix + Gemini handwriting OCR over a tldraw canvas | "AI draws hints directly on the canvas", real-time voice | hint placed next to the step | agent ink is separate | tldraw + OCR + voice is our stack shape. [Studdy](https://studdyai.com/) is the commercial version |
| [OpenBoard](https://github.com/clawnify/OpenBoard) | 2026 | open | dual-mode UI: "human-optimized + AI-agent-optimized" | Miro-like board | n/a | n/a | Rare explicit stance that the agent needs its **own** view |
| [MCP Apps / SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp) | stable 2026-01-26; folded into extensions in the 2026-07-28 spec | open spec | n/a (transport) | `ui://` resources + bidirectional JSON-RPC between embedded UI and host | n/a | n/a | The substrate. Claude web+desktop, VS Code Insiders, Goose, Postman |

Surveyed and dismissed as generation-not-co-drawing: Canva, Notion AI, Perplexity, Lucid AI,
Mermaid Chart AI, Whimsical AI, Napkin.ai. Each turns a prompt into a finished artefact.

---

## 1b. Research and essays

| Work | Date | Finding that matters to us |
|---|---|---|
| [Patchwork — *AI bots in version control*](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/07/), Ink & Switch | 2024→ | An editorial bot "makes changes as another collaborator", landing them **on a branch you can partially or completely merge**. The only published answer to mixed-authorship provenance |
| [*Malleable software*](https://www.inkandswitch.com/essay/malleable-software/), Ink & Switch | 2025 | AI complements a malleable environment rather than replacing it — the argument against agent-as-oracle |
| [Collaborative Document Editing with Users and AI Agents](https://arxiv.org/html/2509.11826), CHI 2026 | 2025-09 | See Lesson 2. Recommends focus- and collaboration-aware initiative |
| [Sequential Design Actions on an Infinite Canvas](https://arxiv.org/html/2603.11569) | 2026 | With an agent, designers didn't work longer (3.73h → 4.03h); **Relocate actions fell 11pp**, effort shifted to relational structuring, late-phase acceptance hit 95.65%. Useful agent role changes by phase: catalyst → structurer → curator |
| [IdeationWeb](https://dl.acm.org/doi/10.1145/3706598.3713375), CHI 2025 | 2025 | Every node tagged by creation type (AI / AI-derived / user) — provenance as data model, not badge |
| [Intent Tagging](https://arxiv.org/pdf/2502.18737) | 2025 | Micro-prompts attached to specific content beat one big prompt |
| [Scaffolding Generative AI as a Tutor](https://doi.org/10.3390/educsci16040651), 175 students | 2025 | Structured scaffolding beats answer-giving; unscaffolded AI drives cognitive offloading. The case for annotate-don't-solve |
| [Design Patterns for AI Interfaces](https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/) (surveys Appleton, Lee, Litt) | 2025-07 | Chat is rarely the right interface; the alternatives named are spatial or inline |

---

## 2. Five recurring lessons

**1. Agents genuinely cannot point, and canvas annotations are the wrong fix.**
tldraw's [*Agents can't point*](https://tldraw.dev/blog/agents-cant-point) (2026-08-11) is the most
relevant document here. Their first attempt had the agent leave feedback as shapes and sticky notes
on the canvas. It failed three ways: anonymous clutter with multiple agents, "twenty notes is twenty
things to delete before you can export", and no threading. What worked was **comments as a parallel
layer pointing into the canvas** — pinned, threaded, removable without touching the drawing.

**2. Agent-initiated work is systematically ignored; user-initiated work is acted on in minutes.**
The CHI 2026 study ([arXiv 2509.11826](https://arxiv.org/html/2509.11826), 30 participants / 14
groups) found 88% of tasks were triggered by their own creator, and suggestions on your own comment
were accepted after a mean of **1.92 minutes** versus **59.56 minutes** for someone else's.
Autonomous runs "generated numerous comments simultaneously, causing users to feel overwhelmed and
ignore suggestions"; the recommendation is manual triggers and **focus- and collaboration-aware
initiative**. 23.33% did not feel in control of the text.

**3. Perception must be tiered by attention, not dumped wholesale.**
Nobody serious sends the whole scene. tldraw's blurry / focused / peripheral-cluster split is the
mature answer, and both tldraw and mcp_excalidraw pair JSON with a screenshot to catch what JSON
hides: overlaps, arrow routing, truncated labels. The loop is **draw → look → adjust**.

**4. Visible agent presence is contested, not settled.**
tldraw shipped fairies as animated sprites, then filed
[#7652](https://github.com/tldraw/tldraw/issues/7652) on 2026-01-07 to remove them from tldraw.com
with **no rationale stated** — yet the site served a 200 on 2026-09-19 and Ruiz was demoing fairies
at DevCon in June. Unresolved, not a verdict; what is clear is that
[#7589](https://github.com/tldraw/tldraw/issues/7589) treats the *harness* as the part worth
keeping. The [Agent Draw Show HN](https://news.ycombinator.com/item?id=48805475) is the nearest
public feedback: praise for the idea and education use cases, complaints about speed, accuracy, and
crashes mid-drawing on weaker models.

**5. Selection is the universal deixis primitive; everything else is bespoke.**
Every working system uses "what the human selected, plus what is on screen" as the referent for
"this one": ChatGPT highlights a passage, Cursor annotates an element, tldraw sends selection +
viewport + bounds, Figma uses component identity. Nobody has a first-class *agent-to-human*
pointing gesture outside comments.

---

## 3. Patterns to steal, ranked for a tutoring whiteboard on MCP Apps

| # | Pattern | Source |
|---|---|---|
| 1 | Pinned, threaded **comments** as the agent's feedback channel; drawing stays exportable | [tldraw](https://tldraw.dev/blog/agents-cant-point) |
| 2 | **Selection + viewport + bounds** as the standing context bundle every turn | [tldraw](https://tldraw.dev/starter-kits/agent) |
| 3 | **Tiered scene serialisation** so tokens track attention | tldraw |
| 4 | **Screenshot self-check**: render, inspect, fix own overlaps | [mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw), Figma |
| 5 | **Cross out the wrong step, write the correction beneath** — annotate, don't solve | [showwork](https://github.com/averymkeller83-hub/showwork), [scaffolding study](https://doi.org/10.3390/educsci16040651) |
| 6 | **Ask-about-selection** as the entry point, not a chat box | [ChatGPT Canvas](https://openai.com/index/introducing-canvas/) |
| 7 | **Annotation-as-prompt**: the scribble *is* the request | Cursor **[unverified]**, [Intent Tagging](https://arxiv.org/pdf/2502.18737) |
| 8 | **Incremental streaming** so shapes land one at a time and can be interrupted | tldraw |
| 9 | **Agent ink visually distinct** (colour + dashed) from student ink | Cursor **[unverified]** |
| 10 | **Manual trigger over autonomous initiative**, focus-aware | [CHI 2026](https://arxiv.org/html/2509.11826) |
| 11 | **Plan-and-execute preview**, per-step removable | [Zylos](https://zylos.ai/research/2026-05-28-agentic-ux-frontend-design-patterns-ai-agents/) |
| 12 | **Lints as a perception channel** — precomputed "these overlap" facts | tldraw |
| 13 | **Camera follow with an opt-out** | tldraw (opt-out is ours) |
| 14 | **Agent edits on a mergeable branch**, accepted whole or in part | [Patchwork](https://www.inkandswitch.com/patchwork/notebook/2024-version-control/07/) |
| 15 | **Provenance in the data model** — every shape tagged human / agent / derived | [IdeationWeb](https://dl.acm.org/doi/10.1145/3706598.3713375) |
| 16 | **Phase-aware assistance**: catalyst early, structurer mid, curator late | [arXiv 2603.11569](https://arxiv.org/html/2603.11569) |

Skip: animated agent avatars, multi-agent orchestration on one board (Miro's bet, publicly
unproven), and agent-authored sticky notes (retracted by tldraw).

---

## 4. Three things nobody has solved

**a. Agent-to-human pointing.** Everyone solves human→agent deixis via selection. Nobody has a
credible *agent* gesture for "this one here" that is temporary, unambiguous, and not litter.
Comments move the referent off-canvas. A transient highlight with a decay timer is open space.

**b. Interruption and turn-taking on a live surface.** CHI 2026 shows autonomous agents flooding a
shared artefact and being tuned out, and recommends focus-awareness without a mechanism. Nobody has
published how to yield the pen mid-stroke when the human starts drawing.

**c. Attribution and selective undo across mixed authorship.** Figma, Miro and the Excalidraw MCP
servers all leave agent-edit attribution undocumented, and no shipped canvas lets you say "undo what
the agent did in the last two minutes, keep what I did". Patchwork has the only credible design —
agent edits on a mergeable branch — but it is a text prototype, not a canvas.

---

## 5. Summary

1. The field is ~12 months old; tldraw is the only vendor publishing lessons, with CHI and Ink & Switch carrying the rest.
2. Serious agents perceive **both** ways: tiered JSON for identity and bounds, screenshots for layout faults.
3. Tier perception by attention — focused shapes in full, viewport shapes blurry, the rest as counts.
4. "This one" is solved from the human side by **selection + viewport**, unsolved from the agent side.
5. tldraw tried agent annotations on the canvas, found unattributable clutter, and moved feedback into pinned threaded comments.
6. Agent avatars shipped, were specced for removal without stated reason, and are still live — an open question.
7. Agent-initiated suggestions land far slower than user-initiated ones: 59.56 min versus 1.92 min.
8. Figma, Miro and Excalidraw all expose their canvas over MCP, so plumbing is commodity and interaction design is the differentiator.
9. MCP Apps (stable 2026-01-26) is proven for this shape: tldraw put a full interactive canvas inside a chat host with three tools.
10. For tutoring, steal showwork's move: cross out the wrong step, write the correction beneath, explain in words.
