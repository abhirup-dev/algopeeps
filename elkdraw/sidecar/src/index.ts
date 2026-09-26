// Headless browser sidecar: the built app in Chromium, for measuring rendered
// elements and snapping PNGs. P0.7 skeleton: measure and snap are stubs that
// return fixed shapes, but they round-trip through page.evaluate so the
// plumbing (serve, launch, evaluate, validate) is real. Real bodies: 1.3.
import { Box, Id } from "@elkdraw/core";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright";
import { z } from "zod";

export const Element = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().optional(),
});
export type Element = z.infer<typeof Element>;

const Boxes = z.record(Id, Box);
const PngDataUrl = z.string().startsWith("data:image/png;base64,");

/** Default bundle: `bun run --cwd elkdraw/app build`. */
export const APP_DIST = join(import.meta.dir, "..", "..", "app", "dist");

interface Running {
  server: ReturnType<typeof Bun.serve>;
  browser: Browser;
  page: Page;
}

export class Sidecar {
  #starting: Promise<Running> | undefined;

  constructor(private readonly dist = APP_DIST) {}

  /** Serve the bundle, launch Chromium, load the app. Idempotent: later calls
   * share the first one's result. */
  async start(): Promise<void> {
    this.#starting ??= this.#launch();
    await this.#starting;
  }

  async #launch(): Promise<Running> {
    const index = Bun.file(join(this.dist, "index.html"));
    if (!(await index.exists())) {
      throw new Error(
        `sidecar: no app bundle at ${this.dist}; run \`bun run --cwd elkdraw/app build\``,
      );
    }
    const server = serveStatic(this.dist);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 800 },
      });
      // No /ws here: the app's sync client retries every second in the
      // background, which is harmless for measuring.
      await page.goto(`http://127.0.0.1:${String(server.port)}/`);
      await page.locator(".excalidraw").waitFor();
      return { server, browser, page };
    } catch (error) {
      await browser.close();
      await server.stop(true);
      throw error;
    }
  }

  async #page(): Promise<Page> {
    if (!this.#starting) throw new Error("sidecar: call start() first");
    return (await this.#starting).page;
  }

  /** Rendered boxes of elements, by id. STUB: 100x40 at the origin for each. */
  async measure(elements: readonly Element[]): Promise<Record<string, Box>> {
    const input = z.array(Element).parse(elements);
    const page = await this.#page();
    const raw: unknown = await page.evaluate(
      (els) =>
        Object.fromEntries(
          els.map((el) => [el.id, { x: 0, y: 0, width: 100, height: 40 }]),
        ),
      input,
    );
    return Boxes.parse(raw);
  }

  /** PNG of a scene region. STUB: a 1x1 PNG, whatever the bbox and scale. */
  async snap(bbox: Box, scale = 1): Promise<Uint8Array> {
    const input = {
      bbox: Box.parse(bbox),
      scale: z.number().positive().parse(scale),
    };
    const page = await this.#page();
    const raw: unknown = await page.evaluate((_args) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL("image/png");
    }, input);
    const url = PngDataUrl.parse(raw);
    return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  }

  async close(): Promise<void> {
    const starting = this.#starting;
    this.#starting = undefined;
    if (!starting) return;
    const { browser, server } = await starting;
    await browser.close();
    await server.stop(true);
  }
}

function serveStatic(dist: string) {
  return Bun.serve({
    port: 0, // random free port
    hostname: "127.0.0.1",
    async fetch(req) {
      const { pathname } = new URL(req.url);
      const path = normalize(
        join(
          dist,
          pathname === "/" ? "index.html" : decodeURIComponent(pathname),
        ),
      );
      if (!path.startsWith(dist)) return new Response("", { status: 403 });
      const file = Bun.file(path);
      return (await file.exists())
        ? new Response(file)
        : new Response("", { status: 404 });
    },
  });
}
