# Algopeeps — V4: The Companion

> **For the designer:** the per-page sections are the spec. The final **Pros & Cons** section is internal — do **not** include in delivered designs.
>
> **Aesthetic guardrails (read first):** Tiny-footprint, **minimal**, futuristic-restrained. Lives beside Neovim, never on top of it. **No skeuomorphism**, no mascots, no game UI. Don't clutter — every pixel earns its place. High-level by design — make the small calls yourself.

---

## 1. Design Goal & Aesthetic

A **persistent narrow companion** that lives in a sliver of the screen next to Neovim. The user does not navigate to the app; the app is *always there*. It streams agent feedback, signals when something needs attention, and otherwise stays out of the way. Where V1 / V2 / V3 are full-window experiences, the Companion is a **secondary surface** — closer in spirit to a chat sidebar in an IDE than to a standalone product.

**Mood references:** Cursor sidebar, Granola, Raycast pinned panel, Things' Today widget, the right edge of Linear when a peek is open. **Not references:** taskbars, notification toasters, mobile chat apps, anything pet-like.

**Palette:** monochrome with one accent (matched to the user-supplied throb glyph or designer's pick). Adapts to OS dark/light.

**Type:** small. 12–13px sans for body, mono for code/data. Reading is glance-able by design.

**Form factor:** ~360–420px wide, full-height window pinned to one side. **One column** of stacked sections that collapse to one-line summaries when not active.

**Motion:** opacity fades only. The throbbing mark while generating is the one ambient motion.

---

## 2. Intent

- The app is **always visible** during a session, but never demands attention. Notifications use the throb mark inline, not OS popups.
- Sections collapse and expand to keep the panel quiet. Only the active conversation section is fully expanded by default.
- Hub, post-mortem, and profile open as **temporary takeovers** of the same panel — not new windows.

---

## 3. State — Idle (no active session)

```
┌──────────────────────────┐
│ algopeeps                │
│ ─────────                │
│                          │
│ no active session.       │
│                          │
│ ▸ start                  │
│ ▸ recent                 │
│                          │
│ ───────────────          │
│                          │
│ #142  Two Sum  18m  ✓    │
│ #141  Valid…   24m  ✓    │
│ #140  3Sum     51m  ✗    │
│                          │
└──────────────────────────┘
```

Tiny. Two starts at top, three recent below. Whole panel is a portrait sliver.

---

## 4. State — Active Session

```
┌──────────────────────────┐
│ Two Sum            04:23 │
│ ──────             ◐ nvim│
│                          │
│ ▾ chat                   │
│                          │
│   agent                  │
│   "you're scanning the   │
│    array twice. cost as  │
│    n grows?"             │
│                          │
│   you                    │
│   "hashmap, key by val"  │
│                          │
│   agent                  │
│   "what about duplicates?│
│   "                      │
│                          │
│   ✺ thinking…            │
│                          │
│   ───────────────        │
│   ▸ reply             ⏎  │
│                          │
│ ▸ tests   3✓ 1✗          │
│ ▸ problem                │
│ ▸ pause                  │
└──────────────────────────┘
```

- Chat section is expanded by default; tests, problem, pause are collapsed one-liners. Click any to expand inline.
- Reply input at bottom of the chat section.
- Throb mark inline. **The Companion's main job is to make the agent stream feel ambient.**
- No timer in the body — only the small clock in the header.

---

## 5. State — Post-Mortem (panel takeover)

```
┌──────────────────────────┐
│ ← back                   │
│                          │
│ #142  Two Sum            │
│ 18m  · ✓ solved          │
│                          │
│ ▾ summary                │
│ short paragraph from the │
│ reviewer.                │
│                          │
│ ▸ timeline               │
│ ▸ transcript             │
│ ▸ patterns               │
│                          │
│                          │
│ replay →   begin again → │
└──────────────────────────┘
```

Same panel; just swaps content. Sections collapse by default; expand inline on click. No separate page navigation.

---

## 6. Pros & Cons — Internal (DO NOT include in delivered designs)

**Pros.** Genuinely ambient — does not compete with the editor. Easiest to keep open all day. Closest in spirit to how the user actually works. Lowest visual cost; ships fast.

**Cons.** Limited surface area for analytics, post-mortem detail, replay scrubbing — these all feel cramped in a sliver. May need a "pop out" mode for review-heavy moments, which is then a second design system. Discoverability is poor — users have to know the app is there. Hard to onboard.

**Choose if:** the product's primary use is *during* an active coding session, not before or after, and the audience already runs IDE sidebars (Cursor, Copilot Chat) and treats a 400px-wide pane as normal.
