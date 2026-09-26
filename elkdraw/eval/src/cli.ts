#!/usr/bin/env bun
// elkdraw-eval: one JSON line + one markdown row per run.
//
//   elkdraw-eval --dry-run <transcript.jsonl> --task ride-hailing|bst
//                [--from ISO] [--to ISO] [--label L]
//                [--unfixed-lint N] [--missed N] [--attempt 1|2]
//   elkdraw-eval --live --task T --prompt-file P --cwd DIR   (Phase 1+)
//
// --dry-run reads a recorded transcript. --live runs one Opus tester with
// `claude -p` in DIR, then reads the transcript that run wrote.
import { homedir } from "node:os";
import { basename } from "node:path";
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
  "| run | task | calls | tokens (out + text + img) | images | wall s | calls ÷ base | tokens ÷ base | bar |\n|---|---|---|---|---|---|---|---|---|";

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
    transcript = await live(values["prompt-file"], values.cwd);
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
    r.vsBaseline.toolCalls,
    r.vsBaseline.tokens,
    r.comparable
      ? r.bar.verdict
      : `${r.bar.verdict} (model/effort differ from baseline)`,
  ];
  return `| ${cells.map(String).join(" | ")} |`;
}

/** Runs one tester headless and returns its transcript path. Not exercised in Phase 0. */
async function live(promptFile?: string, cwd?: string): Promise<string> {
  if (promptFile === undefined || cwd === undefined)
    throw new Error("--live needs --prompt-file and --cwd");
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
      "--permission-mode",
      "bypassPermissions",
    ],
    { cwd, stdout: "pipe", stderr: "inherit" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error("tester run failed");
  const { session_id } = parseJson(z.object({ session_id: z.string() }), out);
  return `${projectDir(cwd)}/${session_id}.jsonl`;
}

if (import.meta.main) {
  const { row, markdown } = await run(process.argv.slice(2));
  console.log(JSON.stringify(row));
  console.log(markdown);
}
