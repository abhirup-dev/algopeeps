// The `elkdraw` CLI: one command per MCP tool, with flags derived from the
// tool's zod input schema, plus server lifecycle (start, stop, status). Every
// command talks to the running server over the REST contract in SURFACE.md.
// Exit codes: 0 ok, 1 error, 2 usage or invalid input, 3 server unreachable.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command } from "@commander-js/extra-typings";
import { safeParseJson } from "@elkdraw/core";
import {
  inputJsonSchema,
  ServerStatus,
  type ToolDef,
  tools,
} from "@elkdraw/mcp";
import { z } from "zod";

const DEFAULT_PORT = "3940";
const SERVER_MAIN = fileURLToPath(
  new URL("../../server/src/main.ts", import.meta.url),
);
const START_TIMEOUT_MS = 10_000;

class CliExit extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

/** Empty env vars count as unset. */
const nonEmpty = (value: string | undefined) =>
  value === "" ? undefined : value;

export function defaultUrl(env: Record<string, string | undefined>): string {
  const port = nonEmpty(env["PORT"]) ?? DEFAULT_PORT;
  return nonEmpty(env["ELKDRAW_URL"]) ?? `http://127.0.0.1:${port}`;
}

async function request(
  base: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  try {
    return await fetch(`${base.replace(/\/+$/, "")}${path}`, init);
  } catch (_error) {
    throw new CliExit(3, `elkdraw server unreachable at ${base}`);
  }
}

/** Print a 2xx body to stdout; anything else goes to stderr as exit 1. */
async function emit(res: Response): Promise<void> {
  const text = await res.text();
  if (!res.ok) throw new CliExit(1, text || `HTTP ${String(res.status)}`);
  console.log(text);
}

async function fetchStatus(base: string): Promise<ServerStatus | undefined> {
  let res: Response;
  try {
    res = await request(base, "GET", "/api/status");
  } catch (_error) {
    return undefined;
  }
  const parsed = safeParseJson(ServerStatus, await res.text());
  if (!parsed.ok)
    throw new CliExit(1, `bad /api/status reply: ${parsed.error.message}`);
  return parsed.value;
}

async function start(base: string): Promise<ServerStatus> {
  const running = await fetchStatus(base);
  if (running !== undefined) return running;
  const port = new URL(base).port || DEFAULT_PORT;
  spawn(process.execPath, [SERVER_MAIN], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: port },
  }).unref();
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await Bun.sleep(100);
    const status = await fetchStatus(base);
    if (status !== undefined) return status;
  }
  throw new CliExit(3, `elkdraw server did not come up at ${base}`);
}

// Flag derivation reads the tool's JSON Schema (zod's public output), not zod
// internals; the object is then validated once by the same zod schema.
const Prop = z.looseObject({
  type: z.string().optional(),
  description: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
  items: z.looseObject({ type: z.string().optional() }).optional(),
});
type Prop = z.infer<typeof Prop>;
const ObjectSchema = z.looseObject({
  properties: z.record(z.string(), Prop).default({}),
  required: z.array(z.string()).default([]),
});

const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function convert(prop: Prop, value: unknown): unknown {
  if (typeof value !== "string") return value; // boolean flags
  if (prop.type === "integer" || prop.type === "number") return Number(value);
  if (prop.type === "string") return value;
  if (prop.type === "array" && prop.items?.type === "string") {
    return value.split(",");
  }
  const parsed = safeParseJson(z.unknown(), value);
  if (!parsed.ok) throw new CliExit(2, `not JSON: ${value}`);
  return parsed.value;
}

function addToolCommand(program: Command, def: ToolDef): void {
  const schema = ObjectSchema.parse(inputJsonSchema(def));
  const cmd = program.command(def.name).description(def.description);
  for (const [key, prop] of Object.entries(schema.properties)) {
    const flag = kebab(key);
    const help = [
      prop.description,
      prop.enum ? `one of ${prop.enum.map(String).join("|")}` : undefined,
      prop.type === "array" && prop.items?.type === "string"
        ? "comma-separated"
        : undefined,
      prop.type === "object" ||
      (prop.type === "array" && prop.items?.type !== "string")
        ? "JSON"
        : undefined,
      schema.required.includes(key) ? "required" : undefined,
    ]
      .filter((part) => part !== undefined)
      .join("; ");
    cmd.option(
      prop.type === "boolean" ? `--${flag}` : `--${flag} <value>`,
      help,
    );
  }
  cmd.option("--input <json>", "Whole input as a JSON object, or - for stdin");
  cmd.action(async () => {
    const opts: Record<string, unknown> = cmd.opts();
    let raw: Record<string, unknown> = {};
    if (typeof opts["input"] === "string") {
      const text =
        opts["input"] === "-" ? await Bun.stdin.text() : opts["input"];
      const parsed = safeParseJson(z.record(z.string(), z.unknown()), text);
      if (!parsed.ok) throw new CliExit(2, `--input: ${parsed.error.message}`);
      raw = parsed.value;
    }
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (opts[key] !== undefined) raw[key] = convert(prop, opts[key]);
    }
    const input = def.input.safeParse(raw);
    if (!input.success) throw new CliExit(2, z.prettifyError(input.error));
    await emit(
      await request(
        baseOf(program),
        "POST",
        `/api/tools/${def.name}`,
        input.data,
      ),
    );
  });
}

function baseOf(program: Command): string {
  const { url } = program.opts() as { url?: string };
  return url ?? defaultUrl(process.env);
}

export function buildCli(): Command {
  const program = new Command("elkdraw")
    .description(
      "ELK draw: drive the localhost canvas from the shell. JSON on stdout.",
    )
    .option(
      "--url <url>",
      "Server URL (default $ELKDRAW_URL, else http://127.0.0.1:$PORT, port 3940)",
    )
    .exitOverride((error) => {
      process.exit(error.exitCode === 0 ? 0 : 2);
    });
  program
    .command("start")
    .description(
      "Start the server detached (no-op when running); prints its status",
    )
    .action(async () => {
      console.log(JSON.stringify(await start(baseOf(program))));
    });
  program
    .command("stop")
    .description("Stop the server")
    .action(async () => {
      await emit(await request(baseOf(program), "POST", "/api/shutdown"));
    });
  program
    .command("status")
    .description("Server port, url, branch, session, rev and browser clients")
    .action(async () => {
      const status = await fetchStatus(baseOf(program));
      if (status === undefined) {
        throw new CliExit(
          3,
          `elkdraw server unreachable at ${baseOf(program)}`,
        );
      }
      console.log(JSON.stringify(status));
    });
  for (const def of tools) addToolCommand(program, def);
  return program;
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    await buildCli().parseAsync([...argv], { from: "user" });
    return 0;
  } catch (error) {
    if (!(error instanceof CliExit)) throw error;
    console.error(error.message);
    return error.code;
  }
}
