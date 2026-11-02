import type { RowColumns } from "./rowAnchor.ts";

// Read the untransformed grid geometry, including fractional pixels,
// so a rotation keeps the same column even while its tiles animate.
export function tileColumns(row: HTMLElement): RowColumns {
  const grid = row.querySelector<HTMLElement>(".tiles-grid");
  if (!grid) throw new Error("No tile grid in the scrolling row");
  const style = getComputedStyle(grid);
  return { column: Number.parseFloat(style.gridAutoColumns), gap: Number.parseFloat(style.columnGap) };
}
