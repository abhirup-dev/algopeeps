// Point and Box live apart from ir.ts so lint.ts can use Box without a cycle
// (ir.ts imports Allow from lint.ts). ir.ts re-exports both.
import { z } from "zod";

export const Point = z.strictObject({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof Point>;

export const Box = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});
export type Box = z.infer<typeof Box>;
