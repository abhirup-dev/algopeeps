// Drive the canvas as "the agent" for a live demo. Usage: bun test/demo-agent.ts <session> [step]
// steps: asset | annotate | camera | all (default all). Read-only against everything except the named session.
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const session = process.argv[2] ?? "demo";
const step = process.argv[3] ?? "all";
const url = new URL(process.env.CANVAS_URL ?? "http://127.0.0.1:3100/mcp");

const client = new Client({ name: "demo-agent", version: "0" });
await client.connect(new StreamableHTTPClientTransport(url));

async function call(name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: { session, ...args } })) as {
    content: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = r.content.find((c) => c.type === "text")?.text ?? "";
  console.log(`${r.isError ? "ERR " : "ok  "}${name}: ${text.slice(0, 160)}`);
  return text;
}

await call("canvas_open", {});
if (step === "asset" || step === "all") {
  await call("canvas_asset", {
    kind: "array",
    name: "nums",
    values: [2, 7, 11, 15],
    pointers: [{ label: "i", index: 0 }, { label: "j", index: 1 }],
    showIndex: true,
    x: 200,
    y: 200,
  });
}
if (step === "camera" || step === "all") {
  await call("canvas_camera", { fitAll: true });
}
if (step === "annotate") {
  const read = JSON.parse(await call("canvas_read", { owner: "human" })) as { elements: Array<{ id: string }> };
  const target = read.elements.at(-1);
  if (!target) {
    console.log("no human element to annotate yet — draw something first");
  } else {
    await call("canvas_annotate", { kind: "circle", ref: target.id });
    await call("canvas_annotate", { kind: "counterexample", ref: target.id, text: "[3,3], target 6" });
    await call("canvas_camera", { fitIds: [target.id] });
  }
}
await call("canvas_describe", {});
await client.close();
