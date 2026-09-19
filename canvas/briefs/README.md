# Briefs

One file per work package. Every brief is read by a worker agent that has only this repo and `/tmp/*-audit` clones as context.

## Standing rules for every worker (apply even if a brief forgets them)

1. **Ask, don't guess.** If a brief, `CONTRACT.md`, or a decision is unclear, message the orchestrator with your `SendMessage` tool: `to="mcp-shared-canvas-plan"`. You will get an answer within minutes. Do not stall and do not invent a contract change.
2. **You cannot see images if you are GLM-5.3.** Never reason about what a screenshot "shows"; send its path to the orchestrator instead.
3. **Scope is the listed paths only.** Other workers are editing sibling packages in parallel.
4. **Done means verified**: run the commands the brief names, paste real output into `NOTES.md` under your section, then print the DONE marker on its own line.
5. Never commit, never push, never run `bd export`.
