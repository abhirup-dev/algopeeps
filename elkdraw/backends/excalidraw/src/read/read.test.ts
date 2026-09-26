import { expect, test } from "bun:test";
import { join } from "node:path";
import { type ExcalidrawScene, readScene } from "./read.ts";

const DOGFOOD = join(import.meta.dir, "../../../../test/fixtures/dogfood");

async function load(name: string): Promise<ExcalidrawScene> {
  // Stored fixture, trusted: readScene validates its own output.
  const file = Bun.file(join(DOGFOOD, name, "scene.excalidraw"));
  return (await file.json()) as ExcalidrawScene;
}

for (const name of ["yct", "batch"]) {
  test(`reads dogfood ${name} to a NeutralScene`, async () => {
    const scene = await load(name);
    const read = await readScene(scene);
    expect(read).toMatchSnapshot();

    // Every bound text is folded into its container, never its own entry.
    const bound = scene.elements.filter(
      (e) => e.type === "text" && e.containerId,
    );
    const ids = new Set(read.elements.map((e) => e.id));
    for (const t of bound) {
      expect(ids.has(t.id)).toBe(false);
      if (t.type !== "text" || !t.containerId) continue;
      const host = read.elements.find((e) => e.id === t.containerId);
      expect(host?.text?.text).toBe(t.text);
    }
  });
}

test("measure replaces stored text boxes by id", async () => {
  const scene = await load("yct");
  const drew = { x: 1, y: 2, width: 3, height: 4 };
  const read = await readScene(scene, () =>
    Promise.resolve({ "rider-label": drew }),
  );
  expect(read.elements.find((e) => e.id === "rider")?.text?.box).toEqual(drew);
});
