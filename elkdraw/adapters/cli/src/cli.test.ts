import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tools } from "@elkdraw/mcp";

const MAIN = fileURLToPath(new URL("main.ts", import.meta.url));

async function cli(...args: string[]) {
  return cliEnv({}, ...args);
}

async function cliEnv(env: Record<string, string>, ...args: string[]) {
  const proc = Bun.spawn([process.execPath, MAIN, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ELKDRAW_URL: "", PORT: "", ...env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

const calls: { method: string; path: string; body: string }[] = [];
const status = {
  port: 1,
  url: "http://x",
  branch: "b",
  session: "s",
  rev: 3,
  clients: 0,
};
const fake = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    calls.push({ method: req.method, path, body: await req.text() });
    if (path === "/api/status") return Response.json(status);
    if (path === "/api/shutdown") return Response.json({ ok: true });
    if (path === "/api/tools/lint") return Response.json({ rev: 3, hits: [] });
    return Response.json(
      { error: { code: "NOT_IMPLEMENTED", message: "no", tool: "x" } },
      { status: 501 },
    );
  },
});
const url = fake.url.href;
afterAll(() => fake.stop(true));

test("--help lists every command", async () => {
  const { stdout, code } = await cli("--help");
  expect(code).toBe(0);
  for (const name of ["start", "stop", "status", ...tools.map((t) => t.name)]) {
    expect(stdout).toMatch(new RegExp(`^  ${name}\\b`, "m"));
  }
});

test("a tool command posts its validated input", async () => {
  const { stdout, code } = await cli(
    "--url",
    url,
    "lint",
    "--ids",
    "a,b",
    "--scope",
    "viewport",
  );
  expect(code).toBe(0);
  expect(stdout.trim()).toBe(JSON.stringify({ rev: 3, hits: [] }));
  expect(calls.at(-1)).toEqual({
    method: "POST",
    path: "/api/tools/lint",
    body: JSON.stringify({ scope: "viewport", ids: ["a", "b"] }),
  });
});

test("numbers, booleans, JSON and --input", async () => {
  await cli("--url", url, "look", "--target", "n1", "--r", "40", "--marks");
  expect(calls.at(-1)?.body).toBe(
    JSON.stringify({ target: "n1", r: 40, marks: true }),
  );
  await cli(
    "--url",
    url,
    "query",
    "--bbox",
    '{"x":0,"y":0,"width":5,"height":5}',
  );
  expect(calls.at(-1)?.body).toBe(
    JSON.stringify({ bbox: { x: 0, y: 0, width: 5, height: 5 } }),
  );
  await cli(
    "--url",
    url,
    "wait",
    "--input",
    '{"for":"review"}',
    "--since",
    "2",
  );
  expect(calls.at(-1)?.body).toBe(JSON.stringify({ for: "review", since: 2 }));
});

test("invalid input exits 2 without a request", async () => {
  const before = calls.length;
  const { code, stderr } = await cli("--url", url, "look");
  expect(code).toBe(2);
  expect(stderr).toContain("target");
  expect(calls.length).toBe(before);
});

test("server errors exit 1 with the body on stderr", async () => {
  const { code, stderr } = await cli("--url", url, "describe");
  expect(code).toBe(1);
  expect(stderr).toContain("NOT_IMPLEMENTED");
});

test("status, stop and start against a running server", async () => {
  const s = await cli("--url", url, "status");
  expect(s.stdout.trim()).toBe(JSON.stringify(status));
  const stop = await cli("--url", url, "stop");
  expect(stop.code).toBe(0);
  expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/api/shutdown" });
  const start = await cli("--url", url, "start");
  expect(start.stdout.trim()).toBe(JSON.stringify(status));
});

test("unreachable server exits 3", async () => {
  const dead = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const deadUrl = dead.url.href;
  await dead.stop(true);
  expect((await cli("--url", deadUrl, "status")).code).toBe(3);
  expect((await cli("--url", deadUrl, "lint")).code).toBe(3);
});

test("start spawns the real server; status, a 501 stub, stop", async () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = String(probe.port);
  await probe.stop(true);
  const dataDir = mkdtempSync(join(tmpdir(), "elkdraw-cli-"));
  const env = { ELKDRAW_DATA_DIR: dataDir, PORT: port };
  const url = `http://127.0.0.1:${port}`;
  try {
    const started = await cliEnv(env, "start", "--no-open");
    expect(started.code).toBe(0);
    expect(started.stdout).toContain(`"port":${port}`);
    const s = await cliEnv(env, "status");
    expect(s.code).toBe(0);
    expect(s.stdout).toContain(`"url":"${url}"`);
    const stub = await cliEnv(env, "lint");
    expect(stub.code).toBe(1);
    expect(stub.stderr).toContain("NOT_IMPLEMENTED");
  } finally {
    expect((await cliEnv(env, "stop")).code).toBe(0);
    rmSync(dataDir, { recursive: true, force: true });
  }
  for (let i = 0; i < 50; i++) {
    if ((await cliEnv(env, "status")).code === 3) return;
    await Bun.sleep(100);
  }
  throw new Error("server still up after stop");
});
