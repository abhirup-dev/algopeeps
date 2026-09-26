# Contracts

Shared types in `core/src/contracts/`, exported from `@elkdraw/core`. Each is a
zod schema with its type from `z.infer`, except `BackendAdapter` (a TS
interface: methods cannot be zod). JSON Schema for the data types is generated
into `core/schemas/` by `bun run --cwd elkdraw/core schemas`; a test fails when
the files are stale. Design: `canvas/docs/agent-layer-design.md` §§11–18.

| Type                                                          | Producer → consumer                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Graph` (`GraphNode`, `GraphEdge`, `GraphLabel`, `GraphPort`) | Mermaid adapter and TS builder → validate, layout, and (via `semantic()`) semantic diff and printers.  |
| `NodeMeta`, `EdgeMeta`, `ElementMeta`                         | Compiler (adapter, builder) → merge, lint, lift, backend `emit` (stored as the backend's opaque meta). |
| `LaidGraph` (`LaidNode`, `LaidEdge`, `LaidLabel`, `LaidPort`) | Layout (ELK + placer, family layouters) → merge, lint, diff, backend `emit`.                           |
| `Semantic` / `SemanticNode`                                   | `semantic()` in core → semantic diff and printers.                                                     |
| `NeutralScene` (`SceneElement`)                               | Backend `read` → lint, diff, lift, merge (reads raw meta).                                             |
| `Capabilities`                                                | Each backend → core (merge, lift, emit decisions) and the parity suite.                                |
| `BackendAdapter`                                              | `backends/excalidraw`, `backends/fake` → core apply, server.                                           |
| `MeasureRequest`, `Size`                                      | Core compile on a measurement-cache miss → backend `measure`.                                          |
| `AstPatch`                                                    | Lift and agents (MCP, CLI) → minimal-edit printer.                                                     |
| `Allow`                                                       | `@allow` in text, skeleton `allow`, later the app → `meta.allow`, read by lint.                        |
| `LintHit`                                                     | Lint → `ApplyReply.lints`, the `lint` tool, `look`.                                                    |
| `ApplyReply`                                                  | Apply → MCP and CLI adapters → agent.                                                                  |
| `FeedLine`                                                    | Apply and lift (event log) → feed formatter, `changes`, diff → agent.                                  |

## Changelog
