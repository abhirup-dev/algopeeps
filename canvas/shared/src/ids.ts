const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 12-char base62 id (contract §4: server generates one when absent).
 * Web Crypto so the same module runs under Bun, Node ≥ 19 and in the browser bundle. */
export function newId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % 62];
  return out;
}
