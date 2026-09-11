# Algopeeps — V3: The Cockpit

> **For the designer:** the per-page sections are the spec. The final **Pros & Cons** section is internal — do **not** include in delivered designs.
>
> **Aesthetic guardrails (read first):** Dense, telemetered, **futuristic operator** — not video-game-spaceship. Think modern dev tools (Linear, Arc, Raycast, Warp), not sci-fi HUDs. **No skeuomorphism** (no faux 3D, no glow effects, no glassmorphism, no "screen flicker," no bezels). No mascots. Don't clutter — density should feel composed, not crowded. These notes are deliberately high-level — make the small calls yourself.

---

## 1. Design Goal & Aesthetic

A **pro-grade operator surface** for the daily algo grinder who lives in Vim, runs Linear, and treats this as part of their stack. Where V1 is a chat with everything else hidden and V2 is a reading column, the Cockpit is **multi-pane**, telemetered, keyboard-first.

**Mood references:** Linear, Arc command bar, Raycast, Warp, Cursor's sidebar, Granola, modern terminal multiplexers. **Not references:** sci-fi movie HUDs, Bloomberg-terminal chrome, RGB gamer aesthetics, glassmorphism.

**Palette:** near-black graphite base, three surface elevations max. Bone for text, dimmer ash for secondary. **One** electric accent (designer's pick — a cool cyan, a soft lime, or similar — pick one). Functional secondary colors for state only: pass, fail, warn. **Color is information.** Decorative color is forbidden.

**Type:** mono throughout for data and IDs; precise grotesque sans for body. **Tabular figures** are mandatory — tables and timers must align. Sans is small (13–14px); the cockpit is for reading data, not slogans.

**Layout:** three-pane standard (left rail, primary, optional inspector). 1px hairline borders, no fills. Density toggle (comfortable / compact) is a real preference, not a marketing line.

**Motion:** fast and functional. 90–140ms ease-out. Skeleton states load fast and swap in. Tab switches instant. The agent's **throbbing mark** while generating is the one ambient motion in the product.

---

## 2. Intent

- Live and post-mortem are the **same shell** with a head pin: live pins the timeline to NOW; post-mortem lets you scrub. No mode switch UI.
- Multiple sessions can be open in tabs. Pause/resume is real.
- The chat is one pane among several — code mirror (read-only), tests, problem brief sit alongside it.
- Bottom status bar is permanent and informative: editor connection, current snapshot, capture trigger, agent latency, model. The cockpit's brand.

---

## 3. Page — Hub

```
┌──┬───────────────────────────────────────────────────────────────────────┐
│⌘ │  hub                                              ⌘K  search    ◐◐◐  │
│⊕ ├───────────────────────────────────────────────────────────────────────┤
│⏱ │  active sessions                                                       │
│📚│  #142  Two Sum   easy   ⏱ 04:23   live    [↗]                         │
│📊│  #137  Container med    ⏸ paused (2d)     [↗]                         │
│⚙ │                                                                        │
│  │  ──────────────────────────────────────────────────                    │
│  │                                                                        │
│  │  ⊕ start session                  recommended                          │
│  │    pick · random · ⌘N             Container With Most Water (med)     │
│  │                                   weak topic, 4/20 detection           │
│  │                                                                        │
│  │  ──────────────────────────────────────────────────                    │
│  │                                                                        │
│  │  recent          24 solved · 6 abandoned · avg 3.2 hints · last 30d   │
│  │  ┌──────────────────────────────────────────────────────────────┐    │
│  │  │ #142  Two Sum            easy  18m   ✓     3 hints   today   │    │
│  │  │ #141  Valid Parens       easy  24m   ✓     1 hint    today   │    │
│  │  │ #140  3Sum               med   51m   ✗     7 hints   1d ago  │    │
│  │  │ #139  Longest Substr     med   33m   ✓     4 hints   1d ago  │    │
│  │  └──────────────────────────────────────────────────────────────┘    │
├──┼───────────────────────────────────────────────────────────────────────┤
│  │ ◐ neovim · agents reading · model claude-sonnet-4.6 · ⌘K palette     │
└──┴───────────────────────────────────────────────────────────────────────┘
```

Left rail collapses to icons by default. Recent sessions is a real data table — sortable, dense, tabular figures. Bottom status bar is permanent.

---

## 4. Page — Active Session

```
┌──┬───────────────────────────────────────────────────────────────────────┐
│⌘ │ #142 Two Sum   ⏱ 04:23   ▮▮▮▮▯▯▯▯ progress       ⌘K                  │
│⊕ ├───────────────────────────────────────────────────────────────────────┤
│⏱ │ ┌─ timeline ────────────────────────────────────────────────────┐    │
│📚│ │ 00:00 ●━━━━━━━━━━━━━━━━━━━━━━━━━●  04:23   live              │    │
│📊│ │       ✎ ✎  agent  ✎  agent ▣ ✗   you reply                    │    │
│⚙ │ └────────────────────────────────────────────────────────────────┘    │
│  │ ┌─ chat ──────────────────────────┐ ┌─ inspector ─────────────────┐  │
│  │ │                                  │ │  buffer  twosum.go  @s17    │  │
│  │ │ agent                            │ │  capture idle-3s            │  │
│  │ │ scanning twice — cost as n       │ │                              │  │
│  │ │ grows? trade space for time?     │ │  ┌─ code @s17 ────────────┐ │  │
│  │ │                                  │ │  │ func twoSum(...) {     │ │  │
│  │ │ you                              │ │  │   sort.Ints(nums)      │ │  │
│  │ │ hashmap, key by value, look      │ │  │   …                    │ │  │
│  │ │ up the complement.               │ │  │ }                      │ │  │
│  │ │                                  │ │  └─────────────────────────┘ │  │
│  │ │ agent                            │ │                              │  │
│  │ │ yes. what about duplicates?      │ │  ┌─ tests ─────────────────┐ │  │
│  │ │                                  │ │  │ ✓ basic        @s16     │ │  │
│  │ │ ✺ thinking…                      │ │  │ ✓ negatives    @s16     │ │  │
│  │ │   (throbbing accent indicator)   │ │  │ ✗ duplicates   @s16     │ │  │
│  │ │                                  │ │  │ · large        not run  │ │  │
│  │ │ ─────────────────────────────    │ │  │ ⌘R run                  │ │  │
│  │ │ ▸ reply                       ⏎  │ │  └─────────────────────────┘ │  │
│  │ └──────────────────────────────────┘ └──────────────────────────────┘  │
├──┼───────────────────────────────────────────────────────────────────────┤
│  │ ◐ neovim ✓ @s17  capture idle-3s  agents⌛120ms  model sonnet  ⌘K     │
└──┴───────────────────────────────────────────────────────────────────────┘
```

- Three-pane: rail / chat / inspector.
- Timeline at top is the same scrubable component used in post-mortem; in live it's pinned to NOW.
- Chat pane is the center of gravity. Speakers labeled in mono small-caps. Throbbing mark sits in the chat where the next message will land.
- Inspector shows the read-only code mirror, tests, and snapshot reference. No editing in the app — Neovim only.
- Status bar is permanent.

---

## 5. Page — Post-Mortem (replay-shell)

```
┌──┬───────────────────────────────────────────────────────────────────────┐
│⌘ │ #142 Two Sum   18m   ✓ solved   3 hints                          ⌘K   │
│⊕ ├───────────────────────────────────────────────────────────────────────┤
│⏱ │ ┌─ timeline ────────────────────────────────────────────────────┐    │
│📚│ │ 00:00 ●━━━━━━━━━━━━━━━●━━━━━━━━━━━━━●  18:00   scrub          │    │
│📊│ │   ✎ agent ✎ ✎ test ✗ agent ▣ ✓                                │    │
│⚙ │ └────────────────────────────────────────────────────────────────┘    │
│  │ ┌─ at 12:34 · @s12 ───────────────┐ ┌─ at 12:34 · chat ──────────┐  │
│  │ │ func twoSum(...) {               │ │ agent                       │  │
│  │ │   sort.Ints(nums)                │ │ what does sorting unlock?   │  │
│  │ │   for i := 0; i < n; i++ { ... } │ │                              │  │
│  │ │ }                                │ │ you                         │  │
│  │ │                                  │ │ two pointers? but the       │  │
│  │ │ ── tests ──                      │ │ array isn't sorted yet      │  │
│  │ │ ✗ duplicates  [3,3],6 → [0,0]    │ │                              │  │
│  │ │                                  │ │ agent                       │  │
│  │ │                                  │ │ right. try it.              │  │
│  │ └──────────────────────────────────┘ └──────────────────────────────┘  │
│  │ ┌─ reviewer's note ─────────────────────────────────────────────┐    │
│  │ │ pattern: you reach for a solution before checking edge cases. │    │
│  │ │ recommend: 3× drills focused on edge-case-first reading.      │    │
│  │ │                                                       start → │    │
│  │ └────────────────────────────────────────────────────────────────┘    │
├──┼───────────────────────────────────────────────────────────────────────┤
│  │ archived  ·  export json/md  ·  share                                  │
└──┴───────────────────────────────────────────────────────────────────────┘
```

Same shell as the live page. Scrubber moves the timeline; both panes (code + chat) sync to that moment. Reviewer's note bottom-pinned.

---

## 6. Page — Analytics (Profile)

```
┌──┬───────────────────────────────────────────────────────────────────────┐
│⌘ │ analytics  ·  last 30d  ·  30 sessions                            ⌘K  │
├──┼───────────────────────────────────────────────────────────────────────┤
│  │  KPI:  solve 80%   avg hints 3.2   median time 27m   weak topic dp    │
│  │                                                                        │
│  │  ┌─ by topic ─────────────────────────────────────────────────────┐  │
│  │  │ topic           n   solve   median time   hints/session         │  │
│  │  │ arrays          20  90%     18m            2.1                  │  │
│  │  │ hashmap         14  82%     22m            2.4                  │  │
│  │  │ two-pointer      8  62%     31m            3.8                  │  │
│  │  │ dp               5  40%     49m            6.2  ← weak          │  │
│  │  │ graph            3  33%     53m            5.0                  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │
│  │                                                                        │
│  │  ┌─ recent patterns ─────────────────┐ ┌─ drill queue ──────────┐  │
│  │  │ • reaches for solution before     │ │ 1. dp · edge-case-first │  │
│  │  │   checking edge cases             │ │ 2. dp · brute-to-opt    │  │
│  │  │ • replies shorten when stalled    │ │ 3. graph · bfs/dfs      │  │
│  │  │ • accepts first "feels right"     │ │            start →      │  │
│  │  └────────────────────────────────────┘ └──────────────────────────┘  │
└──┴───────────────────────────────────────────────────────────────────────┘
```

A real dashboard: KPI strip, sortable table, pattern list, drill queue. Tabular figures, monospace IDs.

---

## 7. Pros & Cons — Internal (DO NOT include in delivered designs)

**Pros.** Best for daily power users. Multi-session, scrubable, telemetered. Strongest analytics surface. Demos easily ("Linear for algo prep"). Predictable build (Tailwind + Radix-class kit).

**Cons.** Cold to first-time users — density intimidates. Looks like every other modern dev tool; differentiation is harder than V1/V2. Mobile is essentially impossible. Risk of metric-chasing (users optimize the displayed numbers instead of reasoning).

**Choose if:** the audience is daily algorithmic grinders who already live in pro dev tools, and retention can lean on power-user habit rather than first-impression virality.
