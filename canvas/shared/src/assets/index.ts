// §6 asset generators. One file per kind; generate() dispatches.
import * as array from "./array.js";
import * as linkedList from "./linkedList.js";
import * as binaryTree from "./binaryTree.js";
import * as stackFrames from "./stackFrames.js";
import * as stateTable from "./stateTable.js";
import * as hashMap from "./hashMap.js";
import type { AgentElement } from "../types.js";
import type { AssetBase } from "./common.js";

export type AssetKind =
  | "array"
  | "linked_list"
  | "binary_tree"
  | "stack_frames"
  | "state_table"
  | "hash_map";

/** Union of all per-kind params. */
export interface AssetParams extends AssetBase {
  values?: (string | number | null)[];
  pointers?: { label: string; index: number }[];
  showIndex?: boolean;
  doubly?: boolean;
  frames?: {
    fn: string;
    args?: (string | number)[];
    locals?: (string | number)[];
  }[];
  columns?: string[];
  rows?: string[][];
  entries?: { key: string | number; value: string | number }[];
  buckets?: number;
}

export function generate(
  kind: AssetKind | (string & {}), // & {} keeps literal autocompletion while accepting any string (validated below)
  params: AssetParams,
): { elements: AgentElement[]; groupId: string } {
  switch (kind) {
    case "array":
      return array.generate(params as array.ArrayParams);
    case "linked_list":
      return linkedList.generate(params as linkedList.LinkedListParams);
    case "binary_tree":
      return binaryTree.generate(params as binaryTree.BinaryTreeParams);
    case "stack_frames":
      return stackFrames.generate(params as stackFrames.StackFramesParams);
    case "state_table":
      return stateTable.generate(params as stateTable.StateTableParams);
    case "hash_map":
      return hashMap.generate(params as hashMap.HashMapParams);
    default:
      throw new Error(`unknown asset kind: ${String(kind)}`);
  }
}
