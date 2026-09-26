import { expect, test } from "bun:test";
import { baselineOf, diff, merge, wsUrl } from "./sync.ts";

const el = (id: string, version: number, isDeleted = false) => ({
  id,
  version,
  isDeleted,
});

test("diff sends new, bumped and deleted elements only", () => {
  const baseline = baselineOf([el("a", 1), el("b", 1), el("c", 1)]);
  const scene = [el("a", 1), el("b", 2), el("c", 2, true), el("d", 1)];
  expect(diff(baseline, scene)).toEqual({
    upserts: [el("b", 2), el("d", 1)],
    deletes: ["c"],
  });
  expect(diff(baselineOf(scene), scene)).toEqual({ upserts: [], deletes: [] });
});

test("merge replaces by id, appends new, drops deletes", () => {
  const out = merge([el("a", 1), el("b", 1)], [el("b", 5), el("c", 1)], ["a"]);
  expect(out).toEqual([el("b", 5), el("c", 1)]);
});

test("wsUrl is same-origin unless overridden", () => {
  const loc = (href: string) => new URL(href) as unknown as Location;
  expect(wsUrl(loc("http://127.0.0.1:4000/"))).toBe("ws://127.0.0.1:4000/ws");
  expect(wsUrl(loc("https://x.dev/"))).toBe("wss://x.dev/ws");
  expect(wsUrl(loc("http://h/"), "ws://env/ws")).toBe("ws://env/ws");
  expect(wsUrl(loc("http://h/?ws=ws%3A%2F%2Fq%2Fws"), "ws://env/ws")).toBe(
    "ws://q/ws",
  );
});
