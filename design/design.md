---
version: alpha
name: Algopeeps — Deliberation Room (v6)
description: >
  Dense, neo-brutalist + futuristic cockpit for a Socratic
  algorithm-practice platform. Three concurrent agents converse with
  the user about code under review. Hairlines and tabular numbers
  carry the structure; a single warm terracotta accent carries the
  live moment. Sentiment (sage / amber / carmine) carries deltas and
  state. Motion is a budget, not a feature.

colors:
  # Surfaces — deep ink stack
  bg:           "#0E0E10"   # page base
  panel:        "#131316"   # primary surface
  panel2:       "#181818"   # nested / elevated surface

  # Text — bone above ink, descending toward faint
  bone:         "#ECE8DE"   # primary text
  ash:          "#A09B90"   # secondary text, labels
  dim:          "#7A766C"   # tertiary, hints, idle
  faint:        "#52504A"   # separator dots, disabled

  # Hairlines — 1px structural lines, two weights
  hairline:     "#272622"
  hairline2:    "#34322C"

  # Brand accent — terracotta. ONE JOB ONLY: live action.
  primary:      "#C8553D"   # alias for accent — kept so tooling doesn't auto-pick
  accent:       "#C8553D"
  # Note: accentSoft and accentBorder are runtime alpha values applied as
  # rgba(accent, 0.10) and rgba(accent, 0.55). Documented in prose; not
  # frontmatter tokens because the spec only accepts opaque hex.

  # Sentiment palette — never overlaps with accent. Carries deltas + states.
  success:      "#9AB87A"   # sage — passed tests, positive deltas
  successDim:   "#5D6F4A"
  warn:         "#D8B256"   # amber — stale, deferred
  warnDim:      "#7D6730"
  danger:       "#C75C4D"   # carmine — failed tests, destructive, negative deltas
  dangerDim:    "#6B3128"

typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: '"tnum"'
  bodyEmphasis:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.55
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"tnum"'
  monoLabel:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.16em"
  monoMicro:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
  numeric:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontFeature: '"tnum"'

rounded:
  none: "0px"
  xs:   "2px"
  sm:   "3px"
  md:   "4px"   # the ceiling — anything more reads as bubble UI

spacing:
  base: "8px"
  xs:   "4px"
  sm:   "8px"
  md:   "12px"
  lg:   "18px"
  xl:   "24px"
  xxl:  "36px"   # gutter on Active session and full-bleed page padding

components:
  surface:
    backgroundColor: "{colors.panel}"
    textColor:       "{colors.bone}"
    rounded:         "{rounded.none}"
    padding:         "{spacing.lg}"

  surfaceElevated:
    backgroundColor: "{colors.panel2}"
    textColor:       "{colors.bone}"
    rounded:         "{rounded.none}"
    padding:         "{spacing.lg}"

  button:
    backgroundColor: "{colors.panel}"
    textColor:       "{colors.bone}"
    typography:      "{typography.bodyEmphasis}"
    rounded:         "{rounded.xs}"
    padding:         "8px 14px"
    height:          "32px"

  # Primary CTA is a TEXT pattern in v6, not a filled rectangle.
  # Accent on transparent over bg yields high contrast and matches
  # the SEND ⏎ / ▸ recommended problem / start drill → patterns.
  buttonPrimary:
    backgroundColor: "transparent"
    textColor:       "{colors.primary}"
    typography:      "{typography.bodyEmphasis}"
    rounded:         "{rounded.xs}"
    padding:         "10px 18px"
    height:          "36px"

  iconButton:
    backgroundColor: "transparent"
    textColor:       "{colors.ash}"
    typography:      "{typography.body}"
    rounded:         "{rounded.xs}"
    padding:         "{spacing.sm}"
    size:            "28px"

  chip:
    backgroundColor: "transparent"
    textColor:       "{colors.bone}"
    typography:      "{typography.monoLabel}"
    rounded:         "{rounded.xs}"
    padding:         "4px 8px"
    height:          "22px"

  # Accent chip — bordered, not filled. The 10%-alpha wash described in
  # prose is applied at runtime via rgba; the canonical static token is
  # transparent with accent text.
  chipAccent:
    backgroundColor: "transparent"
    textColor:       "{colors.accent}"
    typography:      "{typography.monoLabel}"
    rounded:         "{rounded.xs}"
    padding:         "4px 8px"
    height:          "22px"

  inputBar:
    backgroundColor: "{colors.panel}"
    textColor:       "{colors.bone}"
    typography:      "{typography.body}"
    rounded:         "{rounded.sm}"
    padding:         "14px 18px"

  pane:
    backgroundColor: "{colors.panel}"
    textColor:       "{colors.bone}"
    rounded:         "{rounded.none}"
    padding:         "{spacing.lg}"

  paneHeader:
    backgroundColor: "transparent"
    textColor:       "{colors.dim}"
    typography:      "{typography.monoLabel}"
    padding:         "{spacing.md} {spacing.lg}"

  statusBar:
    backgroundColor: "{colors.bg}"
    textColor:       "{colors.dim}"
    typography:      "{typography.monoMicro}"
    height:          "26px"
    padding:         "0 {spacing.xxl}"

  tabActive:
    backgroundColor: "transparent"
    textColor:       "{colors.bone}"
    typography:      "{typography.monoLabel}"

  tabInactive:
    backgroundColor: "transparent"
    textColor:       "{colors.dim}"
    typography:      "{typography.monoLabel}"

  kpiNumber:
    backgroundColor: "transparent"
    textColor:       "{colors.bone}"
    typography:      "{typography.numeric}"

  deltaPositive:
    backgroundColor: "transparent"
    textColor:       "{colors.success}"
    typography:      "{typography.monoMicro}"

  deltaNegative:
    backgroundColor: "transparent"
    textColor:       "{colors.danger}"
    typography:      "{typography.monoMicro}"

  deltaNeutral:
    backgroundColor: "transparent"
    textColor:       "{colors.warn}"
    typography:      "{typography.monoMicro}"

  # The single ambient animation. textColor is irrelevant — the throb
  # never carries text — but it must be declared. Set to bg so the
  # linter sees a non-trivial pair (still flags as low contrast,
  # which is fine: the throb is not a text container).
  throb:
    backgroundColor: "{colors.accent}"
    textColor:       "{colors.bg}"
    rounded:         "{rounded.xs}"
    size:            "10px"

  divider:
    backgroundColor: "{colors.hairline}"
    height:          "1px"

  dividerStrong:
    backgroundColor: "{colors.hairline2}"
    height:          "1px"

  # 1px structural separator. textColor is unused at runtime but the
  # spec requires components to declare it; we point it at bone so
  # the linter stops flagging same-on-same.
  separator:
    backgroundColor: "{colors.faint}"
    textColor:       "{colors.bone}"
    height:          "1px"

  scoreSuccessDim:
    backgroundColor: "transparent"
    textColor:       "{colors.successDim}"
    typography:      "{typography.monoMicro}"

  scoreWarnDim:
    backgroundColor: "transparent"
    textColor:       "{colors.warnDim}"
    typography:      "{typography.monoMicro}"

  scoreDangerDim:
    backgroundColor: "transparent"
    textColor:       "{colors.dangerDim}"
    typography:      "{typography.monoMicro}"
---

# Overview

**Algopeeps** is a Socratic algorithm-practice cockpit. The user codes
in Neovim while three agents — `cost-guide`, `contrarian`,
`pattern-seer` — observe the buffer, ask questions, and sometimes
disagree with each other. The web UI is where the user replies,
challenges, defers, sketches, or pulls in a fourth Consultor agent on
demand. It is **not** an editor; it is a deliberation room.

The visual language is **dense, neo-brutalist + futuristic**:
hairline-bordered panes, monospaced labels in `UPPERCASE LETTERSPACED`,
tabular figures, deep ink surfaces, no drop shadows, no decorative
gradients, no rounded bubbles. The single warm accent
(terracotta) is reserved for live action: the throb glyph while an
agent generates, the targeted pane border, the active-mode chip, the
single primary CTA per page. State and sentiment are carried by a
separate three-color palette (sage / amber / carmine) so deltas read
clearly without ever competing with the brand.

The reading model is journalistic: numbers are bone, labels are
mono-uppercased, sentiment is read off the value's color, never off a
chrome decoration. If a designer is tempted to add a shadow, gradient,
or pill, that's the signal the hierarchy is wrong — fix the hierarchy.

The product also ships a light theme (warm bone paper · deep ink ·
slightly deepened accent) for contrast parity. See **Colors → Light
mode shifts** below; tokens swap, the language does not.

# Colors

## Functional roles, not decorative roles

Tokens are named for their job, not their hue. A future repaint
swaps the values; pages keep working.

| Token             | Use                                                             |
| ----------------- | --------------------------------------------------------------- |
| `bg`              | page base behind every surface                                  |
| `panel`           | primary surface — pane bodies, input bar, KPI strip             |
| `panel2`          | nested surface — Consultor right pane, problem-peek panels      |
| `bone`            | primary text and KPI numbers                                    |
| `ash`             | secondary text, agent role descriptions, table cells            |
| `dim`             | tertiary text, idle states, mono labels, status bar             |
| `faint`           | separator dots, disabled controls                               |
| `hairline`        | 1px structural lines (most borders)                             |
| `hairline2`       | 1px lines that need 1 stop more contrast (rare)                 |
| `accent`          | live action: throb, target border, active mode, primary CTA    |
| `accentSoft`      | accent fill at ~10% — focus rings, target pane wash             |
| `accentBorder`    | accent outline at ~55% — targeted pane outline-offset border    |
| `success`         | sage — passed tests, positive deltas, score-bar positives       |
| `successDim`      | sage at low opacity equivalent — graveyard / low-emphasis swaps |
| `warn`            | amber — stale state, deferred items, neutral-but-attention      |
| `warnDim`         | amber low-emphasis                                              |
| `danger`          | carmine — failed tests, destructive confirms, negative deltas   |
| `dangerDim`       | carmine low-emphasis                                            |

## Light mode shifts

Same roles, retuned values:

| Token         | Dark        | Light       | Note                                          |
| ------------- | ----------- | ----------- | --------------------------------------------- |
| `bg`          | `#0E0E10`   | `#F3EFE6`   | warm bone paper                               |
| `panel`       | `#131316`   | `#FAF6EC`   | one stop above bg                             |
| `panel2`      | `#181818`   | `#E7E0D0`   | nested surface (inverts polarity vs dark)     |
| `bone`        | `#ECE8DE`   | `#1C1814`   | deep ink                                      |
| `ash`         | `#A09B90`   | `#5A564D`   |                                               |
| `dim`         | `#7A766C`   | `#7D7868`   |                                               |
| `faint`       | `#52504A`   | `#B4AFA4`   |                                               |
| `hairline`    | `#272622`   | `#CFC7B3`   |                                               |
| `hairline2`   | `#34322C`   | `#DDD5C1`   |                                               |
| `accent`      | `#C8553D`   | `#B3452D`   | deepened terracotta for AA contrast on light  |
| `success`     | `#9AB87A`   | `#5B7A3E`   | moss                                          |
| `warn`        | `#D8B256`   | `#8A6520`   | dark amber                                    |
| `danger`      | `#C75C4D`   | `#A83A28`   | brick                                         |

Implementation: ship dark as default; expose light as a CSS-variable
override via a single root-level theme class. **Do not** duplicate
components per theme.

## The accent rule (non-negotiable)

`accent` is reserved for **live action**. That means at most:

- the **throb glyph** while an agent is generating (one square,
  pulsing 0.32 → 1.0 opacity, dissolves into the first streamed token)
- the **target pane outline** (1px outline at `accentBorder`, with
  `outline-offset: -1px` so the action row doesn't overpaint it)
- the **active-mode chip border** in the unified input bar (NOT the
  to-target chip — that one is also accent because targeting is a live
  action)
- the **single primary CTA per page** (e.g. `▸ recommended problem` on
  Today; `start drill →` on Post-Mortem and Analytics; `SEND ⏎` in the
  unified input bar)
- the **draw-overlay border** when the canvas is open

Never use `accent` for:
- KPI numbers (use `bone`)
- positive deltas (use `success`)
- table headers, links, hovers on neutral controls
- decorative dividers, hairlines, status indicators

# Typography

Two families, deliberately distinct jobs. There is no third family.

- **Inter** (`sans`) — body text, agent messages, problem
  descriptions, KPI labels written in normal case. Hierarchy is
  carried by **size and weight**, never by color.
- **JetBrains Mono** (`mono`) — IDs, code, table headers,
  page-section labels (`UPPERCASE 0.16em LETTERSPACED`), KPI numbers,
  status bar, `@` mentions, `[bracket controls]`, and any place a
  number must align in a column.

Numeric columns and KPI numbers use **tabular figures**
(`fontFeatureSettings: '"tnum"'`). This is non-optional — without it,
score deltas dance during streaming and the dashboards feel jittery.

Weights used: `400` regular, `500` medium, `600` bold (KPI numbers
only). No italics. No underlines (links are color-only or
arrow-suffixed: `all →`, `start drill →`).

# Layout

- **Base unit:** 8px. Pad in multiples (8, 12, 16, 18, 24, 36).
- **Page gutter:** 36px left/right on full-bleed pages
  (Today, Active, Post-Mortem, Profile, Analytics).
- **Three-pane Active layout:** equal-width panes; 36px outer gutter,
  18px between panes. The leftmost icon in the action row sits inside
  the pane border — i.e. action row uses 36/18 padding to match the
  pane body above it.
- **Z-levels:** exactly three — `bg / surface / elevated`. No
  parallax, no floating cards, no z-index races.
- **Borders:** 1px hairlines only. If you find yourself reaching for a
  2px or thicker border, that is the signal to introduce contrast via
  a tone shift on the surface, not a heavier line.
- **Tabular grid:** every numeric column aligns to a fixed pixel
  width. Don't let content size define column width — define the
  column width and clip with `tabular-nums`.

## Page heights

| Page                              | Designed height | Note                                       |
| --------------------------------- | --------------- | ------------------------------------------ |
| Today                             | 860px           | KPI strip + begin row + recent + rail      |
| Active · 3 agents                 | 1040px          | grew from 820 to fit global Deferred bar   |
| Active · Contrarian (focused)     | 1040px          | same chrome, double-click zoom             |
| Active · ? problem peek           | 820px           | overlay; bg page inert behind              |
| Active · Consultor                | 820px           | overlay; council strip dimmed              |
| Active · Draw overlay             | 820px           | overlay; full-bleed canvas                 |
| Post-Mortem · vertical timeline   | 920px           | timeline + right-rail detail               |
| Profile · cross-session           | 1080px          | heatmap + KPIs + chart + sets              |
| Analytics · deep dive             | 1100px          | tabbed table + callouts + agent cards      |

# Elevation & Depth

There are **no drop shadows** in this product. Depth is carried by
surface tone alone:

- `bg` is the floor.
- `panel` is one stop above bg.
- `panel2` is one stop above panel — used for nested surfaces inside
  an open overlay (Consultor right pane, problem-peek detail
  cards).

Hairlines (`hairline`, `hairline2`) draw the structure between
surfaces. They are not decorative — they are load-bearing typography
for the eye.

The single exception to "no light effects": the **throb glyph**
animates opacity (CSS keyframe `0%,100%{opacity:.32} 50%{opacity:1}`)
while an agent generates. It is the only ambient motion in the product.

# Shapes

Corners are flat or barely-radiused (`0–4px`). The 4px ceiling exists
only so chips and the unified input bar feel intentional rather than
sharp; pane corners are 0px.

No circular avatars. No pill buttons. Agent identity is communicated
by `@1 / @2 / @3` numerals in mono, plus an agent-name label, not by
a colored dot or photo.

The **throb glyph** is a 10×10px filled square at `rounded.xs`. It
must visibly pulse — designers occasionally ship it static; verify
animation in the rendered output.

# Components

This section names the pieces; the YAML frontmatter above defines the
exact tokens. Concrete behavioural specs (state machines, keyboard
maps, data bindings) live in `design/ui-ux-spec.md` and
`design/api-contract.md` — this file does not duplicate them.

## Council strip

`COUNCIL  ① cost-guide ● thinking   ② contrarian · idle   ③ pattern-seer ▸ spoke last`

One mono row per active session. State glyph follows the agent name:
`●` thinking (accent, animated), `·` idle, `▸ spoke last`,
`✓ replied`. Right side: `{N} questions deferred · see below ↓`
linking to the global Deferred bar.

## Pane (agent surface)

Three side-by-side, equal width. Header → body → vertical icon
**action row** (`↩ ⚔ ⏸ ✎ ☎`) at the bottom of the pane. Icons
are **icon-only** in `ash`, with `title=` tooltips on hover. Accent
appears on hover and on the currently-selected mode only — the
action row is a discoverability trigger, not a state display.

Pane states: **active**, **idle**, **replied (collapsed)** — the
last shows `LAST RESPONSE` summary text and `collapsed · click to
expand`.

## Targeted pane indicator

When the user `@N`-mentions an agent in the unified input, the
addressed pane gets a 1px outline at `accentBorder` with
`outline-offset: -1px`. This wraps the full pane top→bottom including
the action row. Other panes do **not** dim — that's focus mode (a
separate interaction).

## Focus mode (double-tap pane)

Double-tap a pane → it grows to ~50% width; flanking panes shrink to
~25% each AND get hard-dimmed/desaturated. Input target auto-sets to
the focused agent. Top problem strip, council strip, and the global
Deferred bar stay visually identical. `esc` exits.

## Unified input bar

```
TO  [@1 cost-guide]   MODE  [↩ reply]                tab to cycle target · / for slash commands
▸ {typed text…}                                                                       SEND ⏎
```

- `TO` chip: `accent` border (targeting is live action).
- `MODE` chip: neutral border (mode is a state, not live action).
- Whole bar wrapped in an accent-bordered container.
- Mode resets to `reply` after each send. Target is sticky.
- `SEND ⏎` is the page's single primary `accent` CTA on Active.

## Global Deferred bar

Bottom of Active. Lists every deferred question across all panes,
oldest first. Each row: quoted text + relative time (e.g. `5m ago`)
+ `REPLY ⏎`. **Show only one timestamp per row** — relative time
preferred; absolute time is duplicate noise. `⌘D` toggles bar
visibility.

## KPI strip (Today, Profile)

Five columns; 1px hairline border around and between cells. Number
in `bone` `numeric` (24px mono, tabular). Sub-delta below in
sentiment color (`success` / `warn` / `danger`). Labels above in
`monoLabel`.

## Activity heatmap (Profile)

GitHub-style 90-day grid. **Neutral graphite ramp**, never red. The
heatmap measures consistency, not sentiment.

## Status bar

`◐ neovim · twosum.go · @s17 · sonnet-4.6` — informational only.
Trimmed to four fields. The `◐` indicator turns
`warn` on WS reconnect, `danger` on disconnect.

## Bracket-syntax controls

Page-level controls render in brackets: `[problem] [tests] [pause]`.
The `@N` notation is **reserved exclusively** for agent targeting and
must never be used for page-level chrome.

## Throb glyph

The single ambient animation. 10×10px filled square at
`rounded.xs`. Pulses on `v6throb` keyframe. Sits inline with the
agent label (`@N ●  AGENT-NAME`) while generation is in progress. On
first streamed token, it dissolves (opacity → 0 in ≤200ms) into the
streamed text.

## Motion

- Opacity fades only.
- Duration ≤ 200ms.
- Easing: linear or `ease-out`. No springs, no bounces.
- The **throb keyframe** is the only ambient motion. Everything else
  is triggered by user action.

# Do's and Don'ts

## Do

- ✅ Use `accent` for live action ONLY. Throb, target border, active
  mode, single primary CTA per page.
- ✅ Carry sentiment in `success` / `warn` / `danger`. Numbers stay
  `bone`.
- ✅ Render numeric columns with `font-feature-settings: 'tnum'`.
- ✅ Use 1px hairlines for structure. Pad in multiples of 8.
- ✅ Use mono `UPPERCASE 0.16em LETTERSPACED` for section labels.
- ✅ Verify the throb glyph animates. A static square is a bug.
- ✅ Keep z-levels at exactly three: `bg / surface / elevated`.
- ✅ Reserve `@N` for agent targeting; use `[brackets]` for
  page-level controls.
- ✅ Show one timestamp per Deferred row; relative time preferred.

## Don't

- ❌ No drop shadows. None.
- ❌ No gradients (decorative). The accent has one job; sentiment has
  three; that's the whole palette.
- ❌ No purple-on-white, no neon, no Discord/Material/Vercel
  defaults.
- ❌ No rounded pills, no circular avatars, no chip backgrounds on
  every chip — most chips are bordered, not filled.
- ❌ No spring physics, no parallax, no scaling, no shadow
  transitions.
- ❌ No skeleton placeholders. The throb glyph IS the loading state.
- ❌ No `accent` on KPI numbers, table headers, hovers on neutral
  controls.
- ❌ No second mono or sans family. Inter + JetBrains Mono is the
  whole type system.
- ❌ No editor in the UI. Code lives in Neovim; CodeMirror 6 if
  shown is `editable.of(false) + tabindex=-1`.
- ❌ No `@1 tests`, `@1 profile`-style page chrome — that collides
  with agent-targeting grammar. Use `[brackets]`.

---

**Sources of truth this file pairs with**
(do not duplicate — these are authoritative for their domain):

- `design/ui-ux-spec.md` — page-by-page behavior, state machine, keyboard map
- `design/api-contract.md` — wire protocol (tRPC procedures + WS events)
- `design/stack-decision.md` — converged stack (Vite + React 19 + Tailwind v4 + shadcn/ui + tldraw + CodeMirror 6)
- `docs/stack-architecture.md` — full platform architecture
- `docs/pi-integration.md` — Pi runtime + MCP adapter detail

The original visual prototype lives in the design handoff bundle:
`v6-feedback-applied.jsx` (lines 8–55 define the canonical token
values reflected here).
