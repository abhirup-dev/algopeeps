// The only place JSON.parse is allowed (see no-restricted-properties in
// eslint.config.js). Every JSON payload is validated against a schema here.
import type { z } from "zod";

export type JsonResult<T> =
  { ok: true; value: T } | { ok: false; error: SyntaxError | z.ZodError };

/** Parse and validate; throws SyntaxError or ZodError. */
export function parseJson<S extends z.ZodType>(
  schema: S,
  text: string,
): z.infer<S> {
  const raw: unknown = JSON.parse(text);
  return schema.parse(raw);
}

/** Parse and validate without throwing. */
export function safeParseJson<S extends z.ZodType>(
  schema: S,
  text: string,
): JsonResult<z.infer<S>> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, error };
    throw error;
  }
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error };
}
