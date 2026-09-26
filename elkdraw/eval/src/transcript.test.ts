import { expect, test } from "bun:test";
import { parseJson } from "@elkdraw/core";
import { z } from "zod";
import { pngSize, readTranscript, visionTokens } from "./transcript.ts";

const fixture = new URL("../fixtures/yct-ride-hailing.jsonl", import.meta.url);
const baseline = new URL("../baseline.json", import.meta.url);

test("the trimmed fixture reproduces baseline.json's yct ride-hailing run", async () => {
  const runs = parseJson(
    z.object({
      runs: z.array(
        z.object({
          id: z.string(),
          toolCalls: z.number(),
          tokens: z.object({
            output: z.number(),
            inputText: z.number(),
            images: z.number(),
            total: z.number(),
          }),
          images: z.number(),
          wallSeconds: z.number(),
        }),
      ),
    }),
    await Bun.file(baseline).text(),
  ).runs;
  const m = readTranscript(await Bun.file(fixture).text());
  expect(runs.find((r) => r.id === "yct-ride-hailing")).toEqual({
    id: "yct-ride-hailing",
    toolCalls: m.toolCalls,
    tokens: m.tokens,
    images: m.images.count,
    wallSeconds: m.wallSeconds,
  });
  expect(m.model).toBe("claude-opus-5-5");
  expect(m.skippedLines).toBe(0);
});

// 1x1 PNG header, base64.
const png = (w: number, h: number) => {
  const b = Buffer.alloc(24);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b.toString("base64");
};

test("dedupes usage by message id and tool calls by block id; tolerates junk", () => {
  const usage = {
    input_tokens: 1,
    output_tokens: 100,
    cache_read_input_tokens: 5,
  };
  const lines = [
    { type: "ai-title", whatever: 1 },
    {
      type: "user",
      timestamp: "2026-01-01T00:00:00Z",
      message: { content: "abcdefgh", role: "user", brandNewField: true },
    },
    {
      type: "assistant",
      timestamp: "2026-01-01T00:00:01Z",
      message: { id: "m1", content: [{ type: "thinking" }], usage },
    },
    {
      type: "assistant",
      timestamp: "2026-01-01T00:00:02Z",
      message: {
        id: "m1",
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
        usage,
      },
    },
    {
      type: "assistant",
      timestamp: "2026-01-01T00:00:02Z",
      message: {
        id: "m1",
        content: [{ type: "tool_use", id: "t1", name: "Bash" }],
        usage,
      },
    },
    {
      type: "user",
      timestamp: "2026-01-01T00:00:10Z",
      message: {
        content: [
          {
            type: "tool_result",
            content: [
              { type: "text", text: "12345678" },
              { type: "image", source: { data: png(1000, 750) } },
            ],
          },
        ],
      },
    },
    { type: "system", timestamp: "2026-01-01T00:05:00Z" },
  ].map((l) => JSON.stringify(l));
  const m = readTranscript([...lines, "{not json", ""].join("\n"));
  expect(m.toolCalls).toBe(1);
  expect(m.toolCallsByName).toEqual({ Bash: 1 });
  expect(m.apiCalls).toBe(1);
  expect(m.usage).toEqual({
    input: 1,
    output: 100,
    cacheRead: 5,
    cacheCreation: 0,
  });
  expect(m.inputTextBytes).toBe(16);
  expect(m.tokens).toEqual({
    output: 100,
    inputText: 5,
    images: 1000,
    total: 1105,
  });
  expect(m.images.sizes).toEqual(["1000x750"]);
  expect(m.wallSeconds).toBe(10); // the system record does not extend it
  expect(m.skippedLines).toBe(1);

  const late = readTranscript(lines.join("\n"), {
    from: "2026-01-01T00:00:05Z",
  });
  expect(late.toolCalls).toBe(0);
  expect(late.images.count).toBe(1);
});

test("vision tokens: (w*h)/750 after the 1568 px / 1.15 MP resize", () => {
  expect(visionTokens(1000, 750)).toBe(1000);
  expect(visionTokens(200, 200)).toBe(54);
  expect(visionTokens(2000, 1100)).toBe(1534);
  expect(visionTokens(4000, 200)).toBeLessThanOrEqual(
    Math.ceil((1568 * 78.4) / 750),
  );
  expect(pngSize(png(3, 4))).toEqual([3, 4]);
  expect(pngSize("aGVsbG8=")).toBeUndefined();
});

test("counts permission denials, not other tool errors", () => {
  const result = (content: string, isError: boolean) =>
    JSON.stringify({
      type: "user",
      timestamp: "2026-09-26T00:00:00Z",
      message: {
        content: [
          { type: "tool_result", content, is_error: isError, tool_use_id: "t" },
        ],
      },
    });
  const lines = [
    result(
      "Claude requested permissions to use Bash, but you haven't granted it yet.",
      true,
    ),
    result(
      "ls in '/' was blocked. For security, Claude Code may only list files in the allowed working directories for this session: '/tmp/x'.",
      true,
    ),
    result("Exit code 2\nlint: 3 errors", true),
    result("haven't granted it yet (quoted in a normal result)", false),
  ];
  expect(readTranscript(lines.join("\n")).denials).toBe(2);
});
