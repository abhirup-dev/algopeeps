# WP-Q inbox

## Q1 (2026-09-19) — `shared/src/ids.ts` breaks the browser build

`palette/assets.ts` imports `generate` from `@algopeeps/canvas-shared`, which pulls in
`shared/src/ids.ts` → `import { randomBytes } from "node:crypto"`. Vite externalises
`node:crypto` for the browser and throws at module evaluation:

```
Error: Module "node:crypto" has been externalized for browser compatibility.
Cannot access "node:crypto.randomBytes" in client code.
```

The whole dev page fails to mount. `shared/` is outside my scope. Proposed fix (3 lines,
works in Bun, Node ≥ 19 and browsers):

```ts
export function newId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % 62];
  return out;
}
```

May I apply it, or will you? Until answered I load shared lazily (dynamic import) so the
rest of the UI renders; asset drop/stamp and the Library items fail until this lands.
(Likely why WP-K never shipped a `library.ts`.)

## Done

WP-Q DONE
