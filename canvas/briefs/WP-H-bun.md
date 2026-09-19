# WP-H — move the workspace from pnpm to Bun (queued: start only after WP-F and WP-I report DONE)

Goal: Bun as package manager and script runner for `canvas/` (`bun install`, `bun run`, `bunx`), and Bun as the **runtime** wherever it is proven to work; Node 24 stays the runtime for anything that does not, with the reason written down. No behaviour changes.

Read `canvas/NOTES.md` fully first (WP-I may have just added lint/format tooling; keep every script it added working).

## Steps

1. `bun install` at `canvas/` (workspaces are declared in root `package.json`; drop `pnpm-workspace.yaml` and `pnpm-lock.yaml` only after `bun.lock` exists and everything below passes). Replace `pnpm -C <pkg>` / `pnpm -r` in scripts, `scripts/*.sh`, `README.md`, `AGENTS.md`, `.github/workflows/*` and the briefs' "how to run" lines with the Bun equivalents (`bun run --cwd`, `bun run --filter`).
2. Runtime trials, each with a written result in `NOTES.md` under `## WP-H bun`:
   - `shared` tests under `bun test`? The suite is `node:test`; if Bun's runner does not run them cleanly, keep `bun run` calling `tsx`/node for tests and say so.
   - `server`: run `bun src/main.ts` and execute `canvas/test/smoke.ts` against it (8/8 expected). MCP SDK 2.x Streamable HTTP + express under Bun is the real question; if any step fails, keep `node`/`tsx` for `server dev` and record the exact failure.
   - `app`: Vite build under Bun (`bunx vite build`), size unchanged; Playwright test still green.
3. `mise`: add `bun` to `~/.config/mise/config.toml`? No — do not edit user config. Instead add a `canvas/.mise.toml` pinning `bun = "latest"` and `node = "24"`, and mention it in README.
4. Keep `bun run check` semantics as `bun run check`.

## Done means

`bun run check` green, smoke 8/8 via the chosen server runtime, results table in NOTES. Do not commit. Reply `WP-H DONE` on its own line.
