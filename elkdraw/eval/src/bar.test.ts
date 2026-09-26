import { expect, test } from "bun:test";
import { checkBar, nextStep } from "./bar.ts";

const ref = { toolCalls: 30, tokens: 50_000 };
const ok = {
  toolCalls: 10,
  tokens: 10_000,
  unfixedLintErrors: 0,
  missedDefects: 0,
};

test("exactly a third of the calls and a fifth of the tokens pass", () => {
  expect(checkBar("ride-hailing", ok, ref).verdict).toBe("go");
  expect(checkBar("ride-hailing", { ...ok, toolCalls: 11 }, ref).verdict).toBe(
    "no-go",
  );
  expect(checkBar("ride-hailing", { ...ok, tokens: 10_001 }, ref).verdict).toBe(
    "no-go",
  );
});

test("any unfixed lint error fails", () => {
  expect(checkBar("bst", { ...ok, unfixedLintErrors: 1 }, ref).verdict).toBe(
    "no-go",
  );
});

test("missed defects: 0 for ride-hailing, at most 1 for BST", () => {
  expect(
    checkBar("ride-hailing", { ...ok, missedDefects: 1 }, ref).verdict,
  ).toBe("no-go");
  expect(checkBar("bst", { ...ok, missedDefects: 1 }, ref).verdict).toBe("go");
  expect(checkBar("bst", { ...ok, missedDefects: 2 }, ref).verdict).toBe(
    "no-go",
  );
});

test("unmeasured is incomplete unless something already failed", () => {
  const partial = { ...ok, unfixedLintErrors: null, missedDefects: null };
  expect(checkBar("bst", partial, ref).verdict).toBe("incomplete");
  expect(checkBar("bst", { ...partial, toolCalls: 99 }, ref).verdict).toBe(
    "no-go",
  );
});

test("no-go rule: one fix cycle, then stop", () => {
  expect(nextStep("go", 1)).toBe("proceed");
  expect(nextStep("no-go", 1)).toBe("fix-cycle");
  expect(nextStep("no-go", 2)).toBe("stop");
  expect(nextStep("incomplete", 2)).toBe("measure-the-rest");
});
