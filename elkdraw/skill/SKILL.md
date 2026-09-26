---
name: elkdraw
description: >-
  Draw and refine architecture, flow and dependency diagrams on a local
  Excalidraw canvas laid out by ELK. Use when a diagram is mostly boxes and
  arrows whose positions should come from automatic layout, when you want to
  write it as Mermaid-like text and patch it by id, or when you need lint
  feedback and cropped looks to check your own work. Tools come from the
  `elkdraw` MCP server (or the `elkdraw` CLI). For freehand drawing, exact
  manual placement, alignment or grouping, use the Excalidraw MCP instead.
---

# ELK draw

> **Phase 0: tools are stubs.** Only `status` works. Every other tool returns
> `NOT_IMPLEMENTED` with its input JSON Schema. Sections marked _TBD (phase N)_
> are filled in as each phase lands.

## Setup

- Tools: the `elkdraw` MCP server (`mcp__elkdraw__*` in Claude Code,
  `elkdraw_*` in pi). Without it, use the CLI:
  `bun elkdraw/adapters/cli/src/main.ts <tool> [flags]` (JSON on stdout).
- Registration and server start: `elkdraw/docs/REGISTER.md`.
- Call `status` first. It returns the server's `url` and `branch`.
  Give the user `url` so they can watch the canvas, and check that
  `branch` is the worktree you mean. `UNREACHABLE` means the server is not
  running: ask the user to start it (`bun run --cwd elkdraw dev`).

## ELK draw or the Excalidraw MCP

Use ELK draw when:

- the diagram is nodes and edges, and layout should be automatic;
- you want to write text (`.mmd`) and patch it by id;
- you want lint hits and crops to check your own work;
- the user edits on the canvas and you must keep their moves.

Use the Excalidraw MCP (or `excalidraw-skill`) when:

- you draw freehand shapes, sketches or annotations;
- you need exact coordinates for every element;
- you need align, distribute, group or lock;
- you need an excalidraw.com share link.

Both can run at once: ELK draw on `:3940` (or its portless URL), yctimlin's
server on `:3000`.

## The loop

Write, lint, look, fix. Repeat until lint is clean and the look matches
the intent.

1. **Write**: `apply` with `.mmd` text for a new diagram, or `add` with
   element skeletons. Later edits are `apply` patches by id. _TBD (phase 1)_:
   `.mmd` subset, skeleton schema, patch kinds.
2. **Lint**: `lint` returns `LintHit`s (overlaps, crossings, clipped labels,
   ...) for the scene or a scope. _TBD (phase 2)_: the rule list and what each
   fix looks like.
3. **Look**: `look` crops a region to a PNG with marks on element ids, so you
   check a detail without a full screenshot. Use `screenshot` for the whole
   scene. _TBD (phase 2)_: choosing `target`, `r` and `maxPx`.
4. **Fix**: patch what lint or the look showed, then lint again. `diff`
   reports what changed and which lint hits were added or fixed.
   _TBD (phase 2)_: common fixes.

Human edits: `changes` and `wait` report what the user did on the canvas.
_TBD (phase 3)_: review flow.

## Escape hatch: native Excalidraw

When ELK draw cannot express something, `export` the scene with
`format: excalidraw` and finish it with the Excalidraw MCP or the
`excalidraw-skill` (import into yctimlin's canvas). This is one way: layout
and lint do not follow the scene back. _TBD (phase 1)_: what survives the
round trip.

## Tool reference

`status`, `add`, `apply`, `get`, `describe`, `query`, `screenshot`, `export`,
`snapshot`, `clear`, `lint`, `look`, `diff`, `changes`, `wait`. Inputs and
outputs: `elkdraw/SURFACE.md`. _TBD (phase 1)_: per-tool examples.
