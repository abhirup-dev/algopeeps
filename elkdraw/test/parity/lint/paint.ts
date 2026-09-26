// Writes test/fixtures/dogfood/<name>-painted/scene.excalidraw: the stored
// scene as the testers' frontend painted it (test/fixtures/README.md, "As
// painted"). mcp-excalidraw-server keeps labels as `label: {text}` with no
// font, so its frontend used Excalidraw's defaults: every text in Excalifont
// (fontFamily 5), bound labels at 20 px. GEOMETRY holds the container changes
// final.png shows. Run: `bun elkdraw/test/parity/lint/paint.ts`.
import { parseJson } from "@elkdraw/core";
import { z } from "zod";

const dogfood = new URL("../../fixtures/dogfood/", import.meta.url).pathname;

/** Per variant: element id -> fields as final.png shows them. */
const GEOMETRY: Record<string, Record<string, Record<string, number>>> = {
  yct: {},
  batch: {},
  // The wrapped keys stretched their 44 px circles (ink 88 px tall in final.png).
  "bst-first": { t12: { height: 80 }, t10: { height: 80 } },
};

const File = z.looseObject({
  elements: z.array(
    z.looseObject({
      id: z.string(),
      type: z.string(),
      containerId: z.string().nullish(),
    }),
  ),
});

for (const [name, geometry] of Object.entries(GEOMETRY)) {
  const scene = parseJson(
    File,
    await Bun.file(`${dogfood}${name}/scene.excalidraw`).text(),
  );
  scene.elements = scene.elements.map((e) => ({
    ...e,
    ...(e.type === "text"
      ? { fontFamily: 5, ...(e.containerId ? { fontSize: 20 } : {}) }
      : {}),
    ...geometry[e.id],
  }));
  await Bun.write(
    `${dogfood}${name}-painted/scene.excalidraw`,
    JSON.stringify(scene, null, 2) + "\n",
  );
}
