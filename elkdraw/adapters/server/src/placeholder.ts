// Stand-in tool layer until P0.3's @elkdraw/mcp lands: one `status` tool.
// TODO(P0.3): replace with the real tools from @elkdraw/mcp (see Tools in server.ts).
import { McpServer } from "@modelcontextprotocol/server";
import type { ToolContext, Tools } from "./server.ts";

export function placeholderTools(ctx: ToolContext): Tools {
  return {
    createMcpServer() {
      const server = new McpServer({ name: "elkdraw", version: "0.0.0" });
      server.registerTool(
        "status",
        {
          description:
            "Server status: port, url, branch, session, rev, clients.",
        },
        () => ({
          content: [{ type: "text", text: JSON.stringify(ctx.status()) }],
        }),
      );
      return server;
    },
    dispatch(name) {
      if (name === "status") return Promise.resolve(ctx.status());
      return Promise.reject(new Error(`unknown tool ${JSON.stringify(name)}`));
    },
  };
}
