// `bun adapters/server/src/main.ts [--no-open]`: what `elkdraw start` spawns.
// Env: PORT (default 3940), ELKDRAW_SESSION (default "default"),
// ELKDRAW_NO_OPEN, ELKDRAW_DATA_DIR, ELKDRAW_BRANCH, PORTLESS_URL.
import { resolve } from "node:path";
import { startServer } from "./server.ts";

const env = process.env;
const noOpen =
  process.argv.includes("--no-open") ||
  (env["ELKDRAW_NO_OPEN"] !== undefined &&
    !["", "0", "false"].includes(env["ELKDRAW_NO_OPEN"]));

const { url, stop } = startServer({
  port: Number(env["PORT"] ?? 3940),
  session: env["ELKDRAW_SESSION"] ?? "default",
  open: !noOpen,
  appDir: resolve(import.meta.dir, "../../../app/dist"),
});
process.stdout.write(`elkdraw: ${url}\n`);

// Close the sidecar's browser too, not just the listener.
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void stop().finally(() => process.exit(0));
  });
