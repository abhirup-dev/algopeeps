# elkdraw notes

## Package graph

```
core  <- backends/excalidraw, backends/fake, sidecar, adapters/mcp, app (types only)
adapters/server <- core, backend-excalidraw, backend-fake, mcp
adapters/cli    <- core, server
test/parity, eval <- anything
```

Enforced three ways: each package's `package.json` (Bun's isolated linker only
links declared deps, so undeclared imports do not resolve), `tsconfig.json`
project references (`tsc -b` fails on cycles and on files outside a project),
and `no-restricted-imports` in `eslint.config.js` (`allowedDeps`). Change all
three together. `adapters/mcp` stays core-only for good: server depends on it.

## MCP HTTP transport

`@modelcontextprotocol/server@2.0.0` ships a web-standard Streamable HTTP
transport: `WebStandardStreamableHTTPServerTransport`, exported from the package
root, with `handleRequest(req: Request, options?): Promise<Response>`. It plugs
straight into `Bun.serve({ fetch })`, so no express. The same root export also
has `createMcpHandler` (per-request handler factory) and
`validateHostHeader` / `localhostAllowedHostnames` for DNS-rebinding checks.

## TypeScript

- TypeScript is pinned `~6.0.3`: typescript-eslint 8.70 requires
  `typescript <6.1.0`, so 7.x is out until typescript-eslint supports it.
- Every package is `composite` with `emitDeclarationOnly` into `dist/`
  (gitignored). Packages export `./src/index.ts`; Bun and Vite run source,
  `tsc -b` maps imports to the referenced project's `.d.ts`.
- `@total-typescript/ts-reset` is loaded once, via `types` in
  `tsconfig.base.json`, so it applies to every package (a `.d.ts` import in core
  would only reach core's own program).

## Dependencies

New dependencies go through the orchestrator; do not run bun add on a task branch.

| Package                                               | Where                         | Version  | Why                                                                           |
| ----------------------------------------------------- | ----------------------------- | -------- | ----------------------------------------------------------------------------- |
| zod                                                   | core, adapters/mcp, server    | ^4.6.5   | Schemas for IR, payloads and tool inputs; v4 has `z.toJSONSchema` (verified). |
| elkjs                                                 | core                          | ^0.12.0  | ELK layout engine; ships `.d.ts` (`lib/main.d.ts`) for the IR types.          |
| safe-stable-stringify                                 | core                          | ^2.5.0   | Deterministic JSON for the event log.                                         |
| @modelcontextprotocol/server                          | adapters/mcp, adapters/server | 2.0.0    | MCP server SDK, same as canvas; peer `zod ^4.2.0`.                            |
| @modelcontextprotocol/client (dev)                    | adapters/mcp, server, eval    | 2.0.0    | MCP client for tests and the eval harness.                                    |
| commander                                             | adapters/cli                  | ^15.0.0  | CLI parsing.                                                                  |
| @commander-js/extra-typings                           | adapters/cli                  | ^15.0.0  | Inferred option/argument types for commander.                                 |
| react, react-dom                                      | app                           | ^19.3.0  | Browser canvas UI.                                                            |
| @excalidraw/excalidraw                                | app, backends/excalidraw      | 0.18.1   | Canvas component (app) and scene/element types (backend); same as canvas/app. |
| vite (dev)                                            | app                           | ^8.3.1   | App dev server and build; Vite 8 + Excalidraw 0.18.1 build verified.          |
| @vitejs/plugin-react (dev)                            | app                           | ^6.1.1   | React transform for Vite 8 (its extra peers are optional).                    |
| @types/react, @types/react-dom (dev)                  | app                           | ^19.3.0  | React types.                                                                  |
| playwright (dev)                                      | sidecar, eval                 | 1.63.0   | Headless browser; matches the cached chromium-1243, so no browser download.   |
| typescript (dev)                                      | root                          | ~6.0.3   | `tsc -b`; capped by typescript-eslint's peer range.                           |
| eslint, @eslint/js (dev)                              | root                          | ^10.11.0 | Linter and its recommended JS rules.                                          |
| typescript-eslint (dev)                               | root                          | ^8.70.1  | strictTypeChecked + stylisticTypeChecked.                                     |
| eslint-config-prettier (dev)                          | root                          | ^10.1.8  | Turns off style rules that fight Prettier.                                    |
| eslint-plugin-react-hooks (dev)                       | root                          | ^7.1.1   | Hooks and React Compiler rules for app/.                                      |
| @eslint-community/eslint-plugin-eslint-comments (dev) | root                          | ^4.8.1   | Inline disables must carry a description; no blanket disables.                |
| globals (dev)                                         | root                          | ^17.12.0 | Browser/node globals for ESLint.                                              |
| prettier (dev)                                        | root                          | ^3.9.9   | The only formatter.                                                           |
| @types/bun (dev)                                      | root                          | ^1.4.2   | Bun runtime and `bun:test` types.                                             |
| @total-typescript/ts-reset (dev)                      | root                          | ^0.6.1   | `JSON.parse`/`Response.json()` return `unknown`; `.filter(Boolean)` narrows.  |
