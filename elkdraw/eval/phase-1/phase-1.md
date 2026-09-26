# Phase 1 eval (1.12)

Two dogfood tasks, re-run through the Phase 1 tools (Excalidraw-native
skeletons, no Mermaid/ELK) by one fresh Opus tester per task that had only
the elkdraw skill. Scored against `eval/baseline.json` with `src/cli.ts`,
`src/bar.ts` and `src/score.ts`. Run 2026-09-26, branch `elkdraw/p1.12-eval`.

**Result: §17.4 bar no-go on both tasks.** Calls and tokens are flat against
the dogfood on ride-hailing and 2.5-3.5x worse on BST. Lint errors left: 0 on
both. Missed defects: 1 on each task, which fails ride-hailing (limit 0) and
passes BST (limit ≤ 1). **Recommendation: go for Phase 2**, after four Phase 1
bugs are fixed first (see Go/no-go).

## Numbers vs baseline

| run                   | task         | calls   | tokens (out + text + img)        | images | wall s    | denials | calls ÷ base | tokens ÷ base | lint errors left | missed defects | bar       |
| --------------------- | ------------ | ------- | -------------------------------- | ------ | --------- | ------- | ------------ | ------------- | ---------------- | -------------- | --------- |
| dogfood (yct / batch) | ride-hailing | 33 / 32 | 59997 / 61937                    | 11 / 7 | 441 / 438 | n/a     | 1            | 1             | not measured     | 14 / 8 unfixed | reference |
| **p1-ride-hailing**   | ride-hailing | **35**  | **59969** (33289 + 19010 + 7670) | 5      | 344       | 4       | 1.094        | 1.000         | **0**            | **1**          | no-go     |
| dogfood (yct round 3) | bst          | 10      | 13025                            | 3      | 148       | n/a     | 1            | 1             | not measured     | not exported   | reference |
| **p1-bst**            | bst          | **35**  | **32624** (15456 + 15318 + 1850) | 3      | 171       | 3       | 3.500        | 2.505         | **0**            | **1**          | no-go     |

The §17.4 limits and each check's result:

| measure                                    | ride-hailing limit | ride-hailing | BST limit | BST     |
| ------------------------------------------ | ------------------ | ------------ | --------- | ------- |
| tool calls                                 | ≤ 10.67            | 35 ✗         | ≤ 3.33    | 35 ✗    |
| tokens                                     | ≤ 11999            | 59969 ✗      | ≤ 2605    | 32624 ✗ |
| lint errors left unfixed                   | 0                  | 0 ✓          | 0         | 0 ✓     |
| defects seen by eye that lint did not flag | 0                  | 1 ✗          | ≤ 1       | 1 ✓     |

Both rows are `comparable: true` (same tester model and effort as the
baseline). `bar.next` is `fix-cycle` for both.

What makes up the tokens. Loading the skill costs about 13.3K tokens per run:
SKILL.md is about 8.3K and the cheatsheet about 5.0K, and both testers read
both. That load alone is 5x the BST limit. The BST baseline was a warm
round-3 session with nothing loaded. Taking the skill out still leaves about
46.7K (ride-hailing) and 19.3K (BST). Both are still far over their limits,
so the no-go does not come from the skill load.

Tool calls by name:

| run          | Bash | Read | Edit | Write | Skill |
| ------------ | ---- | ---- | ---- | ----- | ----- |
| ride-hailing | 23   | 9    | 0    | 2     | 1     |
| bst          | 10   | 6    | 17   | 1     | 1     |

Ride-hailing made 22 diagram CLI calls: 9 apply (1 rejected with exit 2),
5 screenshot, 2 get, 1 look, 1 snapshot, 1 describe, 1 status, 1 place
apply and 1 Surge apply. It also read 5 screenshots.

Of BST's 35 calls, 17 are single-number `Edit`s. The tester's
one-line `bun -e` fix was denied (see Denials), so it made the same change by
hand. If that script had been allowed, BST would have been about 19 calls,
which is still far over 3.33.

## Setup (per run)

- `sh eval/phase-1/setup.sh <task> <port>` makes a fresh
  `/tmp/elkdraw-eval-<task>.XXXX` with these parts:
  - `SKILL.md` and `references/` in `.claude/skills/elkdraw/`, so the skill
    loads as a project skill.
  - An `elkdraw` symlink to this worktree's `elkdraw/`, so SKILL.md's relative
    `bun elkdraw/adapters/cli/src/main.ts` runs.
  - The brief copied to `canvas/briefs/`.
  - The prompt: `eval/prompts/<task>.md` plus one line naming the skill and
    the URL.
  - Its own server on 4721 (ride-hailing) or 4722 (BST). The server's
    `ELKDRAW_DATA_DIR` sits beside the scratch dir, and its `TMPDIR` sits
    inside it, so the tester can Read the look and screenshot PNGs.
- `bun eval/src/cli.ts --live --task <t> --prompt-file <scratch>.prompt.md
--cwd <scratch>` runs `claude -p` with these flags:
  - `--model claude-opus-5-5 --effort medium`
  - `--setting-sources project,local --strict-mcp-config`: no user hooks,
    plugins, skills or MCP servers.
  - `--permission-mode default`
  - The allowlist is enforced by the `src/gate.ts` PreToolUse hook (next
    section).
- The runs went one at a time. Both servers were stopped afterwards.
- End-of-run captures, taken with the diagram CLI:
  - `export` returns `NOT_IMPLEMENTED`, so `scene.json` is `query --limit 1000`.
  - `final.png` is `screenshot --max-px 2400`.
  - `lint.json` and `describe.txt`.

### Permissions: why a hook, not `--allowedTools`

This machine's managed settings (`~/.claude/remote-settings.json`) set
`allowManagedPermissionRulesOnly: true`, and Claude Code 2.1.283 then
ignores every `--allowedTools` rule. Probes with Haiku showed
`Bash(bun:*)` still asking for approval on `bun --version`, and
`Write` / `Edit(./**)` / `//abs/**` rules all denied. A hook decision still
applies. So `gate.ts` enforces the allowlist and `live()` installs it through
`--settings`. The allowlist is a parameter: `--allowed-tools RULE`,
repeatable, defaulting to `ELKDRAW_TOOLS`. The 1.14 audit can pass
`--allowed-tools 'Bash(npx -y mcp-excalidraw-server:*)' --allowed-tools Read
...`. These are the rules for elkdraw:

- `Bash(bun elkdraw/adapters/cli/src/main.ts:*)`, plus the same rule with the
  absolute path. The call must be a single command: no `;`, `&`, `|`, `` ` ``
  or `$(`. Heredocs and `<` inputs are allowed; `>` must point inside cwd.
- `Skill(elkdraw)`.
- `Read`, `Write` and `Edit` inside the scratch cwd, with symlinks resolved.
  The `elkdraw` link therefore gives no read or write access to the
  worktree. `git status` was clean after both runs.

Denials are counted from the transcript (`transcript.ts` `DENIAL`). They
match `permission_denials` in the `claude -p` result on both runs: 4 and 3.

### Denials

| run          | call                                                       | why it matters                                                                                                  |
| ------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ride-hailing | `cd …; ls; ls elkdraw canvas …; wc -l elkdraw/AGENTS.md …` | orientation; the prompt says "read its AGENTS.md"                                                               |
| ride-hailing | `Read elkdraw/AGENTS.md`                                   | the prompt's AGENTS.md. It resolves outside cwd, and in this repo it is the contributor rules, not a user guide |
| ride-hailing | `Write /tmp/elkdraw-ride-peEs/scene.json`                  | the skill's own example writes `/tmp/scene.json`. The tester fell back to heredocs, with no scene file on disk  |
| ride-hailing | `bun … get --id s3; bun … get --id s7`                     | chained two CLI calls                                                                                           |
| bst          | `ls; find . -name AGENTS.md …`                             | orientation                                                                                                     |
| bst          | `Read elkdraw/AGENTS.md`                                   | as above                                                                                                        |
| bst          | `bun -e '…JSON.parse(await Bun.file("scene.json")…'`       | a script to shift 17 x values. Its denial produced the 17 Edits                                                 |

The sandbox caused all 7 denials; none came from the tool. Two of them (the
AGENTS.md reads) come from the dogfood prompt's wording, which assumes the
repo checkout.

## Per-run notes

### Ride-hailing (draft, then move Pricing, then insert Surge)

The draft was finished and met every brief requirement: 51 elements, zones as
dashed rectangles, numbers 1-9 in order, a legend and a title. The tester
also wrote the report (`ride-hailing/tester-report.md`). Wall time was 344 s,
against 438-441 s for the dogfood. Where it struggled, in its own words:

1. **Frames clip cross-zone arrows.**
   - What happened: "Arrows 3 and 7 lost their labels, and
     pay-stripe/notif-apns/apns-driver were cut at the frame edge."
   - Lint only fired `outside-zone`, with the hint "take s3 out of its
     children". The tester's answer: "I never put arrows in `children`".
   - It dropped frames for plain rectangles.
2. **Moves don't re-route bound arrows**, although SKILL.md says they do.
   - "moving the four Data ellipses produced 7 `dangling-endpoint` errors
     (`s7 end is 84px off redis`)".
   - Lint named every arrow, so the fix could be made blind.
3. **Partial upsert silently resets.**
   - "`{"id":"legend-zone","type":"rectangle","x":40,"y":1170}` reset the
     rectangle to 100×100 with default stroke".
   - Lint was clean at that rev.
4. **Place-only apply wipes the element.** This was the worst bug it hit.
   - `apply --place '[{"op":"leftOf","id":"pricing","of":"matching","gap":160}]'`
     "returned `updated:1` with no warnings".
   - Pricing became "`{"fill":"transparent","stroke":"#1e1e1e"}, width 100,
height 100`, label gone".
   - Its verdict: "silent data loss on the recommended path". Edit (a) took
     3 calls.
5. **Lint gaps**, where the tester saw a problem by eye and lint did not.
   - Ellipse labels wrapped with no `text-wrapped` hit.
   - A label sat on another arrow's line with no `arrow-through-label` hit.
   - Legend and Pricing lost their style or label with no hit.
   - The tester: "Lint was 'clean' at the moment the diagram looked worst
     (rev 8)".

What worked: lint in every apply reply with ids and hints, which caught
`label-on-own-arrowhead` ×5 and every dangling end. The strict schema
rejected bad input atomically. The headless screenshot needed no browser.
Replies were compact: "A 45-element write cost about 7 KB in and about 3 KB
out".

Final PNG, by eye (`ride-hailing/defects.json`; `score.ts` reports found
p1rh-08, p1rh-09 and missed p1rh-10):

- p1rh-08 and p1rh-09: two `crossing` hits, severity info, both flagged.
- p1rh-10, **missed**: the async arrowheads from Trip and Payment overlap
  where they land on Kafka's top edge. No rule covers arrowheads of different
  arrows piling up on a shared target.
- Tool defect, not counted: the whole-canvas `screenshot` crops the bottom of
  the scene. The legend box's bottom edge is cut in both the tester's rev-9
  image and `--max-px 2400`; `look --target legend-zone` shows it whole.

### BST (dense figure)

Done in 2 applies: 65 elements, 0 lint hits, alignment within 0.5 px per
column (checked with `look` boxes), search path 8→12→10→11 highlighted.
Answer in `bst/tester-answer.md`. Where it struggled:

- **The worst moment is the dogfood's, again.**
  - "The first render put the index labels about 16px left of their columns,
    even though lint was clean. The text elements had ignored the `width`
    and `textAlign: center` I set."
  - This is the same stored-vs-rendered alignment defect listed as unmapped
    in `test/fixtures/dogfood/bst/defects.json`. Phase 1 still neither fixes
    nor lints it.
- **The fix was sandbox-bound.** "My one-line script to shift the values was
  blocked, so I had to make 17 separate hand edits."
- **Is 14 px text sharp enough to check?**
  - In the full screenshot, "I could read them, but only just; in that view
    I would not trust myself to tell a 3 from an 8."
  - A 1:1 `look` crop "is clearly legible", but it covered indices 7-12
    only.

Final PNG, by eye (`bst/defects.json`):

- One cosmetic miss, p1bst-02: edge 8→4 renders as two separate strokes, an
  effect of the hand-drawn roughness style. Within the BST limit of 1.
- Otherwise clean. Every cell sits under its node's column. The lo and hi
  arrows point at indices 8 and 11. The path is highlighted in both nodes
  and edges.

## §17.4 bar

`bar.ts` verdict: **no-go on both tasks** (`next: fix-cycle`).

- The calls and tokens measures fail by a wide margin: 3.3x and 5x over on
  ride-hailing, 10x and 12x over on BST.
- Lint errors left: 0 on both, which passes.
- Missed defects: ride-hailing fails with 1 (an arrowhead pile-up); BST
  passes with 1.

The design sets the ⅓-calls / ⅕-tokens bar as the Phase 2 target (Mermaid in,
ELK layout, merge). Phase 1 has no layout engine, so the tester still places
every coordinate itself. A no-go on calls and tokens here is expected. It sets
the number Phase 2 has to beat: 2.12 re-runs this same harness.

## Go/no-go for Phase 2

**Go**, with four Phase 1 bugs fixed first as their own beads. Each one
silently undoes work, and the Phase 2 merge/apply loop would inherit it:

1. `place`-only apply wipes an existing element's size, style and label
   (p1rh-06).
2. A partial upsert replaces the element instead of patching it, and resets
   size and style (p1rh-05). The fix is to merge, or to reject loudly.
3. Bound arrows do not re-route when an endpoint moves through `apply` or
   `place` (p1rh-07). SKILL.md promises that they do.
4. Frames claim every cross-zone arrow and clip it, and the `outside-zone`
   hint points at the wrong cause (p1rh-01).

Why go:

- Phase 1's own measures hold. Lint was clean at the end on both runs.
- The dogfood's final scenes had 14 and 8 unfixed defects (fixtures
  manifests). These runs end with 1 each.
- The remaining cost is placement by hand and re-sending on every move. ELK
  layout and merge in Phase 2 are aimed at exactly that.

Phase 2 would also benefit from these lint rules:

- `text-wrapped` for ellipse and diamond labels.
- An arrow line under another arrow's label (`arrow-through-label`).
- A shape that lost its label or was reset to defaults.
- Arrowheads overlapping at a shared target.
- Free text rendered away from its stored `textAlign`.

## Files

| path                                                                             | what                                                                                               |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `setup.sh`                                                                       | per-run scratch, skill, prompt and server                                                          |
| `<task>/prompt.md`                                                               | the exact prompt sent                                                                              |
| `<task>/transcript.jsonl`                                                        | the tester's transcript, with image data cut to the PNG header (`--dry-run` reproduces the scores) |
| `<task>/result.json`                                                             | `claude -p` result: cost, turns, `permission_denials`                                              |
| `<task>/score.txt`                                                               | `cli.ts --dry-run … --unfixed-lint 0 --missed 1`: JSON row and markdown row                        |
| `<task>/scene.json`, `describe.txt`, `lint.json`, `final.png`                    | final scene (`query`), description, lint, PNG                                                      |
| `<task>/defects.json`                                                            | by-eye manifest in the dogfood fixtures' shape                                                     |
| `ride-hailing/tester-report.md`, `bst/tester-answer.md`, `bst/tester-scene.json` | the testers' own outputs                                                                           |

Cost: $1.61 for ride-hailing and $0.75 for BST (37 turns each).
