# WP-J — ownership is provenance, not a lock (CONTRACT v1.2 §2)

Read `canvas/CONTRACT.md` §2 (just changed to v1.2) and `canvas/NOTES.md` (§WP-B, §WP-E, §WP-F). Dogfood verdict from the human: a canvas where they cannot move or edit the agent's drawing does not count as collaboration. Make the code match v1.2. Another worker (WP-H) is converting the workspace to Bun right now and may touch `package.json`/scripts; do not edit those. Server on :3100 and host on :8080 are live for the human; restart the server only when your change is ready, then tell the orchestrator on the bus (`SendMessage` to `mcp-shared-canvas-plan`) so the human reloads.

**Scope:** `canvas/shared/src/owner.ts`, `canvas/server/src/store.ts`, `canvas/server/src/server.ts`, `canvas/server/test/**`, `canvas/test/smoke.ts` (step 4 only), `canvas/server/src/guide.md` (one sentence), `canvas/AGENTS.md` (one line).

## Changes

1. `stampAgent` no longer sets `locked:true`. Existing stored agent elements that carry `locked:true` are unlocked on the next `canvas_pull` (server rewrites `locked:false` on read of agent-owned elements; one-off, keep it simple).
2. `canvas_save`: accept human changes and deletions of agent-owned elements. On change: keep `customData.owner:"agent"`, set `customData.editedBy:"human"`, bump rev, log a `human_edit` event with `ids` and `detail.agentOwned: true`. On deletion: delete, log `human_edit` with `detail.deleted`. The seed-based conversion-accept path stays as is (a conversion is not a human edit: do not set `editedBy` when the incoming element has a `seed`, the stored one does not, and x/y are unchanged within 0.5 px).
3. `rejected` now only lists malformed elements (missing id/type). Update the server unit tests: the "moved agent element is rejected" cases become "moved agent element is accepted, tagged editedBy human, event logged"; keep "omitted agent id" as deletion accepted. Add one test that an agent tool still cannot modify a human id (rule 2 unchanged).
4. `test/smoke.ts` step 4: assert the moved agent element is accepted with `editedBy:"human"` and `canvas_changes` reports it under `changed`. Keep it 8/8.
5. `guide.md`: replace any sentence saying agent elements are locked with "the human may move or edit your annotations; check `editedBy` in `canvas_read` before referring to them". `AGENTS.md`: add the same one line to the tutor rules.

## Done means

`bun run --cwd canvas check` (or `pnpm -C canvas check` if WP-H has not landed yet; use whichever the root `package.json` currently has) green; server tests green; smoke 8/8 against a restarted server; summary under `## WP-J unlock` in NOTES. Message the orchestrator on the bus when the server is restarted, then print `WP-J DONE`.
