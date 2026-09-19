import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
const client = new Client({ name: "dbg", version: "0" }, { capabilities: { extensions: { "io.modelcontextprotocol/ui": {} } } as any });
await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3100/mcp")), { timeout: 3000 });
const s = "dbg-" + Date.now().toString(36);
const raw = async (name: string, args: any) => {
  const r: any = await client.callTool({ name, arguments: args });
  const t = r.content?.find((c: any) => c.type === "text")?.text ?? "";
  console.log(`--- ${name} isError=${r.isError}\n${t.slice(0, 300)}`);
  return { isError: r.isError, text: t };
};
await raw("canvas_open", { session: s });
await raw("canvas_asset", { session: s, kind: "array", name: "nums", values: [2,7,11,15], pointers: [{label:"i",index:0},{label:"j",index:1}], x: 100, y: 100 });
await raw("canvas_read", { session: s });
await raw("canvas_annotate", { session: s, kind: "circle", ref: "nonexistent" });
