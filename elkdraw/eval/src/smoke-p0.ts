// Phase 0 exit smoke (P0.14). Run with `bun run --cwd elkdraw smoke:p0`.
// Creates a second worktree on a scratch branch, runs `check` in both, starts
// `dev` in both through portless, then per URL: the MCP client lists tools and
// calls `status` (names the branch), `export --format mmd` (NOT_IMPLEMENTED)
// and `lint` (real since 1.10), the CLI
// `status` names the branch, and Chromium screenshots the canvas with its
// branch pill. Servers, browser, worktree and branch go away on every exit.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { parseJson } from "@elkdraw/core";
import { type Browser, chromium } from "playwright";
import { z } from "zod";

const SCRATCH = "elkdraw/smoke-p0-b";
const Status = z.object({ branch: z.string(), url: z.string() });
const elkdrawA = resolve(import.meta.dir, "../..");
const shots = join(elkdrawA, "eval", "test-results");
const cleanup: (() => Promise<unknown>)[] = [];
let stopping = false; // set by teardown, so main starts nothing new after a signal

const log = (msg: string) => {
  console.log(`smoke: ${msg}`);
};

function fail(msg: string): never {
  throw new Error(msg);
}

/** Run a command to completion; throw with its output unless it exits 0. */
function run(cmd: string[], cwd: string, env?: Record<string, string>) {
  const res = Bun.spawnSync(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = `${res.stdout.toString()}${res.stderr.toString()}`;
  if (res.exitCode !== 0)
    fail(`${cmd.join(" ")} (in ${cwd}) exited ${String(res.exitCode)}\n${out}`);
  return out.trim();
}

function worktreeOf(branch: string, repo: string): string {
  const porcelain = run(["git", "worktree", "list", "--porcelain"], repo);
  for (const block of porcelain.split("\n\n")) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (path && block.includes(`branch refs/heads/${branch}\n`)) return path;
    if (path && block.endsWith(`branch refs/heads/${branch}`)) return path;
  }
  return fail(`no worktree for ${branch}`);
}

/** `dev --no-open` in an elkdraw dir; resolves with the URL the server prints. */
async function startDev(elkdraw: string) {
  if (stopping) fail("interrupted");
  const proc = Bun.spawn(["sh", "scripts/dev.sh", "--no-open"], {
    cwd: elkdraw,
    stdout: "pipe",
    stderr: "inherit",
  });
  cleanup.push(async () => {
    proc.kill("SIGTERM");
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, 5_000);
    await proc.exited;
    clearTimeout(timer);
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + 60_000;
  let url: string | undefined;
  while (!url) {
    if (Date.now() > deadline) fail(`no URL from dev in ${elkdraw}:\n${seen}`);
    const { value, done } = await reader.read();
    if (done) fail(`dev in ${elkdraw} exited before printing a URL:\n${seen}`);
    seen += decoder.decode(value);
    url = /elkdraw: (https:\/\/\S+)/.exec(seen)?.[1];
  }
  // Keep draining stdout so the pipe never blocks the server.
  void (async () => {
    for (;;) if ((await reader.read()).done) return;
  })();
  if (url.startsWith("http://"))
    fail("dev served plain http: portless did not route it");
  return url;
}

async function smokeUrl(url: string, branch: string, browser: Browser) {
  const res = await fetch(`${url}/api/status`);
  const status = parseJson(Status, await res.text());
  if (status.branch !== branch)
    fail(`${url}/api/status branch ${status.branch}, want ${branch}`);

  const client = new Client({ name: "smoke-p0", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`)),
  );
  try {
    const { tools } = await client.listTools();
    if (tools.length === 0) fail(`${url}/mcp listed no tools`);
    const viaMcp = await client.callTool({ name: "status", arguments: {} });
    const mcpStatus = Status.parse(viaMcp.structuredContent);
    if (mcpStatus.branch !== branch)
      fail(`MCP status branch ${mcpStatus.branch}, want ${branch}`);
    const stub = await client.callTool({
      name: "export",
      arguments: { format: "mmd" },
    });
    if (
      stub.isError !== true ||
      !JSON.stringify(stub.content).includes("NOT_IMPLEMENTED")
    )
      fail(
        `MCP export mmd did not reply NOT_IMPLEMENTED: ${JSON.stringify(stub)}`,
      );
    const lint = await client.callTool({ name: "lint", arguments: {} });
    if (
      lint.isError === true ||
      !z
        .object({ hits: z.array(z.unknown()) })
        .safeParse(lint.structuredContent).success
    )
      fail(`MCP lint did not reply hits: ${JSON.stringify(lint)}`);
    log(
      `${url}: MCP ${String(tools.length)} tools, status.branch=${branch}, export mmd NOT_IMPLEMENTED, lint ok`,
    );
  } finally {
    await client.close();
  }

  const cli = run(
    ["bun", "adapters/cli/src/main.ts", "--url", url, "status"],
    elkdrawA,
  );
  const cliStatus = parseJson(Status, cli);
  if (cliStatus.branch !== branch)
    fail(`CLI status branch ${cliStatus.branch}, want ${branch}`);
  log(`${url}: CLI status.branch=${branch}`);

  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 },
    ignoreHTTPSErrors: true, // portless's CA is not in Playwright's Chromium
  });
  try {
    await page.goto(url);
    await page
      .locator(".elkdraw-pill", { hasText: `${branch} · open` })
      .waitFor({ timeout: 30_000 });
    const path = join(shots, `smoke-p0-${branch.replaceAll("/", "-")}.png`);
    await page.screenshot({ path });
    log(`${url}: pill "${branch} · open", screenshot ${path}`);
    return path;
  } finally {
    await page.close();
  }
}

async function main() {
  if (!Bun.which("portless"))
    fail("portless is not on PATH; install it (npm i -g portless) and retry");
  if (!Bun.which("wt")) fail("wt (worktrunk) is not on PATH");
  if (!process.env["NODE_EXTRA_CA_CERTS"])
    fail("NODE_EXTRA_CA_CERTS is unset; run via scripts/smoke-p0.sh");

  const branchA = run(["git", "branch", "--show-current"], elkdrawA);
  if (!branchA) fail("detached HEAD: run from a branch");
  if (branchA === SCRATCH) fail(`run from a branch other than ${SCRATCH}`);

  log(`creating ${SCRATCH} from ${branchA}`);
  run(
    [
      "wt",
      "switch",
      "--create",
      SCRATCH,
      "--base",
      branchA,
      "--no-cd",
      "--no-hooks",
      "-y",
    ],
    elkdrawA,
  );
  cleanup.push(() => {
    run(
      ["wt", "remove", SCRATCH, "-D", "-f", "--foreground", "--no-hooks", "-y"],
      elkdrawA,
    );
    return Promise.resolve();
  });
  const elkdrawB = join(worktreeOf(SCRATCH, elkdrawA), "elkdraw");
  run(["bun", "install", "--frozen-lockfile"], elkdrawB);

  // Sequential: two full checks at once would fight for the CPU.
  for (const dir of [elkdrawA, elkdrawB]) {
    const t = Date.now();
    run(["bun", "run", "check"], dir, { CI: "true" });
    log(
      `check green in ${dir} (${String(Math.round((Date.now() - t) / 1000))} s)`,
    );
  }

  const urlA = await startDev(elkdrawA);
  const urlB = await startDev(elkdrawB);
  if (urlA === urlB) fail(`both worktrees got ${urlA}`);

  mkdirSync(shots, { recursive: true });
  if (stopping) fail("interrupted");
  const browser = await chromium.launch({ headless: true });
  cleanup.push(() => browser.close());
  const shotA = await smokeUrl(urlA, branchA, browser);
  const shotB = await smokeUrl(urlB, SCRATCH, browser);
  log(
    `PASS\n  ${branchA}: ${urlA}\n    ${shotA}\n  ${SCRATCH}: ${urlB}\n    ${shotB}`,
  );
}

/** Undo every step, newest first; each runs once even if called twice. */
async function teardown(code: number): Promise<never> {
  stopping = true;
  for (let step = cleanup.pop(); step; step = cleanup.pop()) {
    try {
      await step();
    } catch (error) {
      console.error(`smoke: cleanup failed: ${String(error)}`);
      code = 1;
    }
  }
  process.exit(code);
}

// Ctrl-C or a kill still removes the servers, browser and scratch worktree.
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    console.error(`smoke: ${signal}, cleaning up`);
    void teardown(130);
  });

try {
  await main();
  await teardown(0);
} catch (error) {
  console.error(
    `smoke: FAIL ${error instanceof Error ? error.message : String(error)}`,
  );
  await teardown(1);
}
