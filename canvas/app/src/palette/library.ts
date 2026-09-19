// Registers the six assets as Excalidraw Library items so the built-in
// Library panel drag-in works alongside our palette (WP-K defaults).
import type { AssetKind } from "@algopeeps/canvas-shared";
import type { ExAPI } from "../CanvasApp";
import { PALETTE_ITEMS, buildAsset } from "./assets";

export async function registerAssetLibrary(api: ExAPI): Promise<void> {
  try {
    const created = Date.now();
    const assets = PALETTE_ITEMS.filter((item) => item.kind !== "comment");
    const libraryItems = assets.map((item) => ({
      id: `canvas-asset-${item.kind}`,
      status: "published" as const,
      name: item.label,
      created,
      elements: buildAsset(item.kind as AssetKind, 0, 0),
    }));
    await api.updateLibrary({
      libraryItems,
      merge: true,
      openLibraryMenu: false,
    });
  } catch (e) {
    console.warn("canvas: updateLibrary failed", e);
  }
}
