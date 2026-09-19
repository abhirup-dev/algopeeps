// §6 asset: stack_frames — 220×72 boxes, topmost = last frame, "call stack"
// label to the left of the column.
import type { AgentElement } from "../types.js";
import { base, finalize, shape, textEl, type AssetBase } from "./common.js";

const FRAME_W = 220;
const FRAME_H = 72;
const LABEL_W = 90; // room for the left label so the bbox still starts at (x, y)

export interface StackFrame {
  fn: string;
  args?: (string | number)[];
  locals?: (string | number)[];
}

export interface StackFramesParams extends AssetBase {
  frames: StackFrame[];
}

export function generate(p: StackFramesParams): {
  elements: AgentElement[];
  groupId: string;
} {
  const b = base(p, "stack_frames");
  const frames = p.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("stack_frames: frames must be a non-empty array");
  }
  for (const f of frames) {
    if (typeof f?.fn !== "string" || !f.fn) {
      throw new Error("stack_frames: each frame needs a non-empty string fn");
    }
  }

  // (x, y) is the top-left of the whole stack: last frame on top, earlier
  // frames stack downward beneath it.
  const els: AgentElement[] = frames.map((f, i) => {
    const label =
      f.fn +
      (f.args ? `(${f.args.join(", ")})` : "()") +
      (f.locals ? `\nlocals: ${f.locals.join(", ")}` : "");
    return shape(
      "rectangle",
      b.x + LABEL_W,
      b.y + (frames.length - 1 - i) * FRAME_H,
      FRAME_W,
      FRAME_H,
      label,
      "#a5d8ff",
    );
  });
  els.push(textEl(b.x, b.y + (frames.length * FRAME_H) / 2 - 12, "call stack"));

  return finalize("stack_frames", b.name, b.owner ?? "agent", els);
}
