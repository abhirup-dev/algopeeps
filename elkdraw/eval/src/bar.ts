// The go/no-go bar, canvas/docs/agent-layer-design.md §17.4.
export const TASKS = ["ride-hailing", "bst"] as const;
export type Task = (typeof TASKS)[number];

export interface Measures {
  toolCalls: number;
  /** Input + output, images at vision rates (transcript.ts). */
  tokens: number;
  /** null = not measured yet (no lint engine, no by-eye review). */
  unfixedLintErrors: number | null;
  /** Defects seen by eye on the final PNG that lint did not flag. */
  missedDefects: number | null;
}

/** The dogfood's numbers for the same task (baseline.json `reference`). */
export interface Reference {
  toolCalls: number;
  tokens: number;
}

export interface Check {
  measure: keyof Measures;
  value: number | null;
  limit: number;
  pass: boolean | null;
}

export type Verdict = "go" | "no-go" | "incomplete";

export function checkBar(
  task: Task,
  m: Measures,
  ref: Reference,
): { verdict: Verdict; checks: Check[] } {
  const check = (
    measure: keyof Measures,
    limit: number,
    pass: (v: number) => boolean,
  ): Check => {
    const value = m[measure];
    return { measure, value, limit, pass: value === null ? null : pass(value) };
  };
  const checks = [
    // Integer-safe forms of ≤ ⅓ and ≤ ⅕.
    check("toolCalls", ref.toolCalls / 3, (v) => v * 3 <= ref.toolCalls),
    check("tokens", ref.tokens / 5, (v) => v * 5 <= ref.tokens),
    check("unfixedLintErrors", 0, (v) => v === 0),
    check("missedDefects", task === "bst" ? 1 : 0, (v) =>
      task === "bst" ? v <= 1 : v === 0,
    ),
  ];
  const verdict = checks.some((c) => c.pass === false)
    ? "no-go"
    : checks.some((c) => c.pass === null)
      ? "incomplete"
      : "go";
  return { verdict, checks };
}

/**
 * §17.4's rule: go proceeds; the first no-go buys one fix cycle scoped to the
 * failing measure and a re-run; a second no-go stops the layer.
 */
export function nextStep(
  verdict: Verdict,
  attempt: 1 | 2,
): "proceed" | "fix-cycle" | "stop" | "measure-the-rest" {
  switch (verdict) {
    case "go":
      return "proceed";
    case "incomplete":
      return "measure-the-rest";
    case "no-go":
      return attempt === 1 ? "fix-cycle" : "stop";
  }
}
