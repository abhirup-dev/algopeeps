#!/usr/bin/env bun
// The tester's allowlist, as a Claude Code PreToolUse hook. Managed settings
// here set allowManagedPermissionRulesOnly, so --allowedTools rules are
// ignored; a hook's allow/deny still applies. cli.ts `live()` installs it.
//
// Rules (Claude Code syntax, a subset):
//   Bash(<prefix>:*)  the command starts with <prefix>, runs one command (no
//                     ; & | ` $( chaining) and redirects output only inside cwd
//   Skill(<name>)     that skill only
//   Read | Write | Edit   files inside the session cwd (symlinks resolved)
// Anything else is denied with DENIED in the reason (transcript.ts counts it).
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseJson } from "@elkdraw/core";
import { z } from "zod";

export const DENIED = "elkdraw-eval: not allowlisted";

const HookInput = z.object({
  cwd: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
});
export type HookInput = z.infer<typeof HookInput>;

/** realpath of the deepest existing ancestor, plus the rest of the path. */
function real(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path
    ? path
    : resolve(real(parent), path.slice(parent.length + 1));
}

function inside(cwd: string, path: string): boolean {
  const root = real(cwd);
  const p = real(isAbsolute(path) ? path : resolve(cwd, path));
  return p === root || p.startsWith(`${root}/`);
}

function bashAllowed(prefix: string, command: string, cwd: string): boolean {
  const [first = ""] = command.split("\n");
  if (!first.startsWith(`${prefix} `) && first !== prefix) return false;
  // Heredoc bodies expand $( and ` unless the delimiter is quoted: check all.
  if (/`|\$\(/.test(command)) return false;
  const line = first.replaceAll(/\d?>&\d/g, "");
  if (/[;&|]/.test(line)) return false;
  return [...line.matchAll(/>>?\s*([^\s<>]+)/g)].every((m) =>
    inside(cwd, m[1] ?? ""),
  );
}

export function decide(rules: string[], input: HookInput): boolean {
  const { tool_name: tool, tool_input: args, cwd } = input;
  const str = (k: string) => (typeof args[k] === "string" ? args[k] : "");
  return rules.some((rule) => {
    const m = /^(\w+)(?:\((.*)\))?$/.exec(rule);
    if (m?.[1] !== tool) return false;
    const spec = m[2];
    switch (tool) {
      case "Bash":
        return (
          spec?.endsWith(":*") === true &&
          bashAllowed(spec.slice(0, -2), str("command"), cwd)
        );
      case "Skill":
        return spec === undefined || spec === str("skill");
      case "Read":
      case "Write":
      case "Edit":
        return inside(cwd, str("file_path"));
      default:
        return spec === undefined;
    }
  });
}

if (import.meta.main) {
  const rules = parseJson(
    z.array(z.string()),
    process.env["ELKDRAW_EVAL_ALLOW"] ?? "[]",
  );
  const input = parseJson(HookInput, await Bun.stdin.text());
  const allow = decide(rules, input);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: allow ? "allow" : "deny",
        ...(allow ? {} : { permissionDecisionReason: DENIED }),
      },
    }),
  );
}
