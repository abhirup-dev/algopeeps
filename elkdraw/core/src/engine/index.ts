// @elkdraw/core/engine: the heavy engines (mermaid adapter, elkjs layout, lint
// engine, later libavoid) and the code built on them (skeleton, apply, diff,
// place, merge, lift, print, router, families) live here, not in the root
// entry. The root "@elkdraw/core" stays contracts + json.ts (zod only) so the
// app's browser bundle never pulls an engine in. app, adapters/mcp and
// adapters/cli may not import this entry (eslint.config.js).
export {};
