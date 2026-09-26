// End-to-end: built bundle + a tiny Bun WS server + headless Chromium.
// Run with `bun run --cwd elkdraw/app test:e2e` (builds first).
import { afterAll, beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import { parseJson } from "@elkdraw/core";
import { type Browser, type Page, chromium } from "playwright";
import { type ClientMessage, Delta, type ServerMessage } from "./protocol.ts";

const appDir = join(import.meta.dir, "..");
const dist = join(appDir, "dist");
const shot = join(appDir, "test-results", "canvas-delta.png");

const received: ClientMessage[] = [];
let server: ReturnType<typeof serve>;
let browser: Browser;
let page: Page;

function serve() {
  return Bun.serve({
    port: 0, // random free port
    hostname: "127.0.0.1",
    async fetch(req, srv) {
      const { pathname } = new URL(req.url);
      if (pathname === "/ws") {
        return srv.upgrade(req)
          ? undefined
          : new Response("no", { status: 400 });
      }
      const file = Bun.file(
        join(dist, pathname === "/" ? "index.html" : pathname),
      );
      return (await file.exists())
        ? new Response(file)
        : new Response("", { status: 404 });
    },
    websocket: {
      open(ws) {
        const hello: ServerMessage = {
          type: "hello",
          session: "s1",
          branch: "e2e-branch",
        };
        const snapshot: ServerMessage = {
          type: "snapshot",
          rev: 0,
          elements: [],
        };
        ws.subscribe("scene");
        ws.send(JSON.stringify(hello));
        ws.send(JSON.stringify(snapshot));
      },
      message(ws, data) {
        const msg = parseJson(Delta, String(data));
        received.push(msg);
        const ack: ServerMessage = { type: "ack", rev: msg.rev + 1 };
        ws.send(JSON.stringify(ack));
      },
    },
  });
}

beforeAll(async () => {
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: appDir,
    // bun test sets NODE_ENV=test, which would make Vite emit a dev React build.
    env: { ...process.env, NODE_ENV: "production" },
  });
  expect(build.exitCode).toBe(0);
  server = serve();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`http://127.0.0.1:${String(server.port)}/`);
  await page
    .locator(".elkdraw-pill", { hasText: "e2e-branch · open" })
    .waitFor();
}, 60_000);

afterAll(async () => {
  await browser.close();
  await server.stop(true);
});

const AGENT_ID = "agent-rect";

test("an agent delta renders on the canvas", async () => {
  const delta: ServerMessage = {
    type: "delta",
    rev: 1,
    author: "agent",
    deletes: [],
    upserts: [
      {
        id: AGENT_ID,
        type: "rectangle",
        version: 1,
        x: 200,
        y: 200,
        width: 240,
        height: 140,
        strokeColor: "#1e1e1e",
        backgroundColor: "#ff0000",
        fillStyle: "solid",
      },
    ],
  };
  server.publish("scene", JSON.stringify(delta));

  // Count pure-red pixels on Excalidraw's static canvas.
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "canvas.excalidraw__canvas.static",
    );
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (
        (data[i] ?? 0) > 200 &&
        (data[i + 1] ?? 255) < 60 &&
        (data[i + 2] ?? 255) < 60
      )
        red++;
    }
    return red > 5000;
  });
  await page.screenshot({ path: shot });
});

test("a human edit sends a delta back, without echoing the agent's element", async () => {
  await page.getByTitle(/^Rectangle/).click();
  await page.mouse.move(600, 500);
  await page.mouse.down();
  await page.mouse.move(760, 620, { steps: 5 });
  await page.mouse.up();

  const sentRects = () =>
    received.flatMap((m) => m.upserts).filter((el) => el.type === "rectangle");
  for (let i = 0; i < 50 && !sentRects().length; i++) await Bun.sleep(100);
  expect(sentRects()).toHaveLength(1);
  const [msg] = received;
  expect(msg?.author).toBe("human");
  expect(msg?.rev).toBe(1);
  expect(
    received.flatMap((m) => m.upserts).some((el) => el.id === AGENT_ID),
  ).toBe(false);
}, 15_000);
