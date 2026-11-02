import { expect, it } from "vitest";
import { tileColumns } from "../src/tileColumns.ts";

it.each([[194.6667, 16], [182.6667, 16], [264.52, 16], [274.6667, 16], [328, 16]])("reads rendered columns %s wide and %s apart without rounding", (column, gap) => {
  const row = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "tiles-grid";
  grid.style.gridAutoColumns = `${column}px`;
  grid.style.columnGap = `${gap}px`;
  row.append(grid);
  document.body.append(row);
  try { expect(tileColumns(row).column).toBeCloseTo(column, 2); expect(tileColumns(row).gap).toBe(gap); }
  finally { row.remove(); }
});
