# Algopeeps — UI/UX Spec

Final implementation spec for the v0 frontend. Reference for React build. Pairs with `api-contract.md`.

---

## Global system

### Color tokens (functional, not decorative)

| Token | Use |
|---|---|
| `ink.base` (deep ink) | page background |
| `ink.surface` | panel / pane surfaces |
| `ink.elevated` | nested panes (consultor right pane, problem peek panels) |
| `bone` | primary text |
| `ash` | secondary text, labels |
| `dim` | tertiary, hints, idle states |
| `accent` (terracotta) | live action only — primary CTA per page, throb glyph, active mode chip border, target chip border, in-progress state markers |
| `success` | passed tests, positive deltas |
| `warn` | stale state, deferred-item indicator |
| `danger` | failed tests, destructive confirms, negative deltas |

**Rule:** `accent` carries one job (live action). Sentiment is its own palette. KPI numbers and stat columns are `bone`, never `accent`.

### Type tokens

- One mono, one humanist sans. No third family.
- Sizes: `display / headline / body / label / micro`.
- Weights: `regular / medium / bold`.
- Numeric columns use tabular figures.
- Hierarchy via size + weight, not color.

### Motion budget

- Opacity fades only, ≤200ms.
- One ambient animation in the product: the **throb glyph** while an agent is generating. It pulses; on first token, it dissolves into the streamed text.
- No spring physics, no parallax, no scaling, no shadow transitions.

### Layout primitives

- 1px hairline borders. No drop shadows. Corner radius 0–4px.
- Three z-levels max: `base` / `surface` / `elevated`.
- Tabular grid; 8px base unit.

---

## Page — `Today`

**Purpose:** hub for picking a session and reviewing recent work.

**Top:** tabs `TODAY · SESSIONS · PROFILE · ANALYTICS`.

**KPI strip** (`STREAK · SOLVE RATE · AVG SCORE · MEDIAN TIME · WEAK TOPIC`):
- Numbers `bone` bold large.
- Sub-deltas use sentiment palette (`+0.6` success, `−3m` evaluated by context — `−3m` on time is actually success).
- Strip is read-only, not interactive.

**Begin a session row:**
- Three inline links: `[recommended problem] · pick a problem · surprise me · resume #N`.
- Only the recommended one carries `accent`. Others are neutral inline links.
- `resume #N` only renders if the user has a paused session.

**Recent table** (collapsed columns: `id, title, diff, time, score, when`):
- `score` column uses sentiment palette per row.
- Click any row → `Post-Mortem · vertical timeline` for that session id.
- `all →` link → full sessions view.

**Recent patterns + drill queue** (right rail):
- Patterns: a flat list of strings, surfaced from `Analytics` patterns.
- Drill queue: ordered list with `start drill →` accent on the first item only.

**Status bar (bottom, every page):** `neovim · {file} · @{snapshot} · {model}`.

**No data needed live.** This page reads from REST snapshots; no WS subscription.

---

## Page — `Active · 3 agents`

The live session. Most complex surface in the product.

### Header

```
SESSION                                                  ⏱ {timer}
Two Sum  {medium} {tag} {tag}  [? expand]      [problem] [tests] [pause]
```

- `Two Sum {difficulty} {tags}` — read from `session.problem`.
- `[? expand]` — pressing `?` or clicking opens `Active · ? problem peek` overlay.
- `[problem] [tests] [pause]` — bracket syntax for page-level controls. Clicking each opens its overlay or toggles state. `@N` syntax is **reserved** for agent targeting.
- `⏱ {timer}` — top-right small clock, runs from `session.started_at`. Pauses on `pause`.

### Council strip

```
COUNCIL  ① cost-guide ● thinking   ② contrarian · idle   ③ pattern-seer ▸ spoke last
                                                          {N} questions deferred · see below ↓
```

- One chip per agent. State glyph follows the agent name:
  - `●` (animated, accent) — agent is generating.
  - `·` — agent is idle (no pending generation, no recent message).
  - `▸ spoke last` — agent's most recent turn is the last in the session.
  - `✓ replied` — user has replied to the agent's last message; state until next agent turn.
- Right side shows total deferred count across all agents. Click → scrolls deferred bar into view at bottom.

### Three agent panes (parallel, equal width)

Each pane:

```
@N ●  AGENT-NAME
      role description (small ash)

AGENT
{message text — streamed token by token}

YOU
{user's reply if any}

▢ thinking…   ← throb glyph while agent generates
```

**Pane states:**
- **Active conversation** (panes 1, 2 in screenshots): full-height chat, agent message + user reply + throb if generating.
- **Replied collapsed** (pane 3 in screenshots): pane shows `✓ REPLIED` in council strip and `LAST EXCHANGE` summary in pane body, with `collapsed · click to expand`. Click expands to full active treatment.
- **Idle**: pane shows latest agent message; no throb glyph.

**Per-pane action row** (icon-only, hover tooltip):

| Icon | Verb | Tooltip | Behavior |
|---|---|---|---|
| `↩` | reply | "Write a response to this agent." | sets target + `mode: reply` |
| `⚔` | challenge | "Push back on this agent's claim." | sets target + `mode: challenge` |
| `⏸` | defer | "Park this for later." | adds latest agent message to deferred list; no input expected |
| `✎` | draw | "Sketch a diagram to send." | opens `Active · Draw overlay` with target preset |
| `☎` | consult | "Ask the Consultor about this." | opens `Active · Consultor` with target message as context |

Icons are `ash` by default. `accent` only on hover and on the currently-selected mode (which also reflects in the input mode chip).

### Focus mode (double-tap pane)

Double-tap any pane → enters `Active · {AgentName} (focused)`:
- Focused pane scales to ~60% width, others dim hard.
- Input target auto-sets to the focused agent.
- `esc` or another double-tap exits.
- The dim is intentional; this is a separate interaction from `@N` mention.

### `@N` mention behavior (in input)

Typing `@1` / `@2` / `@3` in the input:
- Adds the mentioned agent to `target` set.
- Targeted pane(s) get a 1px `accent` border. **Other panes do not dim** (this is the distinction from focus mode).
- Multi-target supported (`@1 @3`); both panes border.
- Untagged input → broadcast to all three; all three get a soft border.

### Unified input bar

```
TO  [@1 cost-guide]   MODE  [↩ reply]                    tab to cycle target · / for slash commands

▸ {typed text…}                                                                          SEND ⏎
```

- `TO` chip: shows target(s). Bordered `accent`. Click to clear; `tab` cycles.
- `MODE` chip: shows current mode. Neutral border (NOT accent). Set by clicking a pane verb, by slash command (`/challenge`, `/defer`, `/draw`, `/consult`), or by clicking the chip.
- Mode resets to `reply` after each send. Target persists (sticky).
- Input grows vertically up to ~5 lines, then scrolls.
- `⏎` sends. `Shift+⏎` newline.
- `SEND ⏎` button is the page's single primary `accent` CTA.

### Deferred bar (bottom)

```
DEFERRED  3 questions · oldest first · click any to reply now              ⌘D toggle

  "what about duplicates?"                                            5m ago    REPLY ⏎
  "compare to 3sum — is this the same find-pair pattern, or…"         3m ago    REPLY ⏎
  "worst-case lookup if collisions?"                                  47s ago   REPLY ⏎
```

- Lists every deferred question across all panes, time-ordered (configurable).
- Click `REPLY ⏎` on any row: input bar focuses, `target` sets to the agent who originated the question, message is quoted inline above the typing area as context, mode = `reply`. Submit dismisses the item from the bar.
- `⌘D` toggles the bar visibility (it can take significant vertical space).
- Council strip's "see below ↓" pointer links to this bar.
- An item is reversible: a small `↩` next to each row moves it back to live without responding.

### Status bar (bottom)

`◐ neovim · twosum.go · @s17 · sonnet-4.6` — informational only.

---

## Page — `Active · ? problem peek`

Overlay opened from the `[? expand]` chip on `Active · 3 agents`. Triggered by `?` key or click.

**Left panel:** problem detail. Title, difficulty, tag chips, full description, examples (3+ shown as quoted blocks with `nums / target / output / note`).

**Right panel:** `YOUR HISTORY` (attempts, best score, avg time vs. topic median, detection on this pattern), `TESTS` (per-test name with status, `RUN ALL` button — see test execution semantics in API contract), `RELATED` problems (linked by tag/pattern).

**Dismiss:** `esc` or click `[? collapse]` or click outside the overlay.

**Background:** `Active · 3 agents` remains in place but inert; the live session keeps streaming in the background. No state is paused.

---

## Page — `Active · Consultor`

Opened from `☎` icon on any agent pane.

**Header:** session strip + council strip. Council strip shows all agents as `❚❚ paused` and a right-side `☎ consultor active` indicator in `accent`.

**Three left panes:** show the last agent message they had in flight, dimmed, with `paused while you consult` for inactive agents.

**Right panel (elevated):**

```
☎ CONSULTOR · HELPLINE                                              ask anything; surfaced in post-mortem.

HELPING YOU ANSWER · @{N} {agent}
"{quoted message that triggered the consult}"

CONSULTOR
{streamed message}

YOU
{your reply}

CONSULTOR
{streamed message}
```

**Consultor input:**

```
CONSULTOR INPUT · RETURNS TO COUNCIL ON CLOSE                                     esc · close

▸ {typed text}                                                                       SEND ⏎
```

- This input replaces the unified council input while consultor is open.
- `esc` or `[close]` closes consultor → council resumes; agents un-pause (their generation if any was running picks back up; no message is lost).
- No live cost shown. Cost is recorded silently (consultor-use count surfaced only in post-mortem).

---

## Page — `Active · Draw overlay`

Opened from `✎` icon on any agent pane.

**Header:** session strip (no council, fully overlaid).

**Canvas:** centered drawing surface. Tool sidebar on the left:
- pen, square, circle, line, arrow, text, pin/marker, eraser.

**Bottom strip:**

```
SEND TO · MULTI-SELECT   [@1 cost-guide ✓]  [@2 contrarian]  [@3 pattern-seer ✓]      send ⏎
```

- Multi-select chips: each agent toggleable. Selected = `accent` border + `✓`.
- `send ⏎` sends the canvas as a message attachment to all selected agents. The drawing becomes part of the user's reply turn for each targeted agent.

**Dismiss:** `esc` or `[close]`. Drawing is discarded if not sent.

---

## Page — `Post-Mortem · vertical timeline`

Loaded by session id. Read-only.

**Header:** `#142 Two Sum · 18m · solved   archived · today · export · share`.

**Tabs:** `TRANSCRIPT · PATTERNS · REVIEWER · REPLAY (AUTOPLAY)`.

**Score bar (top):** `SESSION SCORE +4` followed by per-turn quality bars (sentiment palette: success / danger / neutral). Bars are static; not interactive.

**Top-right counters:** `ACTIVELY LEARNT · CHALLENGES · CONSULTS` — final session totals only.

**Center: vertical timeline** — chronological event list. Each row:

```
{time}    {event-type}    {summary}                       {±delta}
```

Event types: `START · AGENT · YOU · YOU · REPLY · CHALLENGE · DEFER · DRAW · CONSULT · TESTS`. Click any row → expands inline + sets right-rail focus.

**Right rail:** detail view of selected event (full message text, full chat exchange around that event, snapshot reference).

**Reviewer's note** (bottom-right card): prose evaluation from the grader. Single accent CTA `start drill →` (page primary).

**Replay (autoplay) tab:** same view but auto-scrubs through events at a fixed pace. Spacebar pauses/resumes.

---

## Page — `Profile · cross-session`

Tabs: `TODAY · SESSIONS · PROFILE · ANALYTICS`. Header: `last 90 days · 64 sessions`.

**Activity heatmap (90 days):** GitHub-style grid. **Neutral graphite ramp**, not red. Legend `less ▢▢▢ more`. `longest streak: 14 days` callout below.

**KPI cards (right of heatmap):** `SESSIONS · SOLVED · AVG SCORE · MEDIAN TIME · CONSULTS/SESS · CHALLENGES/SESS`. Numbers `bone`. Sub-deltas use sentiment palette.

**Session score chart (last 30 sessions):** bar chart, neutral graphite bars, **only the most-recent (current/in-progress) bar in `accent`**.

**Problem sets table:** `set · n · solved · progress · avg score`. Progress bars neutral; only the in-progress set's bar is `accent`. `avg score` neutral (these are absolutes, not deltas).

---

## Page — `Analytics · deep dive`

Tabs at top of the panel: `WEAK POINTS · STILL WEAK · MOST PROGRESS · PER AGENT · PER PROBLEM SET`.

**`BY TOPIC` table:** sortable. Columns `topic, n, detect, solve, median t, avg score, delta 30d`. `delta 30d` uses sentiment palette.

**Two-up callouts:** `STILL A WEAK POINT` + `MOST PROGRESS`. Each is a labeled card with a topic name + reviewer-style prose.

**`WHICH AGENT MOVED THE NEEDLE`:** four-up cards (one per agent including consultor) with `+/-` delta and a one-liner descriptor (`biggest score lift`, `most ignored`, `most accepted`, `used N times`).

**Footer CTA:** `start drill →` (single accent per page).

---

## Streaming behavior

The live session must feel responsive. Rules:

1. **Token streaming:** agent messages appear character-by-character (or token-by-token; same effect at this scale). The throb glyph is visible from the moment generation starts and dissolves into the first token.
2. **No skeleton placeholders.** The throb glyph is the loading state.
3. **Concurrent generation:** all three agents may generate simultaneously. Each pane shows its own throb glyph + streaming text.
4. **Snapshot-stale awareness:** if the user has edited code since the snapshot the agent is reasoning about, show a subtle staleness indicator on that pane (e.g., the `@s17` ref turns ash + a small `(2 edits since)` note appears under the agent label). Stale state does not block streaming — just informs the user.
5. **Connection loss:** WS disconnect → status bar `◐` indicator turns warn-amber. Live streaming pauses; messages in flight are queued client-side and reconcile on reconnect.

---

## Keyboard map

| Key | Action |
|---|---|
| `?` | toggle problem peek |
| `tab` | cycle target in input |
| `/` | open slash command in input (`/challenge`, `/defer`, `/draw`, `/consult`) |
| `⏎` (in input) | send |
| `Shift+⏎` (in input) | newline |
| `esc` | close current overlay (peek / consultor / draw / focus) |
| `⌘D` | toggle deferred bar |
| `f` | enter focus mode for currently-targeted agent (alias for double-tap) |
| `⌘1 / ⌘2 / ⌘3` | jump target to agent N |
| `⌘R` | run tests |
| `⌘.` | pause/resume session |
| `↑` (in empty input) | edit your last message |
| `space` (post-mortem replay tab) | pause/resume autoplay |

---

## States to handle (engineering checklist)

- session: `not-started`, `running`, `paused`, `ended`
- agent: `thinking`, `idle`, `spoke-last`, `replied`, `error`
- per-message: `streaming`, `complete`, `replied`, `deferred`, `consulted-on`
- buffer: `fresh`, `stale-N-edits`, `disconnected`
- consultor: `closed`, `open`, `streaming`
- draw: `closed`, `open`
- ws: `connected`, `reconnecting`, `disconnected`
- tests: `not-run`, `running`, `passed`, `failed`

Every state above must have a defined visual treatment + transition.
