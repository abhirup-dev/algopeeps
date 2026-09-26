// Every fixture .mmd must parse with the pinned mermaid (11.17.2) and be
// detected as the family its file name claims.
import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const fixtures = new URL("../../fixtures/", import.meta.url).pathname;

// mermaid touches window/document at import time; give it a DOM first.
const dom = new Window();
Object.assign(globalThis, { window: dom, document: dom.document });
const { default: mermaid } = await import("mermaid");
afterAll(async () => {
  await dom.happyDOM.close();
});

// File-name family (mermaid/<family>-N.mmd, tasks/*.mmd) -> mermaid's diagramType.
const diagramType: Record<string, string> = {
  flowchart: "flowchart-v2",
  class: "classDiagram",
  er: "er",
  state: "stateDiagram",
  requirement: "requirement",
  sequence: "sequence",
  gantt: "gantt",
  timeline: "timeline",
  mindmap: "mindmap",
  kanban: "kanban",
  tasks: "flowchart-v2",
};

const files = [...new Bun.Glob("**/*.mmd").scanSync(fixtures)].sort();

test("fixture corpus covers every family", () => {
  const families = new Set(files.map(familyOf));
  expect([...families].sort()).toEqual(Object.keys(diagramType).sort());
});

for (const file of files) {
  test(`mermaid parses ${file}`, async () => {
    const result = await mermaid.parse(await Bun.file(fixtures + file).text());
    expect(result).toMatchObject({ diagramType: diagramType[familyOf(file)] });
  });
}

function familyOf(file: string): string {
  if (file.startsWith("tasks/")) return "tasks";
  const name = file.slice(file.lastIndexOf("/") + 1);
  return name.slice(0, name.lastIndexOf("-"));
}
