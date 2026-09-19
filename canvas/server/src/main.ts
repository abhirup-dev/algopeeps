// Stateless Streamable HTTP transport per request (per the ext-apps
// basic-server pattern), one process-global Store shared across requests.
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { McpServer } from "@modelcontextprotocol/server";
import cors from "cors";
import type { Express, Request, Response } from "express";
import { Store } from "./store.js";
import { createServer } from "./server.js";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// The basic-host on :8080 must be able to connect; nobody else needs to.
const corsLocalOnly = cors({
  origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin)),
});

export function buildApp(store: Store): Express {
  const app = createMcpExpressApp({ host: "localhost" }); // DNS-rebinding protection on
  app.use(corsLocalOnly);
  app.all("/mcp", async (req: Request, res: Response) => {
    const server: McpServer = createServer(store);
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });
  return app;
}

export function startServer(
  port = Number(process.env.PORT ?? 3100),
  store = new Store(),
): Promise<{ port: number; close: () => void }> {
  const httpServer = buildApp(store).listen(port, "127.0.0.1");
  return new Promise((resolve) => {
    httpServer.on("listening", () => {
      const actual = (httpServer.address() as { port: number }).port;
      console.log(`canvas MCP server on http://127.0.0.1:${actual}/mcp`);
      resolve({
        port: actual,
        close: () => httpServer.close(),
      });
    });
  });
}

if (
  process.argv[1]?.endsWith("main.ts") ||
  process.argv[1]?.endsWith("main.js")
) {
  startServer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
