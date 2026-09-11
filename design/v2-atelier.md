# Algopeeps — V2: The Atelier

> **For the designer:** the per-page sections are the spec. The final **Pros & Cons** section is internal — do **not** include in delivered designs.
>
> **Aesthetic guardrails (read first):** Calm, literate, **minimal**. **No skeuomorphism** — drop any paper-warmth, manuscript-texture, or "ink on parchment" instinct. The atelier here is a modern minimal study, not a vintage one. No mascots, no character art, no game UI. Don't clutter. These notes are deliberately high-level — make the small calls yourself.

---

## 1. Design Goal & Aesthetic

A **scholar's reading surface** for a learning session. The user reads carefully, writes back carefully, reviews carefully at the end. The product is the quiet wrapper around that practice. Where V1 (Deliberation) is structural and weighty, the Atelier is **soft, generous, and reading-led**.

**Mood references:** Linear's empty states, Are.na's recent minimal turn, IA Writer, Notion at its quietest, Granola, well-set long-form web typography. **Not references:** Substack-paper-warmth, vintage book skeuomorphism, parchment textures, sepia tones, anything decorative.

**Palette:** light base, *not* cream — keep it neutral (off-white or near-white). Graphite ink. **One** muted accent (designer's pick — a soft red, a muted moss, a faded blue — pick one and stick to it). Used only for the active prompt, the agent's throbbing mark, and the single primary action.

**Type:** one humanist serif **or** one humanist sans (designer's call — pick one and use it for everything except code). One mono for code/data. The discipline is **single-family**: no mixing serif and sans within the UI.

**Layout:** wide margins. A reading column, max ~680px, centered. Hierarchy comes from whitespace, hairlines, and small-caps section labels — never from card chrome. **Inputs are bottom-rule only**, never boxed. **No card shadows.**

**Motion:** ~120ms cross-fades. The agent's **throbbing mark** while generating is the only ambient motion. It settles into the streamed text on first token.

---

## 2. Intent

- A session is reading and writing — not chatting. The conversation accumulates as a journal, not as bubbles.
- **No timers, points, or status bars in view during play.** All recorded; surfaced after.
- The post-mortem is a letter from the reviewer, not a stat block. Prose carries the analysis.
- Editor stays in Neovim. The app is for reading and replying.

---

## 3. Page — Today

```
                                Today  ·  Sessions  ·  Profile

                          ─────────────────────────────────────────



                                       Today
                                       ─────


                            you have written in 6 of the last 7 days.



                            tonight's invitation
                            ────────────────────

                            Container With Most Water
                            medium · two-pointer

                            you have been weakest in this topic over
                            the past two weeks.

                                                            begin →



                            ── or browse the library ──────────────



                            recent

                            #142   Two Sum               today,    18m, solved
                            #141   Valid Parens          today,    24m, solved
                            #140   3Sum                  yesterday, 51m, abandoned
                            #139   Longest Substring     yesterday, 33m, solved

                                                              see all →
```

Single column, generous margins. Inline arrows for actions, not buttons. Recent items typeset like a contents page.

---

## 4. Page — Active Session

```
                                Today  ·  Sessions  ·  Profile

                          ─────────────────────────────────────────



                                      Two Sum
                                      ───────



       ─ agent ───────────────────────────────────────────────

       you're scanning the array twice. what's the cost as n
       grows? is there a way to trade space for time here?



       ─ you ─────────────────────────────────────────────────

       a hashmap, key by value, look up the complement.



       ─ agent ───────────────────────────────────────────────

       yes. what happens when the same number appears twice?



       ✺  thinking…   (throbbing accent until first token)



       ─ reply ───────────────────────────────────────────────

       _



       ─────────────────────────────────────────────────────

       problem  ⌘1     tests  ⌘2     consultor  ⌘3
```

- Reading column. Each turn is set as a small section with a hairline rule and a small-caps label (`agent` / `you`). The session reads top-to-bottom as a journal.
- Reply field is an inline section with a bottom rule, not a boxed input. Visually identical to the message blocks above.
- No timer, no points, no chrome.
- The throb glyph appears in-line where the next agent message will land.

---

## 5. Page — Post-Mortem

```
                                Today  ·  Sessions  ·  Profile

                          ─────────────────────────────────────────



                            a letter from the reviewer
                            ──────────────────────────

                            for session #142, Two Sum, written 18
                            minutes after you began.



                            you started with a nested loop. when the
                            agent asked about cost as n grows, you
                            moved to a hashmap. the duplicates test
                            failed once; you noticed and fixed it
                            within three minutes.

                            two patterns are worth naming. the first
                            is that you reach for a working solution
                            before checking edge cases — the
                            duplicates failure was visible from the
                            constraints. the second is that your
                            replies got terser as time went on; this
                            usually correlates with stalling.

                            tally
                            ─────

                                detection      —
                                hesitation     once, on the right answer
                                hints used     3



                            ── read the session in order ───────────


                            09:30   first lines, naive double loop.
                            12:34   agent: "what does sorting unlock?"
                                    you: "two pointers? but it's not
                                    sorted." this was the moment.
                            14:08   tests run. duplicates failed.
                            17:55   committed to the hashmap.
                            18:00   tests passed.



                                              begin another session →
```

The post-mortem is **a letter, not a dashboard**. The tally is an inset within the letter, not a separate section. Timeline below is a typeset list — clicking a line opens an inline expansion with code + chat at that moment (no full scrubber UI required for v0).

---

## 6. Page — Profile

```
                            Profile
                            ───────

                            last 30 days, 30 sessions.



                            where your eye is weakest
                            ─────────────────────────

                                dynamic programming    you spot 22%
                                graphs                 you spot 41%
                                two-pointer            you spot 79%



                            patterns across recent sessions
                            ───────────────────────────────

                                you reach for a solution before
                                checking edge cases.

                                your replies shorten when stalled.

                                you accept the first hint that
                                "feels right" without testing it.



                            ── suggested drill ───────────────────

                            three dynamic programming problems
                            this week.

                                                            begin →
```

Numbers inline with prose. **No bar charts, no sparklines, no progress rings.**

---

## 7. Pros & Cons — Internal (DO NOT include in delivered designs)

**Pros.** Highest perceived intelligence per pixel. Calmest reading experience. Cheapest to ship — type and rules carry the brand. Best post-mortem readability of the four versions.

**Cons.** Hardest to demo in 10 seconds (no animation, no big numbers). Mobile is awkward (wide reading column doesn't downscale gracefully). Reviewer's prose carries enormous brand weight; if mid, the product reads as pretentious. No dopamine architecture for users who need it.

**Choose if:** the user is a thoughtful, returning learner who wants the *opposite* of LeetCode and values calm.
