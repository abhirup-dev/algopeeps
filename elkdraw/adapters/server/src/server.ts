// One Bun process: static app, /ws scene sync, REST under /api, MCP at /mcp.
import { resolve, sep } from "node:path";
import {
  ClientMessage,
  type Element,
  type FeedLine,
  type ServerMessage,
  parseJson,
  safeParseJson,
} from "@elkdraw/core";
import {
  type McpServer,
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { placeholderTools } from "./placeholder.ts";
import { type Applied, Store } from "./store.ts";

export interface Status {
  port: number;
  url: string;
  branch: string;
  session: string;
  rev: number;
  clients: number;
}

/** What the tool layer (P0.3 `@elkdraw/mcp`) gets from the server. */
export interface ToolContext {
  status(): Status;
  scene(): { rev: number; elements: Element[] };
  /** Store a delta and broadcast it to every browser client. */
  apply(
    author: FeedLine["author"],
    upserts: readonly Element[],
    deletes: readonly string[],
  ): number;
}

/** The injection seam: one MCP server per /mcp request, plus the same tools
 * by name for POST /api/tools/:name. */
export interface Tools {
  createMcpServer(): McpServer;
  dispatch(name: string, input: unknown): Promise<unknown>;
}

export interface ServerOptions {
  /** 0 = any free port. */
  port: number;
  host?: string;
  session: string;
  /** Open the canvas in the default browser once listening. */
  open: boolean;
  /** Built app (app/dist). */
  appDir: string;
  /** Session data lives in <dataDir>/<session>/. Default: ELKDRAW_DATA_DIR,
   * else ${XDG_DATA_HOME:-~/.local/share}/elkdraw. */
  dataDir?: string;
  /** Default: placeholderTools (one `status` tool). */
  tools?: (ctx: ToolContext) => Tools;
}

export interface RunningServer {
  url: string;
  stop: () => Promise<void>;
}

const SESSION = /^[\w.-]+$/;
const TOPIC = "scene";

export function defaultDataDir(env = process.env): string {
  if (env["ELKDRAW_DATA_DIR"]) return env["ELKDRAW_DATA_DIR"];
  const base =
    env["XDG_DATA_HOME"] ?? resolve(env["HOME"] ?? "~", ".local", "share");
  return resolve(base, "elkdraw");
}

function gitBranch(): string {
  if (process.env["ELKDRAW_BRANCH"]) return process.env["ELKDRAW_BRANCH"];
  const git = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  return git.exitCode === 0 ? git.stdout.toString().trim() : "unknown";
}

/** Publish an applied delta. ws.publish skips the sender; server.publish reaches all. */
function broadcast(
  to: { publish(topic: string, data: string): unknown },
  applied: Applied,
  author: FeedLine["author"],
) {
  if (applied.upserts.length === 0 && applied.deletes.length === 0) return;
  const { rev, upserts, deletes } = applied;
  const msg: ServerMessage = { type: "delta", rev, upserts, deletes, author };
  to.publish(TOPIC, JSON.stringify(msg));
}

const send = (ws: { send(text: string): unknown }, msg: ServerMessage) =>
  ws.send(JSON.stringify(msg));

export function startServer(options: ServerOptions): RunningServer {
  const { port, host = "127.0.0.1", session, appDir } = options;
  if (!SESSION.test(session))
    throw new Error(`bad session name ${JSON.stringify(session)}`);
  const store = new Store(
    resolve(options.dataDir ?? defaultDataDir(), session),
  );
  const branch = gitBranch();
  const root = resolve(appDir);
  const mcp = createMcpHandler(() => tools.createMcpServer());
  const extraHost = process.env["PORTLESS_URL"]
    ? [new URL(process.env["PORTLESS_URL"]).hostname]
    : [];
  const hosts = [...localhostAllowedHostnames(), host, ...extraHost];
  const origins = [...localhostAllowedOrigins(), host, ...extraHost];

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req, srv) {
      const rejected =
        hostHeaderValidationResponse(req, hosts) ??
        originValidationResponse(req, origins);
      if (rejected) return rejected;
      const { pathname } = new URL(req.url);
      if (pathname === "/ws")
        return srv.upgrade(req)
          ? undefined
          : new Response("expected a WebSocket upgrade", { status: 400 });
      if (pathname === "/mcp") return mcp.fetch(req);
      if (pathname.startsWith("/api/")) return api(req, pathname);
      return file(pathname);
    },
    websocket: {
      open(ws) {
        ws.subscribe(TOPIC);
        send(ws, { type: "hello", session, branch });
        send(ws, { type: "snapshot", rev: store.rev, elements: store.scene() });
      },
      message(ws, data) {
        const msg = safeParseJson(ClientMessage, String(data));
        if (!msg.ok) {
          ws.close(1007, "bad message");
          return;
        }
        // ponytail: the client's base rev is ignored; last writer wins per element version.
        const applied = store.apply(
          "human",
          msg.value.upserts,
          msg.value.deletes,
        );
        broadcast(ws, applied, "human");
        send(ws, { type: "ack", rev: applied.rev });
      },
    },
  });

  const serverPort = server.port ?? port;
  const url =
    process.env["PORTLESS_URL"] ?? `http://${host}:${String(serverPort)}`;
  const status = (): Status => ({
    port: serverPort,
    url,
    branch,
    session,
    rev: store.rev,
    clients: server.subscriberCount(TOPIC),
  });
  const ctx: ToolContext = {
    status,
    scene: () => ({ rev: store.rev, elements: store.scene() }),
    apply(author, upserts, deletes) {
      const applied = store.apply(author, upserts, deletes);
      broadcast(server, applied, author);
      return applied.rev;
    },
  };
  const tools = (options.tools ?? placeholderTools)(ctx);

  const stop = async () => {
    await mcp.close();
    await server.stop(true);
  };

  async function api(req: Request, pathname: string): Promise<Response> {
    if (pathname === "/api/status" && req.method === "GET")
      return Response.json(status());
    if (pathname === "/api/shutdown" && req.method === "POST") {
      setTimeout(() => void stop(), 0);
      return Response.json({ ok: true });
    }
    const tool = /^\/api\/tools\/([\w.-]+)$/.exec(pathname)?.[1];
    if (tool && req.method === "POST") {
      try {
        const text = await req.text();
        const input = text ? parseJson(z.unknown(), text) : {};
        return Response.json(await tools.dispatch(tool, input));
      } catch (error) {
        // ponytail: every failure is a 400; split out 404/500 once SURFACE.md names them.
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ error: message }, { status: 400 });
      }
    }
    return Response.json({ error: "not found" }, { status: 404 });
  }

  async function file(pathname: string): Promise<Response> {
    const path = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    const inside = path.startsWith(root + sep);
    const f = Bun.file(path);
    if (inside && (await f.exists())) return new Response(f);
    if (pathname === "/")
      return new Response(
        `app not built (no ${root}/index.html): bun run --cwd elkdraw/app build\n`,
        { status: 404 },
      );
    return new Response("not found", { status: 404 });
  }

  if (options.open) openBrowser(url);
  return { url, stop };
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  Bun.spawn([cmd, url], { stdio: ["ignore", "ignore", "ignore"] }).unref();
}
