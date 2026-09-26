// Reads a Claude Code transcript (~/.claude/projects/<cwd-slug>/<session>.jsonl)
// and counts what the eval bar measures: tool calls, tokens, images, wall time.
import { safeParseJson } from "@elkdraw/core";
import { z } from "zod";

// z.object drops unknown keys, so new Claude Code fields never break a parse.
const Inner = z.object({
  type: z.string(),
  text: z.string().optional(),
  source: z.object({ data: z.string().optional() }).optional(),
});
const Block = Inner.extend({
  id: z.string().optional(),
  name: z.string().optional(),
  content: z.union([z.string(), z.array(Inner)]).optional(),
});
const Usage = z.object({
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_input_tokens: z.number().default(0),
  cache_creation_input_tokens: z.number().default(0),
});
const TranscriptRecord = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
  effort: z.string().optional(),
  message: z
    .object({
      id: z.string().optional(),
      model: z.string().optional(),
      content: z.union([z.string(), z.array(Block)]).optional(),
      usage: Usage.optional(),
    })
    .optional(),
});
type TranscriptRecord = z.infer<typeof TranscriptRecord>;
type Usage = z.infer<typeof Usage>;

/** Bytes per token for tool output and prompts; design §9.5's basis for code-like text. */
export const BYTES_PER_TOKEN = 3.2;

/**
 * Claude vision cost of one image, from the Anthropic vision docs: the API
 * first scales the image down (aspect kept) until its long edge is ≤ 1568 px
 * and it has ≤ 1.15 MP, then charges tokens ≈ (w × h) / 750. So a full
 * screenshot costs at most ~1,533 tokens. Design §4's table uses 28 px patches
 * (⌈w/28⌉ × ⌈h/28⌉, capped at 1568); the two agree within ~5 % at these sizes.
 */
export function visionTokens(width: number, height: number): number {
  const scale = Math.min(
    1,
    1568 / Math.max(width, height),
    Math.sqrt(1_150_000 / (width * height)),
  );
  return Math.ceil((width * scale * (height * scale)) / 750);
}

/** Width and height from a base64 PNG's IHDR (the first 32 base64 chars suffice). */
export function pngSize(base64: string): [number, number] | undefined {
  const b = Buffer.from(base64.slice(0, 32), "base64");
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return undefined;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

export interface Window {
  /** ISO timestamps; records outside [from, to) are ignored. */
  from?: string | undefined;
  to?: string | undefined;
}

export interface TranscriptMetrics {
  model: string | undefined;
  effort: string | undefined;
  toolCalls: number;
  toolCallsByName: Record<string, number>;
  apiCalls: number;
  images: { count: number; tokens: number; sizes: string[] };
  /** Prompt and tool-result text the task fed back into context. */
  inputTextBytes: number;
  tokens: {
    output: number;
    inputText: number;
    images: number;
    /** The §17.4 measure: output + input text + images. */
    total: number;
  };
  /** Raw API usage, for audit only; cache reads scale with turns × context. */
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
  wallSeconds: number;
  firstTimestamp: string | undefined;
  lastTimestamp: string | undefined;
  skippedLines: number;
}

function inWindow(r: TranscriptRecord, w: Window): boolean {
  if (r.timestamp === undefined) return false;
  const t = Date.parse(r.timestamp);
  if (w.from !== undefined && t < Date.parse(w.from)) return false;
  if (w.to !== undefined && t >= Date.parse(w.to)) return false;
  return true;
}

export function readTranscript(
  text: string,
  window: Window = {},
): TranscriptMetrics {
  let skippedLines = 0;
  const records: TranscriptRecord[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const parsed = safeParseJson(TranscriptRecord, line);
    if (!parsed.ok) skippedLines++;
    else if (inWindow(parsed.value, window)) records.push(parsed.value);
  }

  // Claude Code writes one record per content block; blocks of one API
  // message share message.id and repeat its usage. Last record wins.
  const usageById = new Map<string, Usage>();
  const toolIds = new Set<string>();
  const toolCallsByName: Record<string, number> = {};
  const sizes: string[] = [];
  let imageTokens = 0;
  let inputTextBytes = 0;
  let model: string | undefined;
  let effort: string | undefined;

  const image = (data: string | undefined) => {
    const size = data === undefined ? undefined : pngSize(data);
    // ponytail: non-PNG images count at the ~1,600-token ceiling; parse JPEG SOF if one shows up.
    sizes.push(size ? `${String(size[0])}x${String(size[1])}` : "unknown");
    imageTokens += size ? visionTokens(...size) : 1600;
  };
  const addText = (s: string | undefined) => {
    inputTextBytes += Buffer.byteLength(s ?? "");
  };

  for (const r of records) {
    const m = r.message;
    if (m === undefined) continue;
    if (r.type === "assistant") {
      model ??= m.model;
      effort ??= r.effort;
      if (m.usage && m.id !== undefined) usageById.set(m.id, m.usage);
      if (!Array.isArray(m.content)) continue;
      for (const b of m.content) {
        if (b.type !== "tool_use" || b.id === undefined || toolIds.has(b.id))
          continue;
        toolIds.add(b.id);
        const name = b.name ?? "unknown";
        toolCallsByName[name] = (toolCallsByName[name] ?? 0) + 1;
      }
    } else if (r.type === "user") {
      if (typeof m.content === "string") {
        addText(m.content);
        continue;
      }
      for (const b of m.content ?? []) {
        if (b.type === "text") addText(b.text);
        else if (b.type === "image") image(b.source?.data);
        else if (b.type === "tool_result") {
          if (typeof b.content === "string") addText(b.content);
          else
            for (const c of b.content ?? []) {
              if (c.type === "image") image(c.source?.data);
              else addText(c.text);
            }
        }
      }
    }
  }

  const usage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  for (const u of usageById.values()) {
    usage.input += u.input_tokens;
    usage.output += u.output_tokens;
    usage.cacheRead += u.cache_read_input_tokens;
    usage.cacheCreation += u.cache_creation_input_tokens;
  }
  const inputText = Math.ceil(inputTextBytes / BYTES_PER_TOKEN);
  // Wall time spans the conversation only: the task prompt to the last message.
  const stamps = records
    .filter((r) => r.type === "user" || r.type === "assistant")
    .map((r) => r.timestamp)
    .filter((t) => t !== undefined)
    .sort();
  const firstTimestamp = stamps[0];
  const lastTimestamp = stamps.at(-1);

  return {
    model,
    effort,
    toolCalls: toolIds.size,
    toolCallsByName,
    apiCalls: usageById.size,
    images: { count: sizes.length, tokens: imageTokens, sizes },
    inputTextBytes,
    tokens: {
      output: usage.output,
      inputText,
      images: imageTokens,
      total: usage.output + inputText + imageTokens,
    },
    usage,
    wallSeconds:
      firstTimestamp !== undefined && lastTimestamp !== undefined
        ? (Date.parse(lastTimestamp) - Date.parse(firstTimestamp)) / 1000
        : 0,
    firstTimestamp,
    lastTimestamp,
    skippedLines,
  };
}
