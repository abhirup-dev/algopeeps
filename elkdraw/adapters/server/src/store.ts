// Scene store for one session: an id -> element map with a rev counter,
// persisted as <dir>/events.jsonl. Each accepted delta appends one line
// (FeedLine fields + rev + the changed elements); every KEYFRAME_EVERY deltas a
// keyframe line holds the whole scene, so replay = last keyframe + later deltas.
// Written synchronously: fine for one local process.
// ponytail: the file grows forever; compact to the last keyframe if it gets big.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  truncateSync,
} from "node:fs";
import { join } from "node:path";
import { Element, FeedLine, Id, parseJson } from "@elkdraw/core";
import stringify from "safe-stable-stringify";
import { z } from "zod";

const Rev = z.int().nonnegative();

const DeltaLine = FeedLine.extend({
  op: z.literal("delta"),
  rev: Rev,
  upserts: z.array(Element),
  deletes: z.array(Id),
});

const KeyframeLine = z.strictObject({
  op: z.literal("keyframe"),
  time: z.iso.datetime(),
  rev: Rev,
  elements: z.array(Element),
});

export const EventLine = z.discriminatedUnion("op", [DeltaLine, KeyframeLine]);
export type EventLine = z.infer<typeof EventLine>;

export interface Applied {
  rev: number;
  /** Upserts that won (newer version or new id) and deletes that removed something. */
  upserts: Element[];
  deletes: string[];
}

export class Store {
  readonly file: string;
  rev = 0;
  private readonly elements = new Map<string, Element>();
  private sinceKeyframe = 0;

  constructor(
    dir: string,
    private readonly keyframeEvery = 50,
  ) {
    this.file = join(dir, "events.jsonl");
    mkdirSync(dir, { recursive: true });
    this.replay();
  }

  scene(): Element[] {
    return [...this.elements.values()];
  }

  /** Apply a delta. Upserts win only with a higher version than the stored
   * element; deletes of unknown ids are ignored. A no-op keeps the rev and
   * writes nothing. */
  apply(
    author: FeedLine["author"],
    upserts: readonly Element[],
    deletes: readonly string[],
  ): Applied {
    const won = upserts.filter(
      (el) => (this.elements.get(el.id)?.version ?? -1) < el.version,
    );
    const gone = deletes.filter((id) => this.elements.has(id));
    if (won.length === 0 && gone.length === 0)
      return { rev: this.rev, upserts: [], deletes: [] };
    this.change(won, gone);
    this.rev++;
    this.append({
      op: "delta",
      author,
      time: new Date().toISOString(),
      rev: this.rev,
      ids: [...won.map((el) => el.id), ...gone],
      upserts: won,
      deletes: gone,
    });
    if (++this.sinceKeyframe >= this.keyframeEvery) {
      this.append({
        op: "keyframe",
        time: new Date().toISOString(),
        rev: this.rev,
        elements: this.scene(),
      });
      this.sinceKeyframe = 0;
    }
    return { rev: this.rev, upserts: won, deletes: gone };
  }

  /** The scene as it was at `rev`: replay from the last keyframe at or before
   * it. Reads the file; the live scene is untouched. rev 0 = empty. */
  sceneAt(rev: number): Element[] {
    if (!Number.isInteger(rev) || rev < 0 || rev > this.rev)
      throw new RangeError(
        `rev ${String(rev)} is not in 0..${String(this.rev)}`,
      );
    const lines = this.lines();
    let start = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line?.op === "keyframe" && line.rev <= rev) {
        start = i;
        break;
      }
    }
    const scene = new Map<string, Element>();
    let base = 0;
    for (const line of lines.slice(start)) {
      if (line.rev > rev) break;
      if (line.op === "keyframe") {
        scene.clear();
        for (const el of line.elements) scene.set(el.id, el);
        base = line.rev;
      } else if (line.rev > base) {
        for (const el of line.upserts) scene.set(el.id, el);
        for (const id of line.deletes) scene.delete(id);
      }
    }
    return [...scene.values()];
  }

  /** Who changed the scene and when, for each delta after `since`. */
  log(
    since: number,
  ): { rev: number; author: FeedLine["author"]; time: string }[] {
    return this.lines().flatMap((line) =>
      line.op === "delta" && line.rev > since
        ? [{ rev: line.rev, author: line.author, time: line.time }]
        : [],
    );
  }

  private lines(): EventLine[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8")
      .split("\n")
      .filter((raw) => raw !== "")
      .map((raw) => parseJson(EventLine, raw));
  }

  private change(upserts: readonly Element[], deletes: readonly string[]) {
    for (const el of upserts) this.elements.set(el.id, el);
    for (const id of deletes) this.elements.delete(id);
  }

  private append(line: EventLine) {
    appendFileSync(this.file, `${stringify(line)}\n`);
  }

  /** Walk back to the last keyframe, then apply the deltas after it. A torn
   * last line (crash mid-write, no trailing newline) is cut off the file. */
  private replay() {
    if (!existsSync(this.file)) return;
    let text = readFileSync(this.file, "utf8");
    if (text !== "" && !text.endsWith("\n")) {
      text = text.slice(0, text.lastIndexOf("\n") + 1);
      truncateSync(this.file, Buffer.byteLength(text));
    }
    const raw = text.split("\n").slice(0, -1);
    const lines: EventLine[] = [];
    for (let i = raw.length - 1; i >= 0; i--) {
      const line = parseJson(EventLine, raw[i] ?? "");
      lines.unshift(line);
      if (line.op === "keyframe") break;
    }
    for (const line of lines) {
      if (line.op === "keyframe") {
        this.elements.clear();
        this.change(line.elements, []);
      } else {
        this.change(line.upserts, line.deletes);
        this.sinceKeyframe++;
      }
      this.rev = line.rev;
    }
  }
}
