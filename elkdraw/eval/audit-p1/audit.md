# 1.14 Head-to-head audit: yctimlin MCP vs elkdraw

Two fresh Opus testers ran each dogfood task at the same time, one per
tool. Everything else was held equal: the harness, the prompt, the
sandbox, and the model and effort. Run on 2026-09-26, branch
`elkdraw/p1.14-audit`, one run per side per task, with no reruns.

- **A** is yctimlin `mcp-excalidraw-server` 2.0.0, driven through `excalidraw-skill`.
- **B** is elkdraw at `abhirup/canvas` @ 2204821, driven through the elkdraw skill.

**Result.** Given the same task, elkdraw finishes faster and cheaper, and
it leaves fewer defects in the final picture.

- Calls were about even on both tasks.
- Tokens were 14-26% lower for B.
- Wall time was 13-30% lower for B.
- A's ride-hailing final holds 11 defects; our lint flags 10 of them. The
  tester did not see 7.
- B's final holds 3: one info hit, plus 2 defects lint misses.
- Both BST finals are clean.

Each side hit tool faults that cost it a round:

- A silently lost two arrows, dropped bound-arrow waypoints, and has an
  export that differs from what its canvas paints.
- B's `screenshot --out` writes relative paths into the **server's** cwd,
  outside the tester's sandbox.
- elkdraw has the same same-id fault that cost A its arrows. A probe after
  the runs sent an element `ar` plus a `delete ar` patch in one `apply`. It
  replied `deleted: ["ar"]` with no warning, and `ar` was gone. No tester
  hit it here.
- B's frame titles are unreadable.
- On BST, **both** testers lost their index labels the same way: a label
  inside a transparent box turns transparent. Neither tool warned. On B,
  `apply` replied `lints: []` at the time.

## Numbers

Scored with `eval/src/cli.ts --dry-run` on the saved transcripts, which
reproduce the live rows exactly. Tokens are output + input text + images,
the §17.4 measure.

| run      | tool     | calls | tokens (out + text + img)        | images | wall s | denials | turns | cost  |
| -------- | -------- | ----- | -------------------------------- | ------ | ------ | ------- | ----- | ----- |
| rh-a     | yctimlin | 36    | 62852 (33440 + 20208 + 9204)     | 6      | 403.8  | 4       | 38    | $1.73 |
| rh-b     | elkdraw  | 35    | **54265** (33784 + 12811 + 7670) | 5      | 353.1  | 4       | 37    | $1.58 |
| bst-a    | yctimlin | 20    | 41032 (17061 + 21725 + 2246)     | 3      | 193.5  | 2       | 22    | $0.94 |
| bst-b    | elkdraw  | 21    | **30262** (12206 + 15337 + 2719) | 4      | 135.3  | 1       | 23    | $0.68 |
| 1.12 rh  | elkdraw  | 35    | 59969                            | 5      | 344    | 4       |       | $1.61 |
| 1.12 bst | elkdraw  | 35    | 32624                            | 3      | 171    | 3       |       | $0.75 |

Calls by tool:

| run   | Bash | Read | Write | Edit | Skill |
| ----- | ---- | ---- | ----- | ---- | ----- |
| rh-a  | 25   | 7    | 2     | 1    | 1     |
| rh-b  | 24   | 7    | 2     | 1    | 1     |
| bst-a | 11   | 3    | 5     | 0    | 1     |
| bst-b | 11   | 6    | 1     | 2    | 1     |

Where the input text goes. Bytes are counted from the transcripts; tokens
are about bytes ÷ 3.2.

| run   | skill load (SKILL.md injected) | cheatsheet Read | largest tool results                              |
| ----- | ------------------------------ | --------------- | ------------------------------------------------- |
| rh-a  | 17.4 KB                        | none            | 20.4 KB `add` echo of 49 elements, 8.1 KB `query` |
| rh-b  | 27.0 KB                        | none            | 3.5 KB; every reply is ids and counts             |
| bst-a | 17.4 KB                        | none            | 26.9 KB `add` echo of 65 elements                 |
| bst-b | 27.0 KB                        | 16.5 KB         | 2.2 KB                                            |

- elkdraw's skill is 1.55x the size of yctimlin's: 27.6 + 16.0 KB against
  17.9 + 9.8 KB.
- B still reads less text overall, because A's `add`/`apply`/`query`
  replies echo whole elements.
- On BST, the cheatsheet read (16.5 KB, about 5K tokens) is most of the
  difference that remains.

Tokens against 1.12: ride-hailing -10%, BST -7%. BST calls fell from 35
to 21. This tester avoided 1.12's 17 hand `Edit`s by putting the index
labels in boxes, not centred free text. 1.20's textAlign fix was therefore
never exercised, and the drop in calls is not evidence for it. The boxes
led to a different fault instead (see BST below).

## Defects in the final PNGs

Method:

- By eye on each side's own final screenshot (`final-own.png`), checked
  against our sidecar render of the exported scene (`sidecar.png`).
- Caveat: the manifests were written with each side's lint hits already
  in view, then each hit was confirmed by eye. So "found by lint" is
  partly circular. The one real test of lint recall is the defects seen by
  eye that lint did not raise.
- Arrowhead pile-ups use one standard on both sides: two heads within
  about 35 px on one edge of a shared target.
- Manifests are in `<task>/<side>/defects.json`, in the fixtures' shape.
- Our lint (`render.js`: sidecar measure → `readScene` → `lint`) ran on
  both final scenes.
- `score.js` (over `eval/src/score.ts`) matched lint hits to the
  manifests. Results are in `defect-score.json`.

**Font normalisation for A.** yctimlin's export records Virgil 16 on labels
that its canvas paints in Excalifont 20. `font-probe.png` and
`font-probe.excalidraw` are a 5-element probe on a throwaway server. They
show that bound labels paint Excalifont 20 **even when the shape asks for
`fontSize: 14, fontFamily: helvetica`**. Free text keeps an explicit font
and size, and Virgil paints as Excalifont.

- `render.js --paint` applies those rules. That matches `paint.ts` for
  bound labels; free text is left alone unless it is Virgil.
- A's headline lint uses painted. Unpainted is kept in `a/unpainted/`.
- Painted is right here. A's own screenshot wraps Postgres, Kafka and
  Analytics exactly as the painted lint says; unpainted catches only 2 of
  those 3 wraps.
- B is not painted: elkdraw stores the fonts it paints.

| run   | final elements (with bound text) | lint on final (errors / info) | by-eye defects left | found by lint | missed by lint                                | session incidents (fixed) |
| ----- | -------------------------------- | ----------------------------- | ------------------- | ------------- | --------------------------------------------- | ------------------------- |
| rh-a  | 78                               | **7 / 3** (unpainted 4 / 3)   | 11                  | 10            | 1: arrowhead pile-up                          | 4 (a-rh-11..14)           |
| rh-b  | 72                               | **0 / 1**                     | 3                   | 1             | 2: arrowhead pile-up, unreadable frame titles | 3 (b-rh-04..06)           |
| bst-a | 95                               | 0 / 0                         | 0                   | n/a           | n/a                                           | 3 (a-bst-01..03)          |
| bst-b | 111                              | 0 / 0                         | 0                   | n/a           | n/a                                           | 2 (b-bst-01..02)          |

rh-a's 11 defects:

- 3 store labels wrapped: `text-wrapped`.
- "7 GEO query" on the Core border: `label-on-border`.
- 3 labels running into their own arrowheads: `label-on-own-arrowhead`, on
  a1, a5 and a8.
- 3 crossings: `crossing`.
- 4 async heads converging on Kafka's top edge. Location's and
  Notification's land about 35 px apart (a-rh-15). `arrowhead-overlap`
  does not fire.

The tester reported the 3 crossings and "1 request ride sits tight". It did
not see the other 7, because yctimlin has no lint and its `describe` has no
geometry checks.

rh-b's 3:

- The trip-pg × surge-kafka crossing (info).
- Two async arrowheads 25-30 px apart on Kafka's top edge. This is the
  same shape as 1.12's missed p1rh-10.
- Frame names drawn at about 11 px grey.

The 1.12 blockers did not recur on B:

- Frames no longer clip arrows (1.17).
- `place`-only apply moved Pricing in one call (1.15).
- Bound arrows followed every move (1.16).
- A partial upsert of `analytics` patched it (1.15).

**Where A's two pictures disagree.** yctimlin's export is not the painted
scene. Each point is recorded in the `unmapped` entries of `defects.json`:

- On the 14 BST edges, the tester sent `endArrowhead: null` and its canvas
  paints plain lines. The export says `"arrow"`, so `sidecar.png` draws
  arrowheads.
- Rectangles paint sharp but export `roundness: {type: 3}`.
- The BST export carries fractional indices `a10`…`a80`. Excalidraw rejects
  them ("invalid order key"), so our sidecar threw until `render.js
--drop-index` cleared them.

No lint result here depends on these differences. The two ride-hailing
pictures otherwise agree.

## Where each agent struggled

Transcript line refs are to `<task>/<side>/transcript.jsonl`.

### Ride-hailing, A (yctimlin)

- **L31, L40, L50, L81: 4 denials, all from the sandbox.** They were a
  `cd …; date; …` chain, a bare `date`, a Write to `/tmp/df4731-scene.json`
  outside the cwd, and a `| head`. The tester switched to inline heredocs.
- **L87-L106: arrows lost silently.**
  - One `apply` both deleted and re-created `a9` and `s-pg` (to add
    `elbowed`). It replied `created: 5, deleted: 4` and echoed both arrows.
  - `get a9` then said "not found".
  - The cause is in `dist/cli/commands/elements.js`: `apply` runs create,
    then update, then delete. The delete therefore removed the arrows that
    had just been created.
  - The tester blamed `elbowed: true` (report §2.2) and never learned the
    cause.
  - The same order routes new arrows against positions from before the
    update (report §2.3).
- **L114-L124: waypoints dropped.**
  - The re-created bound arrow came back as 2 points, not the 4 it was
    given.
  - The tester found an undocumented workaround: create it bound, then
    `update` `x`, `y` and `points` together.
- **L108-L114: duplicate arrow.** `e-pay-k2` sat exactly on `e-pay-k`. It
  was invisible in the PNG and was found only by reading 500 lines of
  `query` JSON.
- **L148-L167: edit (a) took 3 calls.** Swapping Pricing and Location
  stacked "4 quote" on "6 nearby", which needed another move.
- **L173: edit (b) was a 16-entry hand shift.** To make room for Surge, the
  tester moved the Data zone, 4 stores, 7 legend items and a polyline down
  100 px, one absolute `y` at a time.
- **L189: points-only update.** It re-anchored `s-pg` to Trip's bottom edge,
  and the line then ran through Postgres.
- **L206: 3 crossings accepted.** Straight centre-to-centre routing with no
  obstacle avoidance left no clean path for arrow 9.

### Ride-hailing, B (elkdraw)

- **L32, L51, L86, L172: all 4 denials came from the sandbox.** They were a
  chained `status; describe; ls`, a Write to `/tmp/elkdraw-dogfood-4741/`,
  a chained `apply && screenshot`, and an `ls` (L172).
- **L53-L57: `--input <path>` rejected** with "JSON Parse error:
  Unrecognized token '/'". Only inline JSON or `-` is accepted. The
  tester switched to a heredoc.
- **L62-L79: the first apply returned 11 lint errors.** These were 4
  wrapped ellipse labels, 2 `label-on-node`, 3 `label-on-own-arrowhead`
  and 2 `arrow-through-label`.
  - Fixing them meant redesigning the grid and resending all 8.8 KB.
  - The skill's `max(160, chars×12)` width rule does not work for
    ellipses.
  - Its 120 px spacing for labelled arrows is too tight; lint wants about
    200 px.
- **L90: a third apply** to widen `analytics` to 310 px. "Analytics
  warehouse" still wrapped at 260.
- **L113-L115: `fontSize` on a frame is rejected.** The tiny zone titles
  cannot be fixed, and they stay in the final.
- **L118-L128: moving the legend frame alone** gave 5 `outside-zone` errors
  in a dry-run. The frame and all 5 children had to be resent with shifted
  `y`.
- **L137-L144: edit (a) took 1 call.** A 3-op `place` apply, dry-run
  first, and the arrows followed.
- **L158: edit (b) took 1 call,** but needed the full `children` list of
  `core` resent.
- **L163-L194: `screenshot --out canvas/docs/dogfood-elkdraw.png`.**
  - It replied with that relative path, but no file appeared in the
    tester's cwd.
  - A `ls` to look for it was denied at L172.
  - It took 3 more calls before an absolute path worked.
  - The file had landed in the **server's** cwd, which was this worktree's
    root. That made it `canvas/docs/dogfood-elkdraw.png` inside the repo,
    outside the tester's sandbox and in a path agents must never touch. It
    was moved out after the run.

### BST, A (yctimlin)

- **L31: one chained command denied** (an `echo >> calllog.md &&` log).
  The tester kept its log with Write instead.
- **L53: the `add` echo** of 65 elements was 26.9 KB of input: a third of
  the run's input text.
- **L67 (shot1): three bugs in the first screenshot.**
  - The tree was 22 px left of the array. That was the tester's mistake:
    it used centres as x.
  - Keys 12 and 10 wrapped in 44 px circles. Labels paint at 20 px
    whatever `fontSize` says.
  - The centred free-text index labels were drawn left-aligned, even
    though the server stored them centred. That is the stored-vs-rendered
    fault elkdraw fixed in 1.20.
- **L79-L94: index labels in transparent boxes vanished.**
  - The workaround put each index label inside a transparent rectangle,
    because container labels do centre.
  - All 17 labels, and lo/hi with them, took the container's transparent
    stroke and disappeared. There was no warning.
  - The tester's worst moment: "the tool has no way to colour a label
    separately".
- **L110: `| head` denied.**
- **L116: back to free text,** placed by guessed glyph widths. The
  tester's check: "only as good as my eye".
- **Answer (2):** "no way to zoom through the CLI… a squint check".

### BST, B (elkdraw)

- **L28: one chained command denied.**
- **L37: read the whole 16.5 KB cheatsheet** to look up labels and assets.
- **L52-L74: the same invisible-label trap as A.**
  - `apply` replied `lints: []`, but the first `look` showed no index
    labels.
  - `get --id i8` found `color: "transparent"`, copied from the box's
    stroke.
  - The tester's worst moment: "If I had trusted lint and skipped the look,
    I would have reported a finished figure with the indices missing."
- **L100-L115: `look --max-px 1024` on a 340×190 crop** came back at scale
  1. The tool cannot magnify, so the tester checked the 14 px digits via
     `describe` values instead.
- **L116-L127: `screenshot --out tmp/bst-final.png`** hit the same
  relative-path fault. The file landed in the server's cwd (this worktree's
  `tmp/`, since moved out).

What both did well on BST: 2 applies (A: 1 add + 2 applies), alignment
proved by numbers, highlight checked against the search rule, and a clean
final.

## Proposed fixes, ranked

"Helps" says which side benefits. A-side faults live in yctimlin's code and
are listed only where they teach elkdraw something.

| #   | problem                                                                                                         | evidence                                                                                                                                                                                                          | proposed change                                                                                                                                                                                                                                                 | helps                  | size |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---- |
| 1   | A label inside a transparent-stroke box is invisible, and lint passes it                                        | bst-b L52-L74 (`lints: []`, 15 labels gone); bst-a L79-L94, the same trap on yctimlin                                                                                                                             | New lint rule `text-invisible`: text colour transparent, or contrast with what is behind it below a floor. Hint: "set label color". Optionally, convert defaults the label colour to `#1e1e1e` when the container stroke is transparent and no colour is given. | B (and any Excalidraw) | S    |
| 2   | `screenshot`/`look --out` with a relative path writes into the server's cwd, and replies with the relative path | rh-b L163-L194, bst-b L116-L127: both B runs; files landed in the worktree root, one under `canvas/`                                                                                                              | The CLI resolves `--out` against its own cwd before sending, and the server rejects a relative `out`. Reply with the absolute path.                                                                                                                             | B                      | S    |
| 2b  | One `apply` that both upserts and deletes an id deletes it, and does not warn                                   | A lost two arrows this way (rh-a L87-L106). A probe on a throwaway elkdraw server showed the same outcome: element `ar` plus patch `delete ar` replied `deleted: ["ar"]`, and `get ar` then answered "no element" | Reject the apply (exit 2, INVALID_INPUT) when an id is both in `elements` and in a `delete` patch, naming the id.                                                                                                                                               | B                      | S    |
| 3   | Arrowheads piling up on a shared target are still missed at 25-30 px                                            | b-rh-02 (25-30 px) and a-rh-15 (about 35 px) in this audit; 1.12 p1rh-10, the same miss                                                                                                                           | Tune `arrowhead-overlap` to fire when two heads land on the same side of one target within about 1.5 head lengths; add both runs as fixtures.                                                                                                                   | B                      | S    |
| 4   | Frame titles render at about 11 px grey and cannot be enlarged                                                  | b-rh-03; rh-b L113-L115 (`fontSize: unknown key`); report §1                                                                                                                                                      | Either allow a frame title size (contract change) or have the skill say "add a free text title at the frame's top-left" and lint small frame names. A contract change needs its own bead.                                                                       | B                      | M    |
| 5   | Skill sizing and spacing advice is wrong                                                                        | rh-b L62: 11 errors on the first apply; ellipses wrap at `max(160, chars×12)`; labelled arrows need 200 px, not 120; rh-a left 3 wrapped ellipses on the same yctimlin rule                                       | Fix SKILL.md: an ellipse width rule (about 1.4× the rectangle rule) and 200 px for labelled arrows. Let the lint hint say the width that would fit.                                                                                                             | B                      | S    |
| 6   | Moving a frame leaves its children behind; adding a child means resending the whole `children` list             | rh-b L118-L128 (5 `outside-zone`), L158                                                                                                                                                                           | A frame move applies its dx/dy to its children. Add a `children` add/remove patch op (or `parent` on the child).                                                                                                                                                | B                      | M    |
| 7   | `look` cannot magnify, so small text cannot be verified                                                         | bst-b L100-L115; bst-a answer (2), where yctimlin has no crop at all                                                                                                                                              | `look --scale n` (up to 4) or `--min-px`: upscale small crops.                                                                                                                                                                                                  | B                      | S    |
| 8   | The skill load is the largest single input on B                                                                 | 27.0 KB SKILL.md vs yctimlin's 17.4 KB; bst-b also read the 16.5 KB cheatsheet                                                                                                                                    | Move reference tables from SKILL.md to the cheatsheet and give the cheatsheet headings to grep, aiming for SKILL.md at or under yctimlin's size. Re-measure with this harness.                                                                                  | B                      | M    |
| 9   | Our pipeline cannot read a yctimlin export with invalid fractional indices                                      | the sidecar threw "invalid order key: a80" on bst-a's export                                                                                                                                                      | Sanitise invalid `index` values in `readScene`/`measure` input (drop and reassign in array order), wherever elkdraw ingests outside scenes (a future `import`).                                                                                                 | B (import)             | S    |
| 10  | `--input` does not take a path                                                                                  | rh-b L53-L57                                                                                                                                                                                                      | Accept `--input @file` (or a path that exists).                                                                                                                                                                                                                 | B                      | S    |
| 11  | Hand coordinates dominate both runs                                                                             | rh-a: 3 crossings left and a 16-entry shift for edit (b); rh-b report §2.1: "70% of the effort"                                                                                                                   | Phase 2 (ELK layered layout with frames as partitions), as already planned. This audit adds no new scope.                                                                                                                                                       | B                      | L    |

For the record, the yctimlin faults this audit found. None of them is an
elkdraw change.

- **Create, update, delete order.** `apply` runs create → update → delete,
  so recreating an id you delete in the same patch loses it silently. It
  also routes new arrows against stale positions.
- **Waypoints dropped.** Bound arrows lose their `points` at create.
- **Points-only update re-anchors.** Updating only `points` on a bound
  arrow moves its origin.
- **Unfaithful export.** It loses `endArrowhead: null`, adds `roundness`,
  and writes invalid fractional indices.
- **Label fonts ignored.** Label `fontSize`/`fontFamily` are ignored at
  paint time.
- **textAlign not painted.** Free-text `textAlign` is stored but not
  painted.
- **Verbose replies.** They echo whole elements; one `add` was 20-27 KB.

elkdraw's compact replies avoid the echo fault, and 1.20 addressed
textAlign; this audit did not exercise that fix. The patch-order fault has
an elkdraw twin (fix 2b).

## Harness and caveats

- **Setup.** `run.sh <task> <portA> <portB>` builds both scratch dirs,
  starts both servers and A's browser tab, runs both testers at the same
  time through `eval/src/cli.ts --live`, captures the finals, and stops
  everything on exit.
- **Tester settings.** Same as 1.12:
  - `claude -p`, `claude-opus-5-5`, `--effort medium`
  - `--setting-sources project,local`, `--strict-mcp-config`
  - `--permission-mode default`
  - the allowlist is enforced by `gate.ts`
- **A's allowlist:**
  - `Bash(npx -y mcp-excalidraw-server:*)`
  - `Skill(excalidraw-skill)`
  - `Read`, `Write` and `Edit` inside the cwd
- **B's allowlist:** 1.12's `ELKDRAW_TOOLS`.
- **Prompts.** `prompts/<task>.md` are the 1.12 prompts made tool-neutral:
  - "Tool under test: ELK draw (elkdraw); read its AGENTS.md…" became "the
    one named in the last line; use its skill's CLI only".
  - The report file became `canvas/docs/dogfood-<skill name>.md`.
  - Each side gets one last line naming its tool, its skill and its URL.
    A's line also says a browser tab is open, as the dogfood testers had.
  - B's prompt is therefore not byte-identical to 1.12's. Dropping "read
    its AGENTS.md" removed the two AGENTS.md denials each 1.12 run had.
    Keep that in mind when reading the 1.12 rows above.
- **A's environment.** `EXPRESS_SERVER_URL` is set to its own port, never
  the 3000 default. `XDG_STATE_HOME` is a per-run dir for its pidfile.
  `TMPDIR` is inside the cwd, so the tester can Read screenshots written
  without `--out`. The yctimlin server keeps the scene in memory; that is
  its only storage.
- **A's browser tab.** `tab.js` holds one headless Playwright Chromium tab
  (1600×1000) on A's URL for the whole run. `run.sh` aborts if
  `browserClients` is 0.
- **B's server.** Its own `ELKDRAW_DATA_DIR` beside the scratch dir, and
  `TMPDIR` inside it.
- **Ports.** Ride-hailing: A 4731, B 4741. BST: A 4732, B 4742. The
  pre-existing servers on 3000/3010/3020 were not touched. No stray
  auto-started yctimlin server appeared.
- **Final captures.**
  - A: `export`, `screenshot --out`, `describe`.
  - B: `screenshot --max-px 2400`, `lint`, `describe`, and the wire scene
    replayed from its event log by `wire.js`. `query` returns neutral
    elements, and `export` is not built.
- **Transcripts.** `trim.js` cut each base64 PNG to its first 64 chars.
  `--dry-run` on the trimmed files reproduces every live row: calls,
  tokens, image sizes and denials.
- **Cost.** rh-a $1.73, rh-b $1.58, bst-a $0.94, bst-b $0.68: $4.93 in all.
  Each run is one sample; with n = 1 per cell, read the 14-26% token gap as
  a direction, not a measurement.

## Files

| path                                                                                         | what                                                                                       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `run.sh`                                                                                     | one task, both sides in parallel                                                           |
| `prompts/*.md`                                                                               | the tool-neutral prompts                                                                   |
| `tab.js`                                                                                     | headless browser tab for yctimlin's frontend                                               |
| `render.js`                                                                                  | sidecar measure → `readScene` → lint, plus a sidecar PNG (`--paint`, `--drop-index`)       |
| `wire.js`, `trim.js`, `score.js`                                                             | elkdraw wire scene; transcript trim; lint-vs-manifest score                                |
| `font-probe.png`, `font-probe.excalidraw`                                                    | what yctimlin paints vs exports for label and free-text fonts                              |
| `<task>/<side>/prompt.md`                                                                    | exact prompt sent                                                                          |
| `<task>/<side>/transcript.jsonl`, `result.json`                                              | trimmed transcript; `claude -p` result (cost, turns, denials)                              |
| `<task>/<side>/row.txt`, `score.txt`                                                         | live score row; `--dry-run` rescore                                                        |
| `<task>/<side>/scene.excalidraw`                                                             | final scene (A: `export`; B: replayed wire scene)                                          |
| `<task>/<side>/final-own.png`, `sidecar.png`                                                 | the side's own final screenshot; our render of the scene                                   |
| `<task>/<side>/lint.json`, `defect-score.json`                                               | our lint on the final (A painted; `a/unpainted/` too); found/missed against `defects.json` |
| `<task>/<side>/defects.json`                                                                 | by-eye manifest                                                                            |
| `<task>/<side>/describe.txt`, `b/lint-own.json`                                              | each tool's own description; elkdraw's own lint                                            |
| `ride-hailing/a/dogfood-excalidraw-skill.md`, `ride-hailing/b/dogfood-elkdraw.md` (+ `.png`) | the testers' reports                                                                       |
| `<task>/a/version.txt`                                                                       | `mcp-excalidraw-server --version` (2.0.0)                                                  |
