import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { projectDir, run } from "./cli.ts";

const fixture = new URL("../fixtures/yct-ride-hailing.jsonl", import.meta.url)
  .pathname;

test("--dry-run on a recorded transcript gives one JSON row and one markdown row", async () => {
  const { row, markdown } = await run([
    "--dry-run",
    fixture,
    "--task",
    "ride-hailing",
  ]);
  expect(row.label).toBe("yct-ride-hailing");
  expect(row.toolCalls).toBe(33);
  expect(row.tokens.total).toBe(59997);
  // The dogfood itself is far above ⅓ calls; lint and review are unmeasured.
  expect(row.bar.verdict).toBe("no-go");
  expect(row.bar.next).toBe("fix-cycle");
  expect(row.vsBaseline).toEqual({ toolCalls: 1.031, tokens: 1 });
  expect(markdown).toBe(
    "| yct-ride-hailing | ride-hailing | 33 | 59997 (27158 + 15965 + 16874) | 11 | 441.4 | 1.031 | 1 | no-go |",
  );
});

test("rejects a missing mode or task", async () => {
  const fail = (argv: string[]) =>
    run(argv).then(
      () => "ok",
      (e: unknown) => (e instanceof Error ? e.message : "?"),
    );
  expect(await fail(["--dry-run", fixture])).not.toBe("ok");
  expect(await fail(["--task", "bst"])).toContain("--dry-run");
});

test("projectDir mirrors Claude Code's cwd slug", () => {
  expect(projectDir("/Users/x/Codes/algopeeps.abhirup-canvas")).toBe(
    `${homedir()}/.claude/projects/-Users-x-Codes-algopeeps-abhirup-canvas`,
  );
});
