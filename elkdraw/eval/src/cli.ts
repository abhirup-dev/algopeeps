#!/usr/bin/env bun
// elkdraw-eval: one JSON line + one markdown row per run.
//
//   elkdraw-eval --dry-run <transcript.jsonl> --task ride-hailing|bst
//                [--from ISO] [--to ISO] [--label L]
//                [--unfixed-lint N] [--missed N] [--attempt 1|2]
//   elkdraw-eval --live --task T --prompt-file P --cwd DIR   (Phase 1+)
//                [--allowed-tools RULE]...   (default: ELKDRAW_TOOLS)
//
// --dry-run reads a recorded transcript. --live runs one Opus tester with
// `claude -p` in DIR, then reads the transcript that run wrote. The tester
// may use only the allowlisted tools; any other call is denied and counted.
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseJson } from "@elkdraw/core";
import { z } from "zod";
import { checkBar, nextStep, TASKS, type Task } from "./bar.ts";
import { readTranscript, type TranscriptMetrics } from "./transcript.ts";

const Baseline = z.object({
  tester: z.object({ model: z.string(), effort: z.string() }),
  reference: z.record(
    z.enum(TASKS),
    z.object({ toolCalls: z.number(), tokens: z.number() }),
  ),
});

export const MARKDOWN_HEADER =
  "| run | task | calls | tokens (out + text + img) | images | wall s | denials | calls ÷ base | tokens ÷ base | bar |\n|---|---|---|---|---|---|---|---|---|---|";

const GATE = resolve(import.meta.dir, "gate.ts");
const CLI = resolve(import.meta.dir, "../../adapters/cli/src/main.ts");

/**
 * The elkdraw tester's allowlist (gate.ts syntax): the diagram CLI (as
 * SKILL.md spells it, relative to a cwd that holds an `elkdraw` link, and by
 * absolute path), the skill, and Read/Write/Edit inside the cwd.
 */
export const ELKDRAW_TOOLS = [
  "Bash(bun elkdraw/adapters/cli/src/main.ts:*)",
  `Bash(bun ${CLI}:*)`,
  "Skill(elkdraw)",
  "Read",
  "Write",
  "Edit",
];

/** ~/.claude/projects/<slug>: Claude Code replaces `/` and `.` in the cwd with `-`. */
export function projectDir(cwd: string): string {
  return `${homedir()}/.claude/projects/${cwd.replace(/[/.]/g, "-")}`;
}

const count = (s: string | undefined) => (s === undefined ? null : Number(s));

export async function run(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      live: { type: "boolean" },
      task: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      label: { type: "string" },
      baseline: { type: "string" },
      "unfixed-lint": { type: "string" },
      missed: { type: "string" },
      attempt: { type: "string", default: "1" },
      "prompt-file": { type: "string" },
      cwd: { type: "string" },
      "allowed-tools": { type: "string", multiple: true },
    },
  });
  const task = z.enum(TASKS).parse(values.task);

  let transcript: string;
  if (values["dry-run"] === true) {
    const path = positionals[0];
    if (path === undefined)
      throw new Error("--dry-run needs <transcript.jsonl>");
    transcript = path;
  } else if (values.live === true) {
    transcript = await live(
      values["prompt-file"],
      values.cwd,
      values["allowed-tools"] ?? ELKDRAW_TOOLS,
    );
  } else throw new Error("pass --dry-run <transcript.jsonl> or --live");

  const metrics = readTranscript(await Bun.file(transcript).text(), {
    from: values.from,
    to: values.to,
  });
  const baselinePath =
    values.baseline ?? new URL("../baseline.json", import.meta.url).pathname;
  const baseline = parseJson(Baseline, await Bun.file(baselinePath).text());
  const ref = baseline.reference[task];
  const bar = checkBar(
    task,
    {
      toolCalls: metrics.toolCalls,
      tokens: metrics.tokens.total,
      unfixedLintErrors: count(values["unfixed-lint"]),
      missedDefects: count(values.missed),
    },
    ref,
  );
  const attempt = values.attempt === "2" ? 2 : 1;
  const row = {
    label: values.label ?? basename(transcript, ".jsonl"),
    task,
    transcript: basename(transcript),
    ...metrics,
    vsBaseline: {
      toolCalls: round(metrics.toolCalls / ref.toolCalls),
      tokens: round(metrics.tokens.total / ref.tokens),
    },
    bar: { ...bar, next: nextStep(bar.verdict, attempt) },
    // Thinking dominates output tokens and scales with effort: flag drift.
    comparable:
      metrics.model === baseline.tester.model &&
      metrics.effort === baseline.tester.effort,
  };
  return { row, markdown: markdownRow(row.label, task, metrics, row) };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function markdownRow(
  label: string,
  task: Task,
  m: TranscriptMetrics,
  r: {
    vsBaseline: { toolCalls: number; tokens: number };
    bar: { verdict: string };
    comparable: boolean;
  },
): string {
  const t = m.tokens;
  const cells = [
    label,
    task,
    m.toolCalls,
    `${String(t.total)} (${String(t.output)} + ${String(t.inputText)} + ${String(t.images)})`,
    m.images.count,
    m.wallSeconds,
    m.denials,
    r.vsBaseline.toolCalls,
    r.vsBaseline.tokens,
    r.comparable
      ? r.bar.verdict
      : `${r.bar.verdict} (model/effort differ from baseline)`,
  ];
  return `| ${cells.map(String).join(" | ")} |`;
}

/**
 * Runs one tester headless and returns its transcript path. `claude -p` result
 * JSON (cost, turns, permission_denials) is saved next to the scratch dir as
 * `<cwd>.result.json`.
 */
async function live(
  promptFile: string | undefined,
  dir: string | undefined,
  allowedTools: string[],
): Promise<string> {
  if (promptFile === undefined || dir === undefined)
    throw new Error("--live needs --prompt-file and --cwd");
  // Claude Code names the transcript dir after the resolved cwd (/tmp -> /private/tmp).
  const cwd = realpathSync(dir);
  const prompt = await Bun.file(promptFile).text();
  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      prompt,
      // Same tester as the dogfood (baseline.json `tester`).
      "--model",
      "claude-opus-5-5",
      "--effort",
      "medium",
      "--output-format",
      "json",
      // No user settings (hooks, plugins, defaultMode) and no user MCP servers:
      // the tester sees only the project skill in its cwd.
      "--setting-sources",
      "project,local",
      "--strict-mcp-config",
      // Managed settings here set allowManagedPermissionRulesOnly, which
      // drops --allowedTools; gate.ts enforces the allowlist as a hook.
      "--permission-mode",
      "default",
      "--settings",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "*",
              hooks: [{ type: "command", command: `bun ${GATE}` }],
            },
          ],
        },
      }),
    ],
    {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "inherit",
      env: { ...process.env, ELKDRAW_EVAL_ALLOW: JSON.stringify(allowedTools) },
    },
  );
  const out = await new Response(proc.stdout).text();
  await Bun.write(`${cwd}.result.json`, out);
  const code = await proc.exited;
  const { session_id } = parseJson(z.object({ session_id: z.string() }), out);
  if (code !== 0) console.error(`tester exited ${String(code)}`);
  return `${projectDir(cwd)}/${session_id}.jsonl`;
}

if (import.meta.main) {
  const { row, markdown } = await run(process.argv.slice(2));
  console.log(JSON.stringify(row));
  console.log(markdown);
}
