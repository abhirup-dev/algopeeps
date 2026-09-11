# Algopeeps — Designer Feedback, Round 1

Aesthetic direction is on track. The changes below are **scope and system**, not visual taste.

---

## Keep — do not change

Explicitly call these out so they survive the next revision:

- **Single warm accent paired with the deep ink base.** Pitch-perfect for the brief. Don't add a second brand color; the secondary palette below is *functional*, not brand.
- **No avatars, no mascots, no glow, no skeuomorphism, no decorative gradients.** Hold the line on this through every revision.
- **Mono for IDs / sans for body** discipline. Don't introduce a third family; add weight/size tokens within these two.
- **Bottom status bar concept.** Trim the contents (see global section below) but keep the bar itself.
- **Vertical event timeline in `Post-Mortem · Vertical timeline`.** Fresh and legible — a better answer than a horizontal scrubber. Keep as the primary post-mortem layout.
- **Cross-session activity heatmap in `Profile · Cross-session`.** Right view, right page; only the hue needs fixing.
- **Throb glyph as the "thinking…" affordance** (visible in `Active · 3 agents` CONTRARIAN column and `Active · Consultor`). The pattern is understood — keep using it as the only ambient motion in the product.
- **Hairline rules over fills** for layout structure. No card chrome, no shadows.
- **Tabbed top-nav** (`TODAY · SESSIONS · PROFILE · ANALYTICS`). Reads as a contents page, not pills. Keep.

---

## Global system changes (apply across all pages)

### Color: reserve the brand accent

The terracotta is currently doing four jobs (live action, KPI numbers, score deltas, callouts). Reserve it for one job.

- **Brand accent (terracotta)** — *only* the live action: input prompt, throbbing "thinking" glyph, the single primary CTA per page.
- **Sentiment palette (new)** — `success` (sage / lime), `warn` (amber), `danger` (carmine). Use for passed/failed tests, score deltas, stale state. Reference: Radix Colors role ramps.
- **Neutral ramp** — bone, ash, dim, faint. Carries 90% of the UI.
- KPI numbers (`80%`, `27m`, `+3.4`) → bone, bold, large. **Not terracotta.**

### Type hierarchy: weight + size, not color

Three weights × four sizes is the system. No mixing serif and sans inside the UI. Tabular figures mandatory for any numeric column. Hierarchy comes from `display` / `headline` / `body` / `label-micro` and `regular` / `medium` / `bold`. References worth pulling from: Linear, Vercel Geist, Untitled UI.

### Status bar trim (every page)

Currently: `neovim · twosum.go · @s17 · capture idle-3s · agents 120ms · model sonnet-4.6 · drawing mode · ⌘K palette`.
Keep: `neovim · file · @snap · model`. Move `capture idle-3s · agents 120ms` into a hover peek. Drop the always-visible `⌘K palette` hint.

### Activity heatmap

In `Profile · Cross-session`, change red squares to a neutral graphite ramp. Red reads as danger.

---

## `Today`

1. **Strip the live KPI strip** *as currently colored.* The five-cell `STREAK · SOLVE RATE · AVG SCORE · MEDIAN TIME · WEAK TOPIC` strip stays, but numbers go neutral; deltas use sentiment palette (`+3.4` is success-green, not terracotta). Brand accent leaves this strip entirely.
2. **Three start CTAs** (`pick a problem · surprise me · resume #137`) — only one carries the brand accent. The active/recommended one. The others are neutral inline links.
3. **`recommended` line on the right of CTA row** — keep, but reduce to a single inline mention rather than a separate column header.
4. **`recent` table — score column** — score deltas use sentiment palette (positive = success, negative = danger). Currently terracotta-colored which is wrong.
5. **`recent patterns` + `drill queue` panels** — keep. They are this page's right answer.

---

## `Active · 3 agents` — biggest changes

This page needs the most rework. Three structural changes:

### 1. Header replaces score economy with problem context + council state

Remove from the header:

- `SESSION SCORE +4` and the bar meter
- `ACTIVELY LEARNT +3 · CHALLENGES +2 · CONSULTS −1` counters

Replace with:

- **Problem strip** — `TWO SUM · MEDIUM · TWO-POINTER` plus a `[? expand]` peek that opens an inline drawer with constraints + examples. One keystroke (`?`) toggles. Always available; never opens a separate page.
- **Council strip** — small chips for each agent showing live state: `① cost-guide ✺ thinking · ② contrarian ⌛ idle · ③ pattern-seer ▸ spoke last · 3 deferred`. The throb glyph next to whichever agent is currently generating is the only motion. The deferred count is a global indicator (see point 3 below).

No live score. No counters. Engagement signal is the council strip.

### 2. Per-pane action rows + one unified input bar

Keep all five verbs in v0 (discoverability over minimalism for v0). Restructure as follows:

- **Each agent pane** gets its own action button row at its base: `↩ ⚔ ⏸ ✎ ☎`. Each button has a hover tooltip (copy below). These are *triggers*: clicking any button focuses the unified input and sets target + mode.
- **One unified input bar at the bottom** of the page (not per-pane). Two small chips above the input show current `to` and `mode`. Mode resets to `reply` after each send; target is sticky.
- **`@1 / @2 / @3` mentions** in the typed text set the target. Multi-target allowed (`@1 @3`). Targeted panes get a 1px accent border (no dimming of the others). Untagged input → broadcast to all three; all three get the soft border.
- **Slash equivalents** for keyboard users: `/challenge`, `/draw`, `/defer`, `/consult`.

Tooltip copy:

| Verb | Tooltip |
|---|---|
| `↩ Reply` | "Write a response to this agent." |
| `⚔ Challenge` | "Push back on this agent's claim." |
| `⏸ Defer` | "Park this for later — come back when you have clarity." |
| `✎ Draw` | "Sketch a diagram to send to this agent." |
| `☎ Consult` | "Ask the Consultor about this agent's last point." |

Behaviorally:
- `Challenge` frames the message as a counter — agent is prompted to defend / refine.
- `Defer` pins the agent's last message to that pane's deferred shelf, no reply required, agent stops pinging on this thread until resumed.
- `Draw` opens the `Active · Draw overlay`; on send, the drawing is attached as the message.
- `Consult` opens `Active · Consultor` focused on the latest message in the targeted pane as context.

### 3. Deferred shelf per pane

Each pane gets a collapsible shelf at the top, default collapsed, showing only the count:

```
① cost-guide
▾ deferred (2)        ← click to expand
─
[chat continues below]
```

Expanded:

```
① cost-guide
▾ deferred (2)
  • "what about duplicates?"   reply →
  • "worst-case lookup?"       reply →
─
[chat continues below]
```

- `reply →` on a deferred item → unified input focuses, target sets to that pane, deferred message is quoted inline above the typing area as context. Sending dismisses the item from the shelf.
- Defer is reversible: a small `↩` on each deferred row moves it back to live without a response.
- The **council strip's `N deferred` count** is the global indicator. Clicking it does not expand all panes — it scrolls/focuses the first pane with a deferred item.

### 4. Single feed within each pane

Keep the three parallel panes. Inside each pane, conversation flows top-to-bottom — no sub-columns. Same chat treatment as currently sketched, but speakers labeled as `agent` / `you` in mono small-caps; no avatars, no chips beyond the agent identifier in the pane header.

### 5. Bottom-of-page residue (currently in `Active · 3 agents`)

The `RESPOND TO  cost-guide  contrarian  pattern-seer` selector and `REPLY · CHALLENGE +C  DEFER +D  DRAW · CONSULT +?` row at the very bottom go away — replaced by the unified input + per-pane buttons described above.

---

## `Active · Consultor`

1. **Drop the live cost stinger.** Remove `each consult costs −1 against the session score` from the panel header. Consultor cost is recorded silently and surfaced only in `Post-Mortem · Vertical timeline` (e.g., `consultor used N times`). The live page should not show a running point penalty.
2. **Header copy** changes from `lifetime · helps you answer` to `Consultor — ask anything; surfaced in post-mortem.` Or similar. No score language.
3. **Pause indication on the three left panes** (currently `paused while you consult`) — keep. Good signal.
4. The Consultor's own input bar at the bottom right (`▸ reply to consultor`) replaces the unified input bar while the panel is open. When the user closes Consultor, the unified input bar returns. Make this transition explicit.

---

## `Active · Draw overlay`

1. **Keep** — confirmed in scope for v0.
2. **`SEND TO` selector** at the bottom currently shows `cost-guide · contrarian · pattern-seer`. Allow multi-select (consistent with the unified input's multi-target rule). User can broadcast a sketch to multiple agents.
3. **`DRAW A DIAGRAM` header copy** — "explain visually — agents will read the sketch" is good; keep.
4. **Tool sidebar** — looks fine. Confirm the icon set matches the rest of the app's icon language (Lucide or whatever the design system standardizes on).

---

## `Post-Mortem · Vertical timeline`

Mostly approved. Small changes:

1. **Score bar at top** (`SESSION SCORE +4`) — keep here, but recolor: positive = success-green, not terracotta. Brand accent stays off the score bar.
2. **`+1 / −1` deltas in the timeline rows** — sentiment palette, not terracotta.
3. **Right rail detail panel** + **`Replay` tab** appear to overlap. Confirm they are not redundant. If `Replay` is autoplay-of-the-same-data, consolidate: timeline = manual scrub, Replay = press-play autoplay over the same surface.
4. **`REVIEWER'S NOTE`** stays at the bottom right. This is the post-mortem's highest-value piece — make sure typography on this card is the strongest on the page.

---

## `Profile · Cross-session`

1. **Activity heatmap** — neutral graphite ramp instead of red. Add a small `less / more` legend (already there — keep).
2. **KPI cards** (`SESSIONS · SOLVED · AVG SCORE · MEDIAN TIME · CONSULTS / SESS · CHALLENGES / SESS`) — numbers neutral bone, deltas in sentiment palette, units in ash.
3. **`SESSION SCORE — LAST 30 SESSIONS` bar chart** — currently terracotta bars. Recolor: bars in neutral graphite; only the brand accent appears on hover or on the most-recent bar (the "live" one).
4. **Problem sets table** — keep for v0 reference. `PROGRESS` bars use the same hue rule (neutral fill; brand accent only for the in-progress set). `AVG SCORE` deltas → sentiment palette.

---

## `Analytics · Deep dive`

1. **Tabs** (`WEAK POINTS · STILL WEAK · MOST PROGRESS · PER AGENT · PER PROBLEM SET`) — keep structure. Naming pass later.
2. **`BY TOPIC — WEAKEST FIRST` table** — `DELTA 30D` column should use sentiment palette (`+0.6` green, `−0.4` red). Currently mixed.
3. **`STILL A WEAK POINT` and `MOST PROGRESS` callouts** — keep. The two-up callout pattern is the page's strongest layout idea.
4. **`WHICH AGENT MOVED THE NEEDLE`** — keep. Numbers neutral; deltas in sentiment palette. The agent names (`COST-GUIDE`, `CONTRARIAN`, `PATTERN-SEER`, `CONSULTOR`) are samples; actual naming TBD.
5. **`start drill →`** — single brand-accent CTA per page rule applies. This is `Analytics`'s primary action; it gets the accent.

---

## Out of scope for this round (mentioned, not for v0)

- Naming of agents (`COST-GUIDE` etc.) — placeholder; pass later.
- Naming of tabs / labels (`STILL WEAK`, `ACTIVELY LEARNT`) — pass later.
- The action verbs on `Active · 3 agents` may consolidate post-launch once we see real usage. For v0, keep all five visible.

---

## Summary checklist

- [ ] Restrict brand accent to live-action / throb / single primary CTA per page.
- [ ] Introduce sentiment palette (success / warn / danger) for deltas, test states, score sentiment.
- [ ] Type hierarchy via weight + size; tabular figures for all numeric columns.
- [ ] Trim status bar to `neovim · file · @snap · model`.
- [ ] `Today`: recolor KPI strip and score column; one accent CTA only.
- [ ] `Active · 3 agents`: replace score-economy header with problem strip + council strip; add `[? expand]` problem peek; per-pane action button rows; unified input bar with target/mode chips and `@N` multi-target with border highlight; per-pane deferred shelves with reversible defer; remove the `RESPOND TO` selector and bottom action row.
- [ ] `Active · Consultor`: remove live `−1` cost stinger; reword header; explicit input-swap behavior.
- [ ] `Active · Draw overlay`: allow multi-select on `SEND TO`.
- [ ] `Post-Mortem · Vertical timeline`: recolor score bar and deltas; clarify Replay vs timeline overlap.
- [ ] `Profile · Cross-session`: heatmap to neutral; recolor KPI numbers, score chart, progress bars.
- [ ] `Analytics · Deep dive`: deltas to sentiment palette; primary CTA accent on `start drill →`.
