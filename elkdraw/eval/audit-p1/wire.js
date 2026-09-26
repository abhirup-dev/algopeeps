// An elkdraw server's stored wire scene (Excalidraw elements), replayed from
// its event log. `query` returns neutral elements, and `export` is not built,
// so this is the elkdraw side's scene file for render.js.
//   bun elkdraw/eval/audit-p1/wire.js <data-dir>/default > scene.excalidraw
import { Store } from "@elkdraw/server";

const dir = process.argv[2];
if (dir === undefined) throw new Error("usage: wire.js <store-dir>");
const store = new Store(dir);
console.log(
  JSON.stringify(
    { type: "excalidraw", rev: store.rev, elements: store.scene() },
    null,
    2,
  ),
);
