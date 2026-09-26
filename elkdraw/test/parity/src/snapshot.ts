// The parity harness: a fixture goes through a backend and comes back as the
// NeutralScene that lint, diff and lift see. Tests snapshot the result, so any
// change fails until `bun run --cwd test/parity update-snapshots` is run.
import type { BackendAdapter, LaidGraph, NeutralScene } from "@elkdraw/core";

export async function sceneOf<Scene>(
  backend: BackendAdapter<Scene>,
  graph: LaidGraph,
): Promise<NeutralScene> {
  if (backend.read === undefined)
    throw new Error(`${backend.id} cannot read back`);
  return backend.read(backend.emit(graph));
}
