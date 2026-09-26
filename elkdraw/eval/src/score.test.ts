import { expect, test } from "bun:test";
import { parseJson, type LintHit } from "@elkdraw/core";
import { Manifest, score } from "./score.ts";

const manifest = parseJson(
  Manifest,
  await Bun.file(
    new URL("../../test/fixtures/dogfood/yct/defects.json", import.meta.url),
  ).text(),
);
const hit = (code: LintHit["code"], ...ids: string[]): LintHit => ({
  code,
  ids,
  bbox: { x: 0, y: 0, width: 0, height: 0 },
  severity: "error",
  hint: "",
});

test("no hits: every unfixed defect is missed", () => {
  const s = score(manifest, []);
  expect(s.found).toEqual([]);
  expect(s.missed).toHaveLength(15);
});

test("hits need the same rule and all of the defect's ids", () => {
  const s = score(manifest, [
    hit("crossing", "s-stripe", "a7", "extra"), // yct-10
    hit("text-wrapped", "postgres-label"), // yct-15
    hit("label-on-border", "a8-label"), // yct-19 needs z-core too
    hit("arrow-through-node", "a5", "trip"), // yct-01, fixed during the session
    hit("node-overlap", "legend", "lg-sync"), // inside the legend clean region
  ]);
  expect(s.found).toEqual(["yct-10", "yct-15"]);
  expect(s.missed).toContain("yct-19");
  expect(s.missed).toContain("yct-12"); // rule gap: no v0 rule can flag it
  expect(s.flaggedFixed).toEqual(["yct-01"]);
  expect(s.cleanRegionHits).toHaveLength(1);
});
