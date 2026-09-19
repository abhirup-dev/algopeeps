# WP-Q design — comment tool, asset palette, sidebar polish

Written before code. Everything below is the target; the build follows it.

## Diagnosis of the "horrendous" baseline (`.artifacts/wp-q-0-before.png`)

1. **Empty white badge circles.** `.thread-badge` uses `var(--color-primary)`, but Excalidraw
   defines its variables on `.excalidraw`, not `:root`. Our overlay is a *sibling* of
   `.excalidraw`, so every `var()` resolves to nothing: transparent circle + shadow. Root fix:
   define our own token block on `.canvas-host` (mirroring Excalidraw light/dark values) so
   the same names work inside and outside the editor.
2. Fullscreen button is an absolutely-positioned default `<button>` that overlaps the sidebar
   header.
3. Tabs are unstyled `<button>`s; footer button is the only way to comment; ISO timestamps;
   `HUMAN`/`AGENT` caps; raw ids as titles.

## Layout (1400×900, sidebar docked)

```
┌──┬──────────────────────────────────────────────────────────────┬────────────────────────────┐
│≡ │            [ lock hand sel ▭ ◇ ○ → — ✎ A img ⌫ ]     [💬][Threads][⤢][Library]│ Threads       [dock] [×]   │
│  │                                                              ├────────────────────────────┤
│▸ │      ┌ selection ───────────────┐  ← 8px gap                 │ (Open 2 | All 3)   2 open  │
│ ┌┴┐    │  💬 Comment   🧵 1       │  pill, island bg, r=999    ├────────────────────────────┤
│ │▤│    └──────────────────────────┘                            │ ① nums[1]         open  ✓  │
│ │⟶│    ┌────────────────┐②                                     │   ● You      2 min ago     │
│ │⋔│    │   two-sum      │  ← badge 22px purple, white ring     │   Why j = i + 1?           │
│ │▥│    └────────────────┘                                      │   ● Tutor    just now      │
│ │▦│                                                            │   It avoids comparing…     │
│ │⊞│                                                            │   [ Reply…            ][↵] │
│ │💬│                                                           │ ② pointer j       open     │
│ └─┘  palette island, left edge, 44px tiles                     │   Should this move first?  │
│  │                                                              │ ○ test case     resolved   │
│  │   [Open|All] ← footer = filter row (mirrors sidebar)         │                            │
└──┴──────────────────────────────────────────────────────────────┴────────────────────────────┘
```

- **Top-right island**: `💬` (toggle comment tool, `.active` = purple bg) and `Threads`
  (sidebar trigger). Fullscreen moves into the same island as an icon-only `⤢` button so
  nothing floats over the sidebar. (Deviation from "only two buttons": the third is the host
  fullscreen toggle, which had to live somewhere; flagged in NOTES.)
- **Selection bubble**: overlay pill centred 8 px above the selection bbox; hidden while
  `cursorButton==="down"`, `isResizing`, `isRotating`, `newElement`, `selectionElement`,
  `editingTextElement`.
- **Palette**: island at `left: 12px`, vertically centred; collapsible to a 20×44 `▸` tab.
- **Footer**: Excalidraw `<Footer>` slot holds the Open/All filter (same segmented control).

## Visual language

Spacing scale (px): `4 · 8 · 12 · 16 · 24`. Everything snaps to it.
Radii: tile/pill `8`, badge/pill-button `999`, island `8` (`--border-radius-lg`).
Shadow: `--shadow-island` (Excalidraw's own three-layer shadow).

Type (font `--ui-font`, Assistant/system):

| role            | size | weight | colour                         |
|-----------------|------|--------|--------------------------------|
| sidebar title   | 15   | 600    | `--text-primary-color`         |
| row title       | 13   | 600    | `--text-primary-color`         |
| message body    | 13   | 400    | `--text-primary-color`, lh 1.45|
| author / time   | 11   | 600/400| `--color-muted` (time)         |
| badge number    | 11   | 700    | white                          |
| tab / status    | 12   | 500    | inherit / `--color-muted`      |
| tooltip         | 12   | 500    | white on `#1b1b1f`             |

Colours (Excalidraw names, light → dark values copied from its stylesheet, plus ours):

| token                          | light      | dark             | use                       |
|--------------------------------|------------|------------------|---------------------------|
| `--island-bg-color`            | `#ffffff`  | `#232329`        | palette, pill, tooltip bg |
| `--color-surface-low`          | `#ececf4`  | hsl(240 8% 15%)  | segmented-control track   |
| `--color-surface-high`         | `#f1f0ff`  | hsl(245 10% 21%) | hover, borders            |
| `--default-border-color`       | = surface-high             | hairlines               |
| `--text-primary-color`         | `#1b1b1f`  | `#e3e3e8`        | text                      |
| `--color-muted`                | gray-80    | gray-30          | timestamps, previews      |
| `--color-primary`              | `#6965db`  | `#a8a5ff`        | Excalidraw accent (tool active only) |
| `--agent`                      | `#9c36b5`  | `#c77dff`        | badges, Tutor dot, primary buttons   |
| `--agent-soft`                 | `#9c36b51f`| `#c77dff33`      | unread row tint, tile hover           |
| `--human`                      | `#1b1b1f`  | `#e3e3e8`        | You dot                   |
| resolved                       | `--color-gray-40` `#b8b8b8` | badge/dot when resolved |

Rule: purple `#9c36b5` is *the* collaboration colour (badges, Tutor, Reply, Comment tool
active). Excalidraw's indigo `--color-primary` stays for Excalidraw's own controls. Never mix
the two on one component.

## Components

**Badge** 22×22, `background: var(--agent)`, `box-shadow: 0 0 0 2px #fff, 0 2px 6px rgb(0 0 0/.25)`,
number 11/700 white. `.is-unread` → `animation: badge-pulse 1.6s infinite` on the ring
(box-shadow spread 2→5 px in agent-soft). `.is-resolved` → grey fill. Empty text impossible: the
number is `item.index`, always ≥ 1; the fill colour is now a literal.

**Selection pill** `height 28`, padding `0 10`, radius 999, island bg + shadow, 12/600 text,
two segments separated by a 1 px hairline: `💬 Comment` · `🧵 N` (only if N>0).

**Palette tile** 44×44, radius 8, transparent → `--color-surface-high` hover, `--agent-soft`
+ 1 px agent border while dragging-armed (comment tool active on the 💬 tile). SVG glyph 24×24,
`stroke: currentColor` 1.6 px. Tooltip to the right (`title` + custom `::after` label on hover).

**Row** padding `12 12 12 8`, grid `[22px badge] [1fr] [auto]`. Header line: title 13/600
truncated at 40 chars, `open` (agent purple text) / `resolved` / `detached` (muted) 11 px pill.
Expanded: messages with `● You` / `● Tutor` (6 px dot black/purple) + relative time, body 13 px.
Compose/reply: 1 textarea, rows 1→5 auto-grow, 13 px, radius 8, border `--default-border-color`,
focus ring 2 px agent-soft; `Reply` primary purple 12/600 h 28 radius 8; `✓` ghost 24×24 in the
row header (title `Resolve`); `Reopen` ghost text button for resolved rows.

**Segmented control** (tabs + footer): track `--color-surface-low` radius 8 padding 2; segment
padding `4 10`, 12/500; selected segment `--island-bg-color` + `--shadow-island` lite.

## Behaviour summary

- `C` on canvas toggles comment tool; `Esc` back to selection; cursor crosshair via
  `.canvas-host.is-commenting canvas.interactive`.
- Comment tool click: hit-test top-most element (`getSceneElements` reverse order, bbox), open
  sidebar on tab `open`, focus compose with that target; empty click → 2 s toast.
- Palette drag: `application/x-canvas-asset`; drop handled on `.canvas-host` in the capture
  phase so Excalidraw never sees it; `updateScene` with `CaptureUpdateAction.IMMEDIATELY`
  (undoable) and the new group selected. Click = stamp at viewport centre.
- Theme: tokens on `.canvas-host` keyed by `data-theme`; the dev page has no `?theme=dark`
  today so dark is verified by CSS only (noted).
