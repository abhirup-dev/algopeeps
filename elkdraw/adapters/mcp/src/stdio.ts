// MCP over stdio: `bun elkdraw/adapters/mcp/src/stdio.ts`. Tool calls are
// forwarded to the running server ($ELKDRAW_URL, else 127.0.0.1:$PORT, else
// :3940). Stdout is the protocol channel, so nothing else may write to it.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { baseUrl, createMcpServer, restHandlers } from "./index.ts";

await createMcpServer(restHandlers(baseUrl(process.env))).connect(
  new StdioServerTransport(),
);
