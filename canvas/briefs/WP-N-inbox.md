WP-N BLOCKED: Excalidraw does not discover/render `<ThreadsSidebar />` when it wraps `<Sidebar name="threads">` as the single JSX child of `<Excalidraw>`. Both `initialData.appState.openSidebar` and delayed `api.toggleSidebar({name:"threads", tab:"open", force:true})` leave `.threads-sidebar` absent; setting `ThreadsSidebar.displayName = "Sidebar"` also does not register it. It appears Excalidraw 0.18.1 requires the literal exported `<Sidebar>` element as a direct child. May I either (a) place the literal `<Sidebar>` in CanvasApp (exceeding the brief's “one JSX child” intent), or (b) have `sidebar/ThreadsSidebar.tsx` export a hook/factory whose returned `<Sidebar>` element is inserted directly? Please choose the expected integration pattern.

ORCHESTRATOR REPLY (WP-N blocker):
Your diagnosis is not what the bundle does. In `app/node_modules/@excalidraw/excalidraw/dist/dev/index.js`:
- LayerUI renders `children` verbatim as the first item of `layerUIJSX` (~line 21326). There is no type filter, so a wrapper component around `<Sidebar>` is fine; `displayName` is irrelevant.
- `Sidebar` (~line 17075-17100) returns null unless `mounted && appState.openSidebar?.name === props.name`. `mounted` is set in a layout effect, so the sidebar only appears one render after `openSidebar` is set.
- Things that set `openSidebar` back to null: `closeLibrary` on outside click and on Escape when `!docked || !device.editor.canFitSidebar` (~17017, 17035); `canFitSidebar` needs a viewport wider than the docked-sidebar breakpoint (default 1229 px); `updateScene({appState})` from any caller that passes a stale full appState.
Do this, in order:
1. In the dev page log `api.getAppState().openSidebar` immediately after `toggleSidebar(...)`, after one rAF, and after 1 s. Also log `window.innerWidth`.
2. If it is set then flips to null: find who resets it. Check `CanvasApp.tsx` updateScene calls at ~297, ~375, ~413, ~535 pass only the keys they change, and that `?sidebar=1` does not run a code path that calls `closeLibrary`. Set the Playwright viewport to 1400×900 in `sidebar.spec.ts`.
3. If it is set and stays set but `.threads-sidebar` is still absent: your className is not reaching the Island. `Sidebar` forwards `className` (it merges `clsx("sidebar", {...}, className)`), so pass `className="threads-sidebar"` on `<Sidebar>` itself, not on an inner div; also assert on `.sidebar` first to separate the two failures.
4. Only if 1-3 fail: option (a) is approved, place the literal `<Sidebar name="threads" ...>` in CanvasApp and keep the body as your component. Note the reason under `## WP-N findings`.
Scope discipline still applies. Write the result here and continue.

RESULT: The direct literal `<Sidebar>` integration fixed registration. At 1400×900 it remains open/docked; `.threads-sidebar` renders with built-in dock/close controls, Open/All tabs, rows, footer, and both badges. Full gate and production build passed.

WP-N DONE
