# Custom canvas options: how far can we make this ours?

Research date: 2026-09-19. Baseline: `@excalidraw/excalidraw` 0.18.1 (MIT), React, shared human+agent whiteboard shipped as an MCP App.
Claims marked **[unverified]** come from secondary sources or could not be retrieved.

---

## 1. Excalidraw customisation ceiling (0.18.x)

### What the package lets you control

| Surface | API | What you actually get |
| --- | --- | --- |
| Menu items | `<MainMenu>` + `MainMenu.Item` / `.Group` / `.DefaultItems.*` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/children-components/main-menu)) | Full replacement. You pick which defaults survive and add your own. |
| Empty-canvas UI | `<WelcomeScreen>`, or `UIOptions.welcomeScreen` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/children-components)) | Full replacement. |
| Bottom bar | `<Footer>` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/children-components)) | Arbitrary JSX. Natural home for a DSA-asset palette. |
| Right panel | `<Sidebar>` + `excalidrawAPI.toggleSidebar({name, tab})` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)) | Arbitrary JSX, dockable, programmatically togglable. |
| Top-right corner | `renderTopRightUI(isMobile, appState)` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props)) | Arbitrary JSX. |
| Stats dialog | `renderCustomStats` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props)) | Arbitrary JSX. |
| Menu canvas actions | `UIOptions.canvasActions` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options)) | Seven booleans only: `changeViewBackgroundColor`, `clearCanvas`, `export`, `loadScene`, `saveToActiveFile`, `toggleTheme`, `saveAsImage`. |
| Toolbar tools | `UIOptions.tools` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options)) | **One flag: `image`.** The other 14 members of `ToolType` (selection, rectangle, diamond, ellipse, arrow, line, freedraw, text, eraser, hand, frame, magicframe, embeddable, laser) cannot be hidden or reordered through the public API. |
| Custom tool | `excalidrawAPI.setActiveTool({type:"custom", customType})` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)) | Shipped. `ActiveTool` in 0.18.1 is a union of `{type: ToolType, customType: null}` and `{type:"custom", customType: string}` (verified in `dist/types/excalidraw/types.d.ts`), so in custom mode no native tool type applies. Drive it from `onPointerDown` / `onPointerUp` and `updateScene`. The stamping hook. |
| Per-element metadata | `customData?: Record<string, any>` on the base element type (verified in `dist/types/excalidraw/element/types.d.ts`, 0.18.1) | Arbitrary JSON you own, persisted with the scene. The place to keep asset identity. |
| Scene reads/writes | `updateScene`, `getSceneElements`, `getAppState`, `getFiles`, `history`, `scrollToContent`, `resetScene` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)) | Complete programmatic control of the document. |
| Agent-friendly authoring | `convertToExcalidrawElements` element-skeleton API, beta ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)) | Terse JSON an LLM can emit; the library expands it into full elements with bindings. |
| Reusable assets | `libraryItems` in `initialData`, `excalidrawAPI.updateLibrary({merge, openLibraryMenu})` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)) | Ship your own DSA shapes as a private library, no excalidraw.com round trip. |
| Look | CSS variables on `.excalidraw` / `.excalidraw.theme--dark`, plus `theme` prop ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/customizing-styles)) | Colours and chrome, not layout. |
| Embeds / links | `renderEmbeddable`, `onLinkOpen`, `generateLinkForSelection` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props)) | You can replace the iframe renderer entirely. This is a real escape hatch: an embeddable element can host your own React component. |
| Modes | `viewModeEnabled`, `zenModeEnabled`, `gridModeEnabled`, `langCode`, `name` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props)) | Coarse presentation switches. |

### What you cannot change

The docs state it plainly: "some UI customization isn't supported yet (such as the toolbar or the element properties panel)" ([children components](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/children-components)).

| Blocked | Evidence |
| --- | --- |
| Toolbar layout, ordering, adding a visible tool button | No API; `UIOptions.tools` exposes `image` only ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options)) |
| Element properties panel (stroke, fill, font, arrowheads) | Explicitly listed as unsupported ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/children-components)) |
| New element types | Issue [#4957](https://github.com/excalidraw/excalidraw/issues/4957) open since 2022-03-22, still open. PR [#4963](https://github.com/excalidraw/excalidraw/pull/4963) closed unmerged 2022-05-24. PR [#3915](https://github.com/excalidraw/excalidraw/pull/3915) closed as draft 2022-11-12. |
| Context menu | No documented API in the props, render-props or children pages. **[unverified]** whether CSS can suppress individual entries reliably. |
| Hit-testing, snapping, binding rules, undo granularity | Internal; not exported. |

### Verdict

Reachable while staying on the package: roughly **70 to 75 percent** of a "fully custom UI". Everything outside the canvas rectangle is yours. Everything inside it is Excalidraw's: the toolbar strip, the properties island, the element vocabulary.

Your DSA assets do not need custom element types. An array cell or a tree node is a group of rectangles, text and arrows, so library items plus a custom-tool stamper cover the whole first tier. The gap opens only when an asset must behave like a first-class object: resize under semantic constraints, edit "number of cells" from a properties panel, re-layout on data change. That is the wall.

### Cost of forking

| Metric | Value |
| --- | --- |
| `packages/excalidraw` source | 451 `.ts`/`.tsx` files, 130,101 lines (measured 2026-09-19, `main`) |
| All `packages/*` | 197,042 lines |
| npm tarball 0.18.1 | 30 MB compressed, 46.8 MB unpacked, 1029 files |
| Stable releases | 0.17.0 Nov 2023, 0.17.6 Apr 2024, 0.18.0 Mar 2025, 0.18.1 Apr 2026 ([npm](https://www.npmjs.com/package/@excalidraw/excalidraw)) |
| Nightly `0.18.0-<sha>` builds | Roughly weekly through 2026, latest 2026-09-16 |

The slow stable cadence cuts both ways: a fork does not fall behind fast, but upstream refactors land in bulk when they land, and you inherit 130k lines you did not write. MIT means the fork is legally free. Budget the merge tax at a few days per stable release if you touch the renderer or element model, near zero for UI chrome only. A fork is the wrong first move and a reasonable third move.

---

## 2. Alternatives

Size column: gzipped bundle where Bundlephobia returned a figure, otherwise npm unpacked size, labelled per cell.

| Library | Licence | Latest / last publish | JSON scene an LLM can read+write | Freehand | Text in shape | Arrow binding | Multiplayer | Size | React fit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Excalidraw** | MIT ([npm](https://www.npmjs.com/package/@excalidraw/excalidraw)) | 0.18.1, 2026-04-20 | Yes, plus a beta skeleton API | Yes | Yes | Yes, native | Bring your own | 46.8 MB unpacked incl. fonts and locales; gzip **[unverified]**, Bundlephobia rate-limited | Native |
| **tldraw** | Proprietary ([LICENSE.md](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md)) | 5.4.2, 2026-09-18 | Yes, records store | Yes | Yes | Yes | Sync included in the SDK licence ([pricing](https://tldraw.dev/pricing)) | 14.9 MB unpacked | Native, best-in-class custom shapes |
| **@xyflow/react** | MIT ([LICENSE](https://raw.githubusercontent.com/xyflow/xyflow/main/LICENSE)) | 12.11.6, 2026-09-01 | Yes, nodes + edges arrays | No | Yes, nodes are DOM | Yes, edges are the model | Bring your own | 59.9 KB gzip ([bundlephobia](https://bundlephobia.com/package/@xyflow/react)) | Native, nodes are React components |
| **Konva / react-konva** | MIT ([npm](https://www.npmjs.com/package/konva), [npm](https://www.npmjs.com/package/react-konva)) | 10.5.0 / 19.3.0, Sep 2026 | You define it | You build it | You build it | You build it | No | 56.3 KB gzip ([bundlephobia](https://bundlephobia.com/package/konva)) | Good |
| **Fabric.js** | MIT ([npm](https://www.npmjs.com/package/fabric)) | 7.4.0, 2026-05-18 | Built-in `toJSON` | Built-in brushes | Editable textbox | No | No | 91.9 KB gzip ([bundlephobia](https://bundlephobia.com/package/fabric)) | No React layer |
| **PixiJS** | MIT ([npm](https://www.npmjs.com/package/pixi.js)) | 8.21.0, 2026-09-17 | No | No | Limited | No | No | 75.3 MB unpacked | WebGL renderer, not an editor |
| **Two.js** | MIT ([npm](https://www.npmjs.com/package/two.js)) | 0.8.24, 2026-08-29 | No | No | Minimal | No | No | small **[unverified]** | Drawing API only |
| **Paper.js** | MIT ([npm](https://www.npmjs.com/package/paper)) | 0.12.18, 2024-07-17 | Partial | Vector paths | No | No | No | medium **[unverified]** | Stale; vector geometry only |
| **perfect-freehand** | MIT ([npm](https://www.npmjs.com/package/perfect-freehand)) | 1.2.3, 2026-02-01 | n/a | This is the algorithm | n/a | n/a | n/a | 112 KB unpacked | Pure function, framework-free |
| **rough.js** | MIT ([npm](https://www.npmjs.com/package/roughjs)) | 4.6.6, 2023-11-20 | n/a | n/a | n/a | n/a | n/a | 170 KB unpacked | Pure renderer. Excalidraw's sketchy look. Effectively frozen, but complete. |
| **JointJS core** | MPL-2.0 ([npm `@joint/core`](https://www.npmjs.com/package/@joint/core)) | 4.3.3, 2026-09-04 | Yes, graph JSON | No | Yes | Yes, strong | No | medium | Wrapper needed. JointJS+/Rappid is the paid tier. |
| **draw.io / mxGraph** | Apache-2.0 ([LICENSE](https://raw.githubusercontent.com/jgraph/drawio/dev/LICENSE)) | `mxgraph` npm frozen at 4.2.2, 2022-06-20 | XML, via postMessage | No | Yes | Yes | No | n/a | iframe embed only, `embed=1` on embed.diagrams.net ([docs](https://www.drawio.com/doc/faq/embed-mode)). Not a React library. |
| **Penpot** | MPL-2.0 ([LICENSE](https://raw.githubusercontent.com/penpot/penpot/main/LICENSE)) | self-hosted app | n/a | n/a | n/a | n/a | Built in | n/a | Full application. No embeddable canvas SDK found in the technical guide **[unverified, only the guide index was read]** ([technical guide](https://help.penpot.app/technical-guide/)) |
| **Zwibbler** | Commercial | n/a | Yes | Yes | Yes | Some | Yes | n/a | JS widget ([docs](https://zwibbler.com/docs/)). Pricing page 404s, terms **[unverified]**. |
| **Miro / FigJam SDKs** | Hosted platform, vendor terms ([Miro](https://developers.miro.com/docs), [FigJam widgets](https://www.figma.com/widget-docs/)) | n/a | Via platform API | Host's | Host's | Host's | Host's | n/a | Your canvas lives in their product. Not an option for a standalone app. |

### tldraw licensing, in detail

The default licence permits use **only in development** ([tldraw.dev/community/license](https://tldraw.dev/community/license)). Production requires one of:

- **Trial**, 100 days ([pricing](https://tldraw.dev/pricing)).
- **Hobby**, discretionary, non-commercial only, and the "made with tldraw" watermark must stay on the canvas ([license docs](https://tldraw.dev/community/license)).
- **Commercial**, quote-based. A startup tier at $6,000 per year for up to 10 users is reported by secondary coverage **[unverified]** ([BigGo](https://biggo.com/news/202509190115_tldraw_SDK_4.0_Licensing_Debate)).

The licence also states the SDK contains technical measures that verify license keys, detect deployment environments and "ensure proper watermark display", and may transmit usage data for compliance ([LICENSE.md](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md)). For a personal project that may become a product: tldraw gives you the best custom-shape API in the category and a bill the day you charge money.

---

## 3. Build-your-own estimate

What a purpose-built canvas actually contains:

| Piece | Notes |
| --- | --- |
| Scene model + JSON | The easy part. A day. |
| Render loop | Canvas2D for freehand-heavy work, SVG if you want DOM text and CSS for free. Excalidraw and tldraw both went Canvas2D for the scene. |
| Hit-testing | Per-shape, plus tolerance for thin strokes and arrow tails. Consistently underestimated. |
| Selection and transform handles | Multi-select, rotate, proportional resize, group bounds. |
| Text editing | The worst item. Caret, IME, wrapping, measurement, mobile keyboards. |
| Arrows with binding | Anchors, re-route on move, arrowheads, elbow routing. |
| Undo/redo | Only sane if the scene model is immutable from day one. |
| Export PNG/SVG | Font embedding is the tail. |
| Shortcuts, touch, pinch-zoom, clipboard, paste-image | Individually trivial, collectively months. |

Compose from **rough.js** (sketchy stroke), **perfect-freehand** (pressure-variable pen, literally tldraw's algorithm, MIT) and an immutable store (Zustand, Immer, or Yjs if multiplayer is in scope).

The tldraw team describes five years building "thousands of table-stakes features, from rotating cursors to handling pasted images" **[unverified, secondary]** ([tldraw company page](https://tldraw.dev/company)).

Solo developer working with agents:

| Milestone | Person-weeks |
| --- | --- |
| Boxes, arrows, text, select, pan/zoom, undo, PNG export | 4 to 6 |
| Usable for DSA whiteboarding: freehand, snapping, multi-select, copy/paste, keyboard, decent text | 12 to 20 |
| Comparable to Excalidraw today | Do not attempt |

Maintenance tail: assume 1 to 2 days per month indefinitely for browser regressions, pointer-event quirks and font handling. That tail never ends, and it is work that produces no product value.

---

## 4. Recommendation: a staged path

**(a) Now, on Excalidraw. Do all of this; none of it is wasted.**

1. Replace `<MainMenu>`, `<WelcomeScreen>` and `<Footer>` with your own. Hide everything in `UIOptions.canvasActions` you do not want. That alone stops it looking like excalidraw.com.
2. Theme via the CSS variables on `.excalidraw` ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/customizing-styles)).
3. Ship the DSA assets as `libraryItems` and push them with `updateLibrary({merge:true})`. Arrays, linked lists, trees, recursion stacks, state tables, hash maps are all groups of native elements.
4. Put the asset palette in `<Footer>` or a `<Sidebar>`, and stamp with `setActiveTool({type:"custom", customType:"asset:tree"})` plus `onPointerDown` and `updateScene`.
5. Have the agent write scenes through the element-skeleton API, not raw elements ([docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)). Keep your semantic layer (asset id, kind, parameters) in `customData`, which is a real field on the 0.18.1 base element type, so the agent can re-find and mutate an asset it created.
6. Accept the native toolbar. Hiding it with CSS to substitute your own is possible but you own that hack forever.

**(b) Mid term: React Flow beside Excalidraw for the system-design track.** This makes sense. System-design diagrams are boxes, ports and edges, exactly React Flow's model, and its nodes are ordinary React components, so a "Kafka topic" node with live fields is trivial. MIT, 60 KB gzip, actively released. Two canvases is a cost, but the alternative is fighting Excalidraw's element model for semantic boxes, the one thing it will not give you. Trigger: the first system-design asset that needs behaviour, not appearance.

**(c) Later: fork vs custom vs tldraw commercial.**

| Option | Trigger |
| --- | --- |
| Stay on the package | Default. Hold here until a blocked surface actually costs you users. |
| Fork excalidraw/excalidraw | You need exactly two or three things upstream refuses: a custom element type, or the properties panel. Slow stable cadence makes this survivable. Do not fork for theming. |
| tldraw commercial licence | You are monetising, the canvas is the product, and custom shapes with real behaviour are the differentiator. Budget for the licence before you build on it, and treat the key-check and telemetry clauses as a product decision, not a legal footnote. |
| Build your own | Only if the whole product is the canvas and none of the above fit. On current evidence, no. |

---

## Summary

1. Excalidraw 0.18.1 is MIT and gets you about 70 to 75 percent of a fully custom UI.
2. Everything outside the canvas rectangle is fully replaceable: menu, footer, sidebar, top-right, welcome screen.
3. Everything inside it is not: the toolbar layout, the properties panel and the element vocabulary are closed.
4. Custom element types have been requested since 2022; both PRs were closed unmerged and the issue is still open.
5. Your DSA assets do not need custom elements. Library items plus a custom-tool stamper cover them.
6. Keep semantics in element `customData` so the agent can re-find what it drew.
7. A fork costs 130k lines of inherited code, against a stable release roughly once a year.
8. tldraw is technically the strongest alternative and is dev-only by default; production needs a paid or watermarked licence.
9. React Flow is MIT, 60 KB gzip and the right tool for the system-design track, later, not now.
10. Building your own reaches "usable" in 12 to 20 person-weeks and never stops costing maintenance. Do not.
