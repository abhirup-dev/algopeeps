// Tool handlers that forward to a running elkdraw server over REST
// (SURFACE.md), so an MCP host on stdio sees the same scene as the browser.
// Bun's fetch honours NODE_EXTRA_CA_CERTS, which covers portless https URLs.
import { safeParseJson } from "@elkdraw/core";
import { z } from "zod";
import { type Handlers, handlersFrom, ToolError } from "./index.ts";
import { ToolErrorBody } from "./tools.ts";

const DEFAULT_PORT = "3940";

/** Empty env vars count as unset. */
const nonEmpty = (value: string | undefined) =>
  value === "" ? undefined : value;

/** `$ELKDRAW_URL`, else `http://127.0.0.1:$PORT`, else port 3940. */
export function baseUrl(env: Record<string, string | undefined>): string {
  const port = nonEmpty(env["PORT"]) ?? DEFAULT_PORT;
  const url = nonEmpty(env["ELKDRAW_URL"]) ?? `http://127.0.0.1:${port}`;
  return url.replace(/\/+$/, "");
}

const ErrorReply = z.object({ error: ToolErrorBody });

export function restHandlers(base: string): Handlers {
  return handlersFrom(async (name, input) => {
    let res: Response;
    try {
      res = await fetch(`${base}/api/tools/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
    } catch (error) {
      throw new ToolError({
        code: "UNREACHABLE",
        message: `elkdraw server unreachable at ${base} (${String(error)}); run \`elkdraw start\``,
        tool: name,
      });
    }
    const text = await res.text();
    if (res.ok) {
      const parsed = safeParseJson(z.unknown(), text);
      if (parsed.ok) return parsed.value;
      throw new Error(`${name}: reply is not JSON`);
    }
    const failed = safeParseJson(ErrorReply, text);
    if (failed.ok) throw new ToolError(failed.value.error);
    throw new Error(`${name}: HTTP ${String(res.status)} ${text}`);
  });
}
