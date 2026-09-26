// WebSocket sync protocol between the elkdraw server and the browser canvas.
// Lives here until the server lane (P0.5) moves it to a shared package.
//
//   server -> client: hello, snapshot, delta (agent or other clients), ack
//   client -> server: delta (author "human")
//
// On connect the server sends hello, then a snapshot. Every accepted delta
// bumps the scene rev; the server answers a client delta with ack(rev).
import { z } from "zod";

/** An Excalidraw element. Only id and version matter to sync; the rest passes
 * through untouched and is repaired by Excalidraw's restoreElements. */
export const Element = z.looseObject({
  id: z.string(),
  type: z.string(),
  version: z.number().int(),
});
export type Element = z.infer<typeof Element>;

const Rev = z.number().int().nonnegative();

export const Hello = z.object({
  type: z.literal("hello"),
  session: z.string(),
  branch: z.string(),
});

export const Snapshot = z.object({
  type: z.literal("snapshot"),
  rev: Rev,
  elements: z.array(Element),
});

/** From the server: rev is the scene rev after applying. From a client: rev is
 * the last rev the client had seen (its base). */
export const Delta = z.object({
  type: z.literal("delta"),
  rev: Rev,
  upserts: z.array(Element),
  deletes: z.array(z.string()),
  author: z.string(),
});
export type Delta = z.infer<typeof Delta>;

export const Ack = z.object({ type: z.literal("ack"), rev: Rev });

export const ServerMessage = z.discriminatedUnion("type", [
  Hello,
  Snapshot,
  Delta,
  Ack,
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export const ClientMessage = Delta;
export type ClientMessage = z.infer<typeof ClientMessage>;
