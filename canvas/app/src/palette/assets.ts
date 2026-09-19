// Palette catalogue: the six §6 asset kinds plus the comment tool, with the
// defaults from the WP-K/WP-Q briefs. Glyphs are inline SVG paths (24×24
// viewBox, stroke = currentColor) so there is no icon dependency.
import {
  generate,
  type AssetKind,
  type AssetParams,
} from "@algopeeps/canvas-shared";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { toSkeletons } from "../CanvasApp";

export const ASSET_MIME = "application/x-canvas-asset";

export type PaletteKind = AssetKind | "comment";

export type PaletteItem = {
  kind: PaletteKind;
  label: string;
  /** SVG inner markup, 24×24 viewBox, stroke currentColor. */
  glyph: string;
};

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    kind: "array",
    label: "Array",
    glyph:
      '<rect x="2" y="8" width="5" height="8"/><rect x="9.5" y="8" width="5" height="8"/><rect x="17" y="8" width="5" height="8"/>',
  },
  {
    kind: "linked_list",
    label: "Linked list",
    glyph:
      '<rect x="2" y="9" width="6" height="6" rx="1"/><rect x="16" y="9" width="6" height="6" rx="1"/><path d="M8 12h8M13.5 9.5 16 12l-2.5 2.5"/>',
  },
  {
    kind: "binary_tree",
    label: "Binary tree",
    glyph:
      '<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M10.5 7 7.3 15.8M13.5 7l3.2 8.8"/>',
  },
  {
    kind: "stack_frames",
    label: "Stack frames",
    glyph:
      '<rect x="4" y="3" width="16" height="5" rx="1"/><rect x="4" y="9.5" width="16" height="5" rx="1"/><rect x="4" y="16" width="16" height="5" rx="1"/>',
  },
  {
    kind: "state_table",
    label: "State table",
    glyph:
      '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.5h18M3 15h18M9 4v16M15 4v16"/>',
  },
  {
    kind: "hash_map",
    label: "Hash map",
    glyph:
      '<rect x="2" y="5" width="6" height="5"/><rect x="2" y="14" width="6" height="5"/><rect x="13" y="5" width="9" height="5" rx="1"/><rect x="13" y="14" width="9" height="5" rx="1"/><path d="M8 7.5h5M8 16.5h5"/>',
  },
  {
    kind: "comment",
    label: "Comment",
    glyph:
      '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"/><path d="M8 8h8M8 11.5h5"/>',
  },
];

/** Brief defaults per asset kind. */
export function defaultParams(kind: AssetKind): Omit<AssetParams, "x" | "y"> {
  switch (kind) {
    case "array":
      return { name: "arr", values: [1, 2, 3, 4, 5], showIndex: true };
    case "linked_list":
      return { name: "list", values: [1, 2, 3] };
    case "binary_tree":
      return { name: "tree", values: [1, 2, 3, 4, 5, 6, 7] };
    case "stack_frames":
      return {
        name: "stack",
        frames: [
          { fn: "main", args: [] },
          { fn: "solve", args: ["n"] },
          { fn: "helper", args: ["i", "j"] },
        ],
      };
    case "state_table":
      return {
        name: "state",
        columns: ["i", "j", "sum"],
        rows: [
          ["0", "1", "3"],
          ["0", "2", "4"],
          ["1", "2", "5"],
        ],
      };
    case "hash_map":
      return {
        name: "map",
        buckets: 4,
        entries: [
          { key: "a", value: 1 },
          { key: "b", value: 2 },
          { key: "c", value: 3 },
        ],
      };
  }
}

/** Real Excalidraw elements for a human-stamped asset at scene (x, y). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Excalidraw elements at the loose ExAPI boundary
export function buildAsset(kind: AssetKind, x: number, y: number): any[] {
  const { elements } = generate(kind, {
    ...defaultParams(kind),
    x,
    y,
    owner: "human",
  });
  return convertToExcalidrawElements(toSkeletons(elements), {
    regenerateIds: true,
  });
}
