// §6 asset: state_table — header row + data rows, 120×40 cells, gray header.
import type { AgentElement } from "../types.js";
import { base, finalize, shape, type AssetBase } from "./common.js";

const COL_W = 120;
const ROW_H = 40;

export interface StateTableParams extends AssetBase {
  columns: string[];
  rows: string[][];
}

export function generate(p: StateTableParams): {
  elements: AgentElement[];
  groupId: string;
} {
  const b = base(p, "state_table");
  const { columns, rows } = p;
  if (
    !Array.isArray(columns) ||
    columns.length === 0 ||
    columns.some((c) => typeof c !== "string")
  ) {
    throw new Error(
      "state_table: columns must be a non-empty array of strings",
    );
  }
  if (!Array.isArray(rows)) {
    throw new Error("state_table: rows must be an array of string arrays");
  }

  const els: AgentElement[] = columns.map((c, j) =>
    shape("rectangle", b.x + j * COL_W, b.y, COL_W, ROW_H, c, "#e9ecef"),
  );
  rows.forEach((row, r) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new Error(
        "state_table: each row must have exactly columns.length cells",
      );
    }
    columns.forEach((_, j) => {
      els.push(
        shape(
          "rectangle",
          b.x + j * COL_W,
          b.y + (r + 1) * ROW_H,
          COL_W,
          ROW_H,
          String(row[j]),
        ),
      );
    });
  });
  return finalize("state_table", b.name, b.owner ?? "agent", els);
}
