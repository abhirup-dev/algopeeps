# Dogfood interview protocol (orchestrator's notes)

Goal: hard evidence about what makes an Excalidraw MCP/CLI hard or good for an agent,
to design our agent surface. Evidence beats opinion: every answer should point at a
command, an output, or a count.

Rules for me: ask open questions before probing questions; never name our preferred
ideas (region crop, `near:` queries, short ids, lints) until the tester has answered
unprompted; ask for numbers from their transcript, not estimates, where possible;
one round at a time, wait with `herdr agent wait`.

## Round 1: debrief on the ride-hailing diagram (after the report lands)

1. Walk me through the worst five minutes: the exact commands, what came back, what
   you believed was on the canvas vs what was actually there.
2. Count from your transcript: tool calls total; calls that were pure reads; calls that
   were retries of a failed or wrong write; number of screenshots taken.
3. How did you decide coordinates? How many elements did you place by computing x/y
   yourself? Where did a coordinate guess go wrong?
4. How did you keep track of element ids across calls? Did you ever re-read the scene
   only to recover an id? How many times?
5. Largest single output you received (roughly how many tokens)? What part of it did
   you actually use?
6. Name one defect you only found from a screenshot. Could any text read (describe,
   get) have revealed it? What would that read have had to say?
7. The Pricing move: did the arrows follow? How did you verify, and how sure are you?
8. Rate 1–5 your confidence that the final diagram meets each requirement in the
   brief, and say how you would check each one without looking at an image.
9. Error messages: quote the most useful one and the most misleading one.
10. Where did the skill's guidance save you, and where was it wrong or silent?
11. If you could add one command that doesn't exist, give its exact signature and
    what it returns.
12. A human edits the same canvas while you work (moves boxes, adds a note). What in
    your process would break, and what would you need from the tool to notice?

Then, and only then, probe the ideas we are weighing, one at a time, asking "would it
have changed anything above, concretely where?": a screenshot cropped around one
element with padding; a spatial query ("everything within 200 px of X", overlaps);
numbered labels drawn on the screenshot; short ids (n1, n2) instead of long ones;
automatic lint (overlaps, unbound arrows, text overflow) returned after every write;
relative placement ("B right of A, gap 40"); a graph language with auto-layout.

## Round 2: a different diagram per tester, aimed at the weak spots from round 1

- Tester A: dense algorithm figure. A 15-node binary search tree, one root-to-leaf
  search path highlighted, and under it the in-order array of the same keys with
  index labels and two pointer arrows (lo, hi). Stress: precise layout, small text,
  alignment across two structures.
- Tester B: collaboration. Start from a finished small diagram; I will act as the
  human through the canvas API on the tester's port: move two boxes, delete an arrow,
  add a free-floating text note "why is Redis here?" near one box. The tester is told
  only "the human made some changes and left you a question; find them and respond on
  the canvas." Stress: change detection, deixis, replying in place.

Round 2 debrief: same counts as round 1 Q2; what changed vs round 1; the new worst
moment; the one command you wished for.

## Round 3 (optional, needs user OK): same task on our algopeeps canvas server

Registering our MCP (:3100) in a tester's Claude Code config is a config change, so
it waits for the user.

## Synthesis

`canvas/docs/dogfood-synthesis.md`: pain points ranked by how often and how badly
they hurt across testers and rounds, with evidence; what each proposed idea would
have fixed (tester-confirmed vs my inference, labelled); a revised v0 surface.
