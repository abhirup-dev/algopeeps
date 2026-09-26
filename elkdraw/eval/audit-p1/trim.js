// Prints a tester's transcript with every base64 PNG cut to its first 64
// chars (the IHDR, which transcript.ts reads for image size), as 1.12 did.
//   bun elkdraw/eval/audit-p1/trim.js <scratch-dir> > transcript.jsonl
import { readFileSync, realpathSync } from "node:fs";
import { parseJson } from "@elkdraw/core";
import { z } from "zod";
import { projectDir } from "../src/cli.ts";

const dir = process.argv[2];
if (dir === undefined) throw new Error("usage: trim.js <scratch-dir>");
const cwd = realpathSync(dir);
const { session_id } = parseJson(
  z.object({ session_id: z.string() }),
  readFileSync(`${cwd}.result.json`, "utf8"),
);
const raw = readFileSync(`${projectDir(cwd)}/${session_id}.jsonl`, "utf8");
process.stdout.write(
  raw.replaceAll(/(iVBORw0KGgo[A-Za-z0-9+/=]{53})[A-Za-z0-9+/=]*/g, "$1"),
);
