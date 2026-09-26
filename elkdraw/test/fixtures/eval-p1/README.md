# Phase 1 eval fixtures (1.19)

The two Phase 1 eval runs (`eval/phase-1/`) at the revs where their by-eye
defects were drawn, for the lint parity test
(`test/parity/lint/lint.e2e.ts`). Every `scene.excalidraw` is the server's
stored wire scene at that rev: `new Store(dir).sceneAt(rev)`
(`adapters/server/src/store.ts`) over the run's own event log. The `/tmp`
sources will not survive a reboot, so these copies are the record.

| Fixture   | Rev | Source log                                                              | Picture                                                       |
| --------- | --- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `rh-r1/`  | 1   | `/private/tmp/elkdraw-eval-ride-hailing.peEs.data/default/events.jsonl` | `default-screenshot-r1-*.png` (tester's)                      |
| `rh-r2/`  | 2   | same                                                                    | `default-screenshot-r2-*.png`                                 |
| `rh-r4/`  | 4   | same                                                                    | `default-screenshot-r4-*.png`                                 |
| `rh-r8/`  | 8   | same                                                                    | `default-screenshot-r8-*.png`                                 |
| `rh-r9/`  | 9   | same (final; = `eval/phase-1/ride-hailing/scene.json`)                  | `default-screenshot-r9-*.png`                                 |
| `bst-r1/` | 1   | `/private/tmp/elkdraw-eval-bst.2qfB.data/default/events.jsonl`          | `look.png` = `default-look-r1-*.png` (no screenshot at rev 1) |

Pictures were copied from `<scratch>/tmp/elkdraw/` of each run.

`defects.json` has the dogfood manifests' shape (`test/fixtures/README.md`),
with ids from `eval/phase-1/*/defects.json`. Differences:

- One entry per lint hit (p1rh-01 is 9 entries, one per clipped arrow), with
  `rule` set to the code that flags it. Bound labels are `<owner>#label`, as
  apply names them.
- `fixedInFinal` is false throughout: each scene is the rev it shows.
- `wontFix: {reason}`: drawn, but no rule over the scene can see it
  (p1rh-05's style reset, p1bst-01, p1bst-02). Out of the must-flag set, like
  `notDrawn`.
- `notDrawn` on rh-r1's two crossings: the frames clip both arrows.
