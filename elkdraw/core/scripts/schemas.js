// Writes core/schemas/<name>.json from the zod contracts. Run via `bun run schemas`.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { jsonSchemas } from "../src/contracts/json-schema.ts";

const dir = new URL("../schemas/", import.meta.url);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
for (const [name, schema] of Object.entries(jsonSchemas())) {
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(schema, null, 2));
}
