import type { RowColumns } from "./rowAnchor.ts";

// Read the untransformed grid geometry, including fractional pixels,
// so a rotation keeps the same column even while its tiles animate.
export function tileColumns(styleFor: (element: Element) => Pick<CSSStyleDeclaration, "getPropertyValue">) {
  return (row: HTMLElement): RowColumns => {
    const grid = row.querySelector<HTMLElement>(".tiles-grid");
    if (!grid) throw new Error("No tile grid in the scrolling row");
    const style = styleFor(grid);
    return { column: Number.parseFloat(style.getPropertyValue("grid-auto-columns")), gap: Number.parseFloat(style.getPropertyValue("column-gap")) };
  };
}
