# Collaborative canvas invariants: keeping structure durable without locking

Research date: 2026-09-19. Target: shared whiteboard (Excalidraw 0.18.1 in an MCP App), human learner + AI tutor, both drawing. Companion to `custom-canvas-options.md` and `CONTRACT.md` §11.
Claims marked **[unverified]** come from secondary sources or could not be retrieved. Excalidraw type claims are verified by reading `app/node_modules/@excalidraw/excalidraw/dist/types/excalidraw/` at 0.18.1.

---

## 1. How mature canvases keep structure durable

| Product | Unit of manipulation | Comment attachment | Breakage prevention | Locked vs free |
| --- | --- | --- | --- | --- |
| **Figma / FigJam** | Layer; frame is a real parent node, moving it moves children | Pin to a layer or to canvas coordinates. Pinned comments follow the layer; **cut/paste detaches**, `Move to page` preserves ([docs](https://help.figma.com/hc/en-us/articles/360041547853-Move-or-edit-comments)) | Only the top frame is a pin target, not nested frames **[unverified, forum-sourced]** ([forum](https://forum.figma.com/t/keep-comments-pinned-to-specific-nested-elements-autolayout-included/58228)) | Per-layer lock; components make one definition authoritative |
| **Miro** | Object; frame is a container that moves its contents ([frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames)) | Anchored to object or board point | Frames give a named bounded region | Explicit lock, unlock from context menu |
| **tldraw** | Shape record. `TLBaseShape` = `id, index, isLocked, meta, parentId, props, rotation, x, y` ([ref](https://tldraw.dev/reference/tlschema/TLBaseShape)) | Not a product feature; apps build it on `meta` | `parentId` gives real hierarchy; bindings are separate records so arrow-to-shape links survive moves ([shapes](https://tldraw.dev/docs/shapes)) | `isLocked` per shape; `meta` is the app's namespace |
| **Excalidraw 0.18.1** | Element, with `frameId`, `groupIds`, `boundElements`, `locked`, `customData` (verified, `element/types.d.ts:27-72`) | None native. §11 builds a DOM overlay over an anchor element | Frames clip and carry children; groups move together; bound text and arrows follow their container. Membership is recomputed geometrically on resize, not preserved | `locked` per element. Collab cursors are transient AppState (`collaborators: Map<SocketId, Collaborator>`); follow mode is `userToFollow` + `followedBy` and moves the viewport only, never the scene (verified, `types.d.ts:26-43, 314, 339-341`) |
| **Apple Freeform** | Object on an infinite board, no frames ([guide](https://support.apple.com/guide/freeform/welcome/mac)) | None | Weak; relies on shared-document semantics | Nothing meaningful |
| **Muse / Allume** | Card inside a **nested board**; the board is the durable unit ([museapp.com](https://museapp.com/)) | None | Nesting, not locking | Nothing |
| **Kinopio** | Card, plus explicit connection records between cards ([about](https://kinopio.club/about)) | Comment cards are cards | Connections are records, so they survive moves | Card-level |
| **Heptabase** | Card on a whiteboard; whiteboards nest ([wiki](https://wiki.heptabase.com/)) | Card-level notes | Cards are database rows the board references, not free geometry | Content lives outside the canvas |

The pattern: **the durable thing is a named container with a parent pointer; the fragile thing is raw geometry.** Nobody solves this with locking. Figma, Miro, tldraw and Heptabase all make the group a real node with an id.

---

## 2. Document-collaboration analogies

| Mechanism | What it actually guarantees | Transfers to a canvas? |
| --- | --- | --- |
| Google Docs **suggesting mode** ([help](https://support.google.com/docs/answer/6033474)) | Two-tier document: committed text plus pending deltas you accept or reject | **Yes, the strongest analogy.** Agent writes into a scratch tier, learner promotes. Maps to `customData.tier` plus opacity, not a second scene. |
| Comment **anchors to ids, not positions** | A comment survives edits around it | **Yes, directly.** §11 already keys threads on `anchorId`; it must never be rebuilt from `x,y`. |
| Notion **synced blocks** ([help](https://www.notion.com/help/synced-blocks)) | One block, many locations, edit once | Partially; useful only if one asset appears twice. Out of scope for now. |
| Figma **branching** | Whole-document isolation plus a merge step | **No.** Too heavy for a tutoring session. Promotion survives; branching does not. |
| Figma **fractional indexing** ([blog](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)) | Concurrent reorder without index collisions | Already in Excalidraw: `index: FractionalIndex \| null` on the base element (verified). |

---

## 3. Undo and authorship

The accepted rule is **undo is per-user and scoped to that user's own operations**; it is not a global stack pop.

| System | Mechanism | Source |
| --- | --- | --- |
| **Figma** | Undo touches only your edits. Guiding principle: undo a lot, copy, redo to the present, and the document must be unchanged. So undo rewrites redo history at the time of the undo, and vice versa. Deleted-object properties live in the deleting client's undo buffer, not the server. | [multiplayer blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) |
| **Yjs** | `new Y.UndoManager(scope, {trackedOrigins, captureTimeout, deleteFilter})`. Only transactions whose `origin` is in `trackedOrigins` land on the stack. `captureTimeout` (500ms) merges nearby edits; `stopCapturing()` forces a boundary. | [Y.UndoManager](https://docs.yjs.dev/api/undo-manager) |
| **tldraw** | `HistoryManager` with explicit marks and a `bail` escape; batches can run outside history. | [HistoryManager](https://tldraw.dev/reference/editor/HistoryManager) |

For us: `excalidrawAPI.history` is a single local stack whose granularity we do not control ([API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)). The guard is to keep agent writes out of the human's stack as squashable neighbours of human strokes: tag every element with an owner in `customData` and make removing agent work an explicit action, not Ctrl+Z.

---

## 4. Excalidraw 0.18.1, verified against the shipped types

All line references are `dist/types/excalidraw/`.

| Capability | Verdict | Evidence |
| --- | --- | --- |
| `frameId: string \| null` on **every** element | Yes | `element/types.d.ts:64` |
| `boundElements: readonly BoundElement[] \| null`, `BoundElement = {id, type: "arrow" \| "text"}` | Yes, **arrows and text only** | `element/types.d.ts:23-26, 66` |
| `locked: boolean` on every element | Yes | `element/types.d.ts:70` |
| `customData?: Record<string, any>`, `groupIds: readonly GroupId[]` (deepest-first) | Yes | `element/types.d.ts:61-63, 71` |
| Frame is nameable: `ExcalidrawFrameElement = base & {type:"frame"; name: string \| null}` | Yes | `element/types.d.ts:140-143` |
| Arrows can bind **to a frame** (`ExcalidrawBindableElement` includes `frame`, `magicframe`) | Yes | `element/types.d.ts:194` |
| Bound **text** inside a frame | **No.** `ExcalidrawTextContainer` = rectangle, diamond, ellipse, arrow | `element/types.d.ts:195` |
| `convertToExcalidrawElements` accepts `{type:"frame", children: id[], name?}` | Yes | `data/transform.d.ts`; [skeleton docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton) |
| Skeleton arrow `start`/`end` **exclude** `frame`, `magicframe`, `image`, `text`, `embeddable`, `iframe` | Yes, so arrow-to-frame binding is unreachable through the skeleton API | `data/transform.d.ts` |
| Children must precede their frame in the array | Yes, required for render and clipping | [frames doc](https://docs.excalidraw.com/docs/codebase/frames) |
| Deleting a frame nulls children `frameId`; they survive as top-level elements | Yes | [deepwiki](https://deepwiki.com/excalidraw/excalidraw/3.5-frames-and-containment) |
| **Dragging a frame drags its children** | Yes. `dragSelectedElements` collects selected frame ids, then adds every element whose `frameId` is in that set to `elementsToUpdate` before computing the offset | [`dragElements.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/dragElements.ts) L75-85, read on `master`. The repo has no `v0.18.1` tag and the shipped bundle is minified, so this is **[unverified against the exact 0.18.1 build]** |
| **Resizing a frame recomputes membership geometrically, and can eject children** | Yes. `getElementsInResizingFrame` drops any child that no longer intersects the frame and has no `groupIds` | [`frame.ts`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/frame.ts) L283-320 |
| Multi-select drag across two frames strips membership from all but one element | Open bug [#6847](https://github.com/excalidraw/excalidraw/issues/6847), opened 2023-08-02, labelled `discussion` + `frames` |
| Duplication rebinds children to the duplicated frame | `bindElementsToFramesAfterDuplication`, `frame.ts` L50 |
| Nested frames | **Not supported.** Issue [#8359](https://github.com/excalidraw/excalidraw/issues/8359) open since 2024-08-10. `getElementsCompletelyInFrame` excludes groups containing frame-likes ([deepwiki](https://deepwiki.com/excalidraw/excalidraw/3.5-frames-and-containment)) |
| `frameRendering: {enabled, name, outline, clip}` and `editingFrame` in AppState | Yes | `types.d.ts:~200` |
| `UIOptions.tools` | **`{image: boolean}` only.** There is no `frame` flag | `types.d.ts:487-489` |
| `elementsAreLocked`, `isSelectionLocked` | **Do not exist in the published package.** Zero hits across the whole `dist/types/` tree and zero in `dist/prod/index.js` | grep for those two symbols alone, no result limit |
| `viewModeEnabled` | Prop and AppState field; whole-canvas, not per-element | `types.d.ts:301, 436` |

### What this means for the three asks

**(a) Assets as frames — yes, with caveats that cost real work.** Frames are nameable, `frameId` is on every element, the skeleton API takes `{type:"frame", children, name}`, dragging the frame drags the children, and deleting it degrades to loose elements. Caveats: no nesting, so use a frame for the outer asset and `groupIds` inside; membership is geometric on resize, so shrinking ejects children; and bug #6847 strips membership on a multi-select drag spanning two frames. Both mean the server must **re-assert `frameId` from `customData.assetId` on every pull** rather than trust the scene. Frames cannot hold bound text, so a caption must be a separate text element with `frameId` set.

**(b) Comments anchored to an element id with no extra anchor element — yes, but it is a trade.** `customData.threads: ["t_9f2a"]` on the target plus the thread's existing `anchorId` is enough; the badge position comes from the target's bbox via `getSceneElements()` and `appState.scrollX/scrollY/zoom`. `boundElements` is **not** usable, it accepts `arrow` and `text` only.

The trade: §11's `canvas_thread_post` accepts `{x, y, text}`, a comment on empty canvas with nothing to attach to. Dropping the ellipse drops that. Keep both paths, as Figma does with layer-pinned versus canvas-pinned comments ([move or edit comments](https://help.figma.com/hc/en-us/articles/360041547853-Move-or-edit-comments)).

**(c) A user-controlled pin/freeze — yes, via `locked`.** Set `locked: true` through `updateScene`. Excalidraw's own unlock affordance still applies, so this is a speed bump, not a guard. Add `customData.frozenBy` and `frozenRev` to tell a deliberate pin from a stray lock, and re-assert `locked` after each `canvas_pull`.

---

## 5. Invariants

| # | Invariant | Why → How |
| --- | --- | --- |
| 1 | Every agent asset is a **named frame**, never a loose group | One handle, one stable id → `{type:"frame", children, name}` |
| 2 | Identity lives in `customData`, never in geometry or z-order | The agent must re-find what it drew → `{assetId, kind, ownedBy, rev}`. Duplicating yields two elements sharing one `assetId` until the server re-keys **[unverified: `frameId` is rebound on duplicate, `customData` apparently is not]** |
| 3 | Membership is **derived from `assetId`**, not trusted from `frameId` | Resize ejects, #6847 strips → re-assert `frameId` on every pull |
| 4 | Comments reference a **target id** when there is a target; the `{x,y}` case keeps a carrier | Coordinates go stale, but empty-canvas comments need a home → keep both §11 paths |
| 5 | A thread whose target dies is **orphaned, never dropped** | Losing the learner's question is worse than a stale badge → `status:"orphaned"`, park at last bbox |
| 6 | Deleting a container **degrades**, never cascades | Dissolving an asset must not lose the drawing → Excalidraw already nulls children `frameId` |
| 7 | Two tiers, **stable** and **scratch**, one promotion action | Experiments must not corrupt the explained diagram → `customData.tier`, reduced opacity, promote flips it |
| 8 | Freeze is **advisory and reversible** | A hard lock kills the background feel → `locked:true` + `customData.frozen`, unfreeze in our `<MainMenu>` |
| 9 | The agent **never mutates frozen or human-owned elements**; it proposes beside them | Cheapest conflict rule that works → server rejects those `canvas_draw` targets |
| 10 | Undo is **scoped by owner** | My undo must not undo your change → agent removal is an explicit action, not Ctrl+Z |
| 11 | Children precede their frame on every write | Otherwise clipping breaks silently → sort server-side before `updateScene` |
| 12 | Presence and camera are **never** persisted into the scene | A yanking shared camera is the opposite of durable → camera stays in `appState`, as §7 already says |
| 13 | Every structural change emits an **event with a rev** | Visible durability beats trusted durability → add `type:"structure"` to `events.jsonl` |

---

## 6. Ranked mechanisms

| # | Mechanism | Effort | What it fixes |
| --- | --- | --- | --- |
| 1 | **Comments target an element id.** `threadId` in the target's `customData`, badge from its bbox; ellipse kept only for the `{x,y}` path | 3-5 h | Comments detaching from what they refer to |
| 2 | **Agent assets become frames.** `canvas_asset` emits `{type:"frame", children, name}` with `assetId` on the frame and every child | 10-14 h | Shearing. One drag moves the whole array, and the agent gets one id to mutate |
| 3 | **Re-assert membership on pull.** Any element with a known `assetId` gets its `frameId` restored | 3-4 h | Resize ejection and #6847. Without it, mechanism 2 leaks structure over a session |
| 4 | **Freeze action in our menu.** `locked:true` + `customData.frozen`, re-asserted after every pull | 4-6 h | Accidental edits to the explained diagram. Cheap; `locked` already exists |
| 5 | **Owner-scoped write guard.** Server rejects agent writes to frozen or human-owned elements, returns "proposed beside" | 6-8 h | The agent wrecking a diagram mid-conversation. Pure server logic |
| 6 | **Scratch/stable tiers with a promote button** in the sidebar | 12-16 h | Experiments polluting the durable drawing. Highest value and cost; do it after 1-5 |
| 7 | **Asset picker in `<Footer>`** over `libraryItems`, stamping frames from mechanism 2 | 10-14 h | Makes the frame convention the default path, not a discipline |

Mechanisms 2 and 3 ship together. Effort assumes a solo developer working with agents and excludes tests beyond a smoke check.

---

## Summary

1. Every mature canvas makes the durable unit a **named container with a parent pointer**; none of them rely on locking.
2. Excalidraw already ships that container: frames are nameable, `frameId` is on every element, and dragging a frame drags its children (verified in 0.18.1 types and in `dragElements.ts` on `master`).
3. Frame membership is fragile in two known ways: resize ejects children by geometry, and open bug #6847 strips membership on a multi-select drag across two frames. Treat `frameId` as a cache and re-assert it from `customData`.
4. Frames cannot nest; issue #8359 is open since August 2024. Use frames for the outer asset and `groupIds` inside.
5. `boundElements` accepts `arrow` and `text` only, so it cannot carry a comment reference. `customData` can, and is free JSON.
6. Comments should key on an element id. That is a trade, not a pure win: CONTRACT §11's coordinate-anchored `{x, y}` comments still need a carrier element, so the anchor ellipse survives for that path only.
7. `locked: boolean` is per-element and settable through `updateScene`; treat it as advisory, because the user can unlock from Excalidraw's own menu. `elementsAreLocked` and `isSelectionLocked` do not exist in the published package.
8. `UIOptions.tools` exposes `image` only, so the frame tool cannot be hidden from the toolbar.
9. The accepted undo rule across Figma, Yjs and tldraw is per-author scope; Excalidraw gives us a local stack only, so keep agent removals off Ctrl+Z. Its collab cursors and follow mode touch presence and viewport, never the scene.
10. Google Docs suggesting mode is the right model for the agent tier; Figma branching is too heavy for a tutoring session. The first three mechanisms cost roughly 16 to 23 hours together and remove both failure modes the owner named.
