# Algopeeps — V1: The Deliberation Room

> **For the designer:** the per-page sections are the spec. The final **Pros & Cons** section is internal — do **not** include in delivered designs.
>
> **Aesthetic guardrails (read first):** This is gamified, not a game. Lean **neo-brutalist** — raw structure, weighty type, hard rules, harsh contrast — but quiet, never loud. **No skeuomorphism** (no paper textures, no embossed/3D buttons, no card shadows mimicking physical objects, no glow effects). No mascots, no character art, no XP/level/streak imagery. Don't clutter. These notes are deliberately high-level — make the small calls yourself.

---

## 1. Design Goal & Aesthetic

A **deliberation room** for working through a problem in dialogue with agents. The user is solving in Neovim; the app is the structured, weight-bearing wrapper around the conversation. The product feels considered, slightly heavy, uncompromising.

**Mood references:** Vercel docs, IA Writer, brutalist editorial sites, Bun's website, monoline IDE chat panels, Linear's heavier states. **Not references:** game UIs, dating sims, Discord, masquerade imagery, any "card-flip" or RPG patterns.

**Palette:** dark base (designer's call — near-black or deep ink). Bone/off-white for text. **One** restrained warm accent (a muted terracotta or vermilion in the spirit of the user-supplied throb glyph) used only for: the throbbing "thinking" indicator, the active input prompt, and the single primary action per screen.

**Type:** one mono and one sans. Mono carries the brand; sans for body. No display serif, no decorative type. Headlines are sentence-case and structural, not dramatic.

**Surface & rules:** hairlines over fills. Borders 1px. Corner radius 0–4px. Three z-levels max. **No drop shadows.**

**Motion:** opacity fades only (≤200ms). The agent's **throbbing mark** while generating (the user-supplied starburst is a fine reference; designer chooses the glyph) is the only ambient motion. It dissolves into the streamed text on first token.

---

## 2. Intent

- The session is a chat, not a dashboard.
- One thing at a time on screen during play. Tests, problem brief, history live a keystroke away — not always visible.
- Editor stays in Neovim. The app does not try to be one. A small status indicator says what file the agents are reading.
- Live and post-mortem are different surfaces: live is a chat; post-mortem is a structured review with an optional scrub-replay.

---

## 3. Page — Hub

```
┌────────────────────────────────────────────────────────────────────┐
│  ALGOPEEPS                                                          │
│  ─────────                                                          │
│                                                                     │
│  begin a session     ▸ pick a problem    ▸ surprise me              │
│                                                                     │
│  ─────────────────────────────────────────────────────────────      │
│                                                                     │
│  recent                                                     all →   │
│                                                                     │
│  #142  Two Sum             18m   solved      today                  │
│  #141  Valid Parentheses   24m   solved      today                  │
│  #140  3Sum                51m   abandoned   yesterday              │
│  #139  Longest Substring   33m   solved      yesterday              │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

Loose, low-density. No hero block, no banners, no badges. Two inline starts at top, a tab-aligned list below.

---

## 4. Page — Active Session

```
┌────────────────────────────────────────────────────────────────────┐
│  TWO SUM                                ◐ neovim · twosum.go        │
│  ───────                                                            │
│                                                                     │
│  agent                                                              │
│  "you're scanning the array twice. what's the cost as n grows?     │
│   is there a way to trade space for time here?"                     │
│                                                                     │
│  you                                                                │
│  hashmap. key by value, look up the complement._                    │
│                                                                     │
│  agent                                                              │
│  "yes. what happens when the same number appears twice?"            │
│                                                                     │
│  ✺   thinking…                                                      │
│      (throbbing accent until first token)                           │
│                                                                     │
│                                                                     │
│  ──────────────────────────────────────────────────────────────     │
│  ▸ reply                                                       ⏎    │
│  ──────────────────────────────────────────────────────────────     │
│                                                                     │
│  problem ⌘1   tests ⌘2 (3✓ 1✗)   pause ⌘.                           │
└────────────────────────────────────────────────────────────────────┘
```

- Single column. Chat fills the page.
- Speaker label above each message in mono small-caps. No avatars, no chips.
- Throbbing mark sits where the next message will land; dissolves into the streamed text. *This is the most important affordance of the screen — make it feel right.*
- Reply input is a hairline rule, not a styled box.
- No timer, no points counter, no progress bar in view.

---

## 5. Page — Post-Mortem

```
┌────────────────────────────────────────────────────────────────────┐
│  #142  TWO SUM   18m   solved                                       │
│  ───────────                                                        │
│                                                                     │
│  summary                                                            │
│  you started with a nested loop, then moved to a hashmap after      │
│  the agent asked about cost as n grows. tests passed at 18:00.      │
│                                                                     │
│  ─── timeline ────────────────────────────────────────────          │
│                                                                     │
│   00:00 ─●──●───●────●──────●  18:00                                │
│         start edit prompt test solved                               │
│                                                                     │
│                                                                     │
│  ─── transcript ──────────────────────────────────────────          │
│                                                                     │
│   agent  "scanning twice — cost as n grows?"                        │
│   you    "hashmap, key by value"                                    │
│   agent  "what about duplicates?"                                   │
│   test   ✗ duplicates  →  fixed at 17:55                            │
│   test   ✓ all passed                                               │
│                                                                     │
│  ─── reviewer's note ─────────────────────────────────────          │
│                                                                     │
│   short paragraph from the grader on what stood out.                │
│                                                                     │
│  archive     replay →     begin another →                           │
└────────────────────────────────────────────────────────────────────┘
```

Four small sections: summary, timeline glyph, transcript, reviewer's note. Replay opens a sub-page with a scrubber, code at moment, chat at moment — schematic only, designer's freedom to lay out.

---

## 6. Pros & Cons — Internal (DO NOT include in delivered designs)

**Pros.** Strongest aesthetic statement. Lowest visual noise during play. Minimal asset cost. Plays well next to Neovim. Ages well.

**Cons.** Austere — risk of "cold" or "empty" first impression. Hard to demo in a screenshot. Power users who want telemetry will find it sparse. Reviewer's-note prose carries a lot of brand weight; if mid, the whole product reads as pretentious.

**Choose if:** focus and quiet are the product's core promise; the audience trusts spare interfaces.
