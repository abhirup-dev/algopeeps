// §6 asset: hash_map — bucket column 80×48 with index, entries as
// "key → value" boxes to the right of their bucket.
import type { AgentElement } from "../types.js";
import { base, finalize, shape, type AssetBase } from "./common.js";

const BUCKET_W = 80;
const BUCKET_H = 48;
const ENTRY_W = 160;
const GAP = 24;

export interface HashMapParams extends AssetBase {
  entries: { key: string | number; value: string | number }[];
  buckets?: number;
}

export function generate(p: HashMapParams): {
  elements: AgentElement[];
  groupId: string;
} {
  const b = base(p, "hash_map");
  const entries = p.entries;
  if (!Array.isArray(entries)) {
    throw new Error("hash_map: entries must be an array of {key, value}");
  }
  for (const e of entries) {
    if (
      e === null ||
      typeof e !== "object" ||
      !("key" in e) ||
      !("value" in e)
    ) {
      throw new Error("hash_map: entries must be {key, value} objects");
    }
  }
  const buckets = p.buckets ?? 8;
  if (!Number.isInteger(buckets) || buckets < 1) {
    throw new Error("hash_map: buckets must be a positive integer");
  }

  const els: AgentElement[] = [];
  for (let i = 0; i < buckets; i++) {
    els.push(
      shape(
        "rectangle",
        b.x,
        b.y + i * BUCKET_H,
        BUCKET_W,
        BUCKET_H,
        String(i),
        "#e9ecef",
      ),
    );
  }

  // ponytail: entry→bucket placement is index-mod, not a real hash —
  // deterministic, visible, and enough for teaching diagrams; swap in a hash
  // fn if entries need stable placement across calls.
  const perBucket = new Array<number>(buckets).fill(0);
  entries.forEach((e, j) => {
    const row = j % buckets;
    const slot = perBucket[row];
    perBucket[row] = slot + 1;
    const ex = b.x + BUCKET_W + GAP + slot * (ENTRY_W + 16);
    els.push(
      shape(
        "rectangle",
        ex,
        b.y + row * BUCKET_H,
        ENTRY_W,
        BUCKET_H,
        `${e.key} → ${e.value}`,
      ),
    );
  });

  return finalize("hash_map", b.name, b.owner ?? "agent", els);
}
