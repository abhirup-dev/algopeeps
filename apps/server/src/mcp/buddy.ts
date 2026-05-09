import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface McpServerConfig {
  command: string;
  args?: string[];
  lifecycle?: string;
  directTools?: string[];
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
  settings?: Record<string, unknown>;
}

export interface SmokeBuddyMcpDiffInput {
  toolName?: string;
  args?: Record<string, unknown>;
}

export interface SmokeBuddyMcpDiffResult {
  server: string;
  command: string;
  args: string[];
  requestedTool: string;
  availableTools: string[];
  result?: unknown;
}

async function findProjectRoot(start = process.cwd()): Promise<string> {
  let current = resolve(start);

  for (;;) {
    try {
      await access(join(current, "config", "mcp.json"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new Error("Could not find config/mcp.json from current working directory");
      }
      current = parent;
    }
  }
}

async function readMcpConfig(): Promise<McpConfig> {
  const root = await findProjectRoot();
  return JSON.parse(await readFile(join(root, "config", "mcp.json"), "utf8")) as McpConfig;
}

export async function smokeBuddyMcpDiff(
  input: SmokeBuddyMcpDiffInput = {},
): Promise<SmokeBuddyMcpDiffResult> {
  const config = await readMcpConfig();
  const buddy = config.mcpServers.buddy;
  if (!buddy) {
    throw new Error("Missing buddy server in config/mcp.json");
  }

  const requestedTool = input.toolName ?? "buffer.diff";
  const transport = new StdioClientTransport({
    command: buddy.command,
    args: buddy.args ?? [],
    stderr: "pipe",
  });
  const client = new Client({ name: "algopeeps-smoke-buddy-mcp", version: "0.0.0" });

  try {
    await client.connect(transport, { timeout: 5_000 });
    const tools = await client.listTools(undefined, { timeout: 5_000 });
    const availableTools = tools.tools.map((tool) => tool.name);

    if (!availableTools.includes(requestedTool)) {
      return {
        server: "buddy",
        command: buddy.command,
        args: buddy.args ?? [],
        requestedTool,
        availableTools,
      };
    }

    const result = await client.callTool(
      {
        name: requestedTool,
        arguments: input.args ?? {},
      },
      undefined,
      { timeout: 10_000 },
    );

    return {
      server: "buddy",
      command: buddy.command,
      args: buddy.args ?? [],
      requestedTool,
      availableTools,
      result,
    };
  } finally {
    await transport.close().catch(() => undefined);
  }
}
