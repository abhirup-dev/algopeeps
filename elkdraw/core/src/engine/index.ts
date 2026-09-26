// @elkdraw/core/engine: the heavy engines (mermaid adapter, elkjs layout, lint
// engine, later libavoid) and the code built on them (skeleton, apply, diff,
// place, merge, lift, print, router, families) live here, not in the root
// entry. The root "@elkdraw/core" stays contracts + json.ts (zod only) so the
// app's browser bundle never pulls an engine in. app, adapters/mcp and
// adapters/cli may not import this entry (eslint.config.js).
export {
  add,
  apply,
  ApplyInput,
  ApplyPatch,
  PlaceOp,
  type ApplyDeps,
  type ApplyResult,
  type Scene,
} from "../../apply/apply.ts";
export {
  clampScale,
  look,
  MAX_HEIGHT,
  MAX_WIDTH,
  pad,
  targetBox,
  type LookOptions,
  type LookResult,
} from "../../look.ts";
