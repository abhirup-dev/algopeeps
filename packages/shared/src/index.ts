import { z } from "zod";

export const piEventSchema = z.object({
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
});

export type PiEvent = z.infer<typeof piEventSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("algopeeps-server"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
