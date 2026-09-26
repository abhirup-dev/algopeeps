// MCP over stdio: `bun elkdraw/adapters/mcp/src/stdio.ts`. Stdout is the
// protocol channel, so nothing else may write to it.
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./index.ts";

// TODO(phase 1): proxy tool calls to the running server instead of stubs.
await createMcpServer().connect(new StdioServerTransport());
