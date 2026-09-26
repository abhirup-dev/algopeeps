import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide } from "./gate.ts";

const cwd = realpathSync(mkdtempSync(join(tmpdir(), "gate-")));
const outside = realpathSync(mkdtempSync(join(tmpdir(), "gate-out-")));
mkdirSync(join(cwd, "sub"));
symlinkSync(outside, join(cwd, "link"));
const rules = ["Bash(bun cli.ts:*)", "Skill(elkdraw)", "Read", "Write"];
const ok = (tool_name: string, tool_input: Record<string, unknown>) =>
  decide(rules, { cwd, tool_name, tool_input });
const bash = (command: string) => ok("Bash", { command });

test("Bash: one allowlisted command, redirects inside cwd only", () => {
  expect(bash("bun cli.ts --url u status")).toBe(true);
  expect(bash("bun cli.ts apply --input - < /tmp/s.json 2>&1")).toBe(true);
  expect(bash("bun cli.ts status > sub/out.json")).toBe(true);
  expect(
    bash('bun cli.ts apply --input - <<\'EOF\'\n{"a": "x | y; z"}\nEOF'),
  ).toBe(true);
  expect(bash("bun cli.tsx status")).toBe(false);
  expect(bash("ls")).toBe(false);
  expect(bash("bun cli.ts status; ls")).toBe(false);
  expect(bash("bun cli.ts status && ls")).toBe(false);
  expect(bash("echo {} | bun cli.ts validate --input -")).toBe(false);
  expect(bash("bun cli.ts status | head")).toBe(false);
  expect(bash("bun cli.ts $(ls)")).toBe(false);
  expect(bash("bun cli.ts status > /tmp/out.json")).toBe(false);
  expect(bash("bun cli.ts status > link/out.json")).toBe(false);
});

test("files: inside cwd, symlinks resolved", () => {
  expect(ok("Write", { file_path: join(cwd, "s.json") })).toBe(true);
  expect(ok("Write", { file_path: "sub/new/s.json" })).toBe(true);
  expect(ok("Read", { file_path: "/etc/hosts" })).toBe(false);
  expect(ok("Write", { file_path: join(cwd, "link", "x") })).toBe(false);
  expect(ok("Write", { file_path: join(cwd, "..", "x") })).toBe(false);
  expect(ok("Edit", { file_path: join(cwd, "s.json") })).toBe(false);
});

test("other tools: only the named skill; unlisted tools denied", () => {
  expect(ok("Skill", { skill: "elkdraw" })).toBe(true);
  expect(ok("Skill", { skill: "excalidraw-skill" })).toBe(false);
  expect(ok("Glob", { pattern: "*" })).toBe(false);
});
