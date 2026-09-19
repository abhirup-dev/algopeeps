import { useState } from "react";
import "./palette.css";
import { ASSET_MIME, PALETTE_ITEMS, type PaletteKind } from "./assets";

const OPEN_KEY = "canvas.palette.open";

export default function AssetPalette({
  commentActive,
  shifted = false,
  onPick,
}: {
  commentActive: boolean;
  /** True while Excalidraw's properties panel occupies the left edge. */
  shifted?: boolean;
  /** Click on a tile: stamp the asset at the viewport centre / toggle comment tool. */
  onPick: (kind: PaletteKind) => void;
}) {
  const [open, setOpen] = useState(
    () => localStorage.getItem(OPEN_KEY) !== "false",
  );
  const toggle = () => {
    setOpen((current) => {
      localStorage.setItem(OPEN_KEY, String(!current));
      return !current;
    });
  };

  if (!open) {
    return (
      <div
        className={`asset-palette is-collapsed${shifted ? " is-shifted" : ""}`}
        aria-label="Asset palette"
      >
        <button
          type="button"
          className="asset-palette-tab"
          title="Show asset palette"
          aria-label="Show asset palette"
          onClick={toggle}
        >
          ▸
        </button>
      </div>
    );
  }

  return (
    <div
      className={`asset-palette${shifted ? " is-shifted" : ""}`}
      aria-label="Asset palette"
    >
      {PALETTE_ITEMS.map((item) => (
        <button
          key={item.kind}
          type="button"
          className={`asset-tile${item.kind === "comment" && commentActive ? " is-active" : ""}`}
          data-kind={item.kind}
          data-label={item.label}
          title={item.label}
          aria-label={item.label}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(ASSET_MIME, item.kind);
            event.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onPick(item.kind)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: item.glyph }}
          />
        </button>
      ))}
      <button
        type="button"
        className="asset-palette-tab"
        title="Hide asset palette"
        aria-label="Hide asset palette"
        onClick={toggle}
      >
        ◂
      </button>
    </div>
  );
}
