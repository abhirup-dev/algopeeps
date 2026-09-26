// Headless browser sidecar: the built app in Chromium (`?headless=1`, see
// app/src/headless.ts), for rendered boxes, text sizes and PNG crops. Inputs
// are validated before the page, outputs after it.
import { Box, Element, Id, MeasureRequest, Size } from "@elkdraw/core";
import { join, normalize } from "node:path";
import { type Browser, type Page, chromium } from "playwright";
import { z } from "zod";

const Boxes = z.record(Id, Box);
const Sizes = z.array(Size);
const PngDataUrl = z.string().startsWith("data:image/png;base64,");

/** The page's `window.elkdraw` (app/src/headless.ts HeadlessApi), untyped. */
interface Headless {
  measure(elements: unknown): Promise<unknown>;
  measureText(requests: unknown): Promise<unknown>;
  snap(bbox: unknown, scale: unknown, ids: unknown): Promise<unknown>;
}
type WithHeadless = Window & { elkdraw: Headless };

/** The sidecar renders with Excalidraw: the backend part of the cache key. */
const BACKEND = "excalidraw";

/** Default bundle: `bun run --cwd elkdraw/app build`. */
export const APP_DIST = join(import.meta.dir, "..", "..", "app", "dist");

interface Running {
  server: ReturnType<typeof Bun.serve>;
  browser: Browser;
  page: Page;
}

export class Sidecar {
  #starting: Promise<Running> | undefined;
  // ponytail: unbounded; add LRU if a long-lived process measures unbounded text.
  readonly #sizes = new Map<string, Size>();

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
      await page.goto(`http://127.0.0.1:${String(server.port)}/?headless=1`);
      await page.waitForFunction(() => "elkdraw" in window);
      return { server, browser, page };
    } catch (error) {
      await browser.close();
      await server.stop(true);
      throw error;
    }
  }

  /** The Playwright page (after start()), for tests and callers that drive it. */
  async page(): Promise<Page> {
    if (!this.#starting) throw new Error("sidecar: call start() first");
    return (await this.#starting).page;
  }

  /** Loads `elements` (Excalidraw elements) as the page scene, which later
   * snaps draw, and returns where each non-deleted one drew: the bounding box
   * of its pixels, alone, in scene units to the half pixel. */
  async measure(elements: readonly Element[]): Promise<Record<string, Box>> {
    const input = z.array(Element).parse(elements);
    const page = await this.page();
    const raw: unknown = await page.evaluate(
      (els) => (window as unknown as WithHeadless).elkdraw.measure(els),
      input,
    );
    return Boxes.parse(raw);
  }

  /** Text sizes in Excalidraw's wrap and font metrics, one per request, in
   * order. Cached by (backend, font, size, text, wrap width): a call whose
   * requests are all cached never touches the browser. */
  async measureText(requests: readonly MeasureRequest[]): Promise<Size[]> {
    const input = z.array(MeasureRequest).parse(requests);
    const key = (r: MeasureRequest) =>
      JSON.stringify([BACKEND, r.fontFamily, r.fontSize, r.text, r.wrapWidth]);
    const misses = [
      ...new Map(
        input.filter((r) => !this.#sizes.has(key(r))).map((r) => [key(r), r]),
      ).values(),
    ];
    if (misses.length) {
      const page = await this.page();
      const raw: unknown = await page.evaluate(
        (reqs) => (window as unknown as WithHeadless).elkdraw.measureText(reqs),
        misses,
      );
      const sizes = Sizes.length(misses.length).parse(raw);
      misses.forEach((r, i) => {
        const size = sizes[i];
        if (size) this.#sizes.set(key(r), size);
      });
    }
    return input.map((r) => {
      const size = this.#sizes.get(key(r));
      if (!size) throw new Error("sidecar: size missing after measure");
      return size;
    });
  }

  /** PNG of `bbox` (scene units) of the scene the last `measure` loaded, at
   * `scale` px per unit, on white. `ids` draws only those elements (and their
   * bound text). */
  async snap(
    bbox: Box,
    scale = 1,
    ids?: readonly string[],
  ): Promise<Uint8Array> {
    const input = {
      bbox: Box.parse(bbox),
      scale: z.number().positive().parse(scale),
      ids: z.array(Id).optional().parse(ids),
    };
    const page = await this.page();
    const raw: unknown = await page.evaluate(
      (a) =>
        (window as unknown as WithHeadless).elkdraw.snap(
          a.bbox,
          a.scale,
          a.ids,
        ),
      input,
    );
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
