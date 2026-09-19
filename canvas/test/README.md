# canvas/test

`smoke.ts` — black-box smoke of the running canvas server (CONTRACT.md §3), via
`@modelcontextprotocol/client` Streamable HTTP.

    bun run --cwd canvas/server dev   # server must be running on :3100
    bun run --cwd canvas smoke

Server absent → exit 2 with a start hint. Any failed step → exit 1.
One PASS/FAIL line per step; server-side contract violations are filed under
`## WP-E smoke findings` in NOTES.md.
