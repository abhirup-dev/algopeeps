// Scores one run's lint hits against its by-eye defects.json with
// eval/src/score.ts. --dash maps lint's `<owner>#label` to the dogfood
// fixtures' `<owner>-label` (the yctimlin side, as lint.e2e.ts does).
//   bun elkdraw/eval/audit-p1/score.js <defects.json> <lint.json> [--dash]
import { readFileSync } from "node:fs";
import { LintHit, parseJson } from "@elkdraw/core";
import { z } from "zod";
import { Manifest, score } from "../src/score.ts";

const [defects, hits] = process.argv.slice(2);
if (defects === undefined || hits === undefined)
  throw new Error("usage: score.js <defects.json> <lint.json> [--dash]");
const dash = process.argv.includes("--dash");
const m = parseJson(Manifest, readFileSync(defects, "utf8"));
const lint = parseJson(z.array(LintHit), readFileSync(hits, "utf8")).map((h) =>
  dash ? { ...h, ids: h.ids.map((id) => id.replace(/#label$/, "-label")) } : h,
);
const s = score(m, lint);
console.log(
  JSON.stringify({
    found: s.found,
    missed: s.missed,
    flaggedFixed: s.flaggedFixed,
    cleanRegionHits: s.cleanRegionHits.length,
  }),
);
