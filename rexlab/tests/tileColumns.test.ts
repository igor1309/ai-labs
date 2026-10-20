import { describe, expect, it } from "vitest";
import { tileColumnWidth } from "../src/tileColumns.ts";

// The row of tiles upright: from the page's 56-pixel padding to the
// window's right edge, its columns 24 apart.
const shownIn = (windowWidth: number) => windowWidth - 56;
const GAP = 24;

// How much of the column after the last whole one shows at the row's
// edge, in a row of `columns` columns `column` wide; undefined where all
// of them are whole.
function peekOf(windowWidth: number, columns: number, column: number) {
  const shown = shownIn(windowWidth);
  const whole = Math.floor((shown + GAP) / (column + GAP));
  return whole >= columns ? undefined : shown - whole * (column + GAP);
}

// The rule of home-portrait.feature: every column whole, or the next one
// showing at least 24 pixels and hiding at least 24.
const keepsTheRule = (windowWidth: number, columns: number, column: number) => {
  const peek = peekOf(windowWidth, columns, column);
  return peek === undefined || (peek >= 24 && peek <= column - 24);
};

describe("the upright home page's columns of tiles", () => {
  it.each([
    [600, 310, 210],
    [768, 310, 44],
    [744, 308, 24],
    [834, 310, 110],
    [1032, 293, 25],
    [900, 310, 176],
    [712, 292, 24],
    [1068, 305, 25],
    [1400, 310, undefined]
  ])("in a window %i wide are %i wide, the next one showing %s pixels", (windowWidth, column, peek) => {
    expect(tileColumnWidth(windowWidth, 4)).toBe(column);
    expect(peekOf(windowWidth, 4, column)).toBe(peek);
  });

  it("narrows just enough to show the last column whole where it would hide under 24 pixels", () => {
    // 3 whole columns and 298 of the fourth leave 12 of it hidden.
    expect(tileColumnWidth(1356, 4)).toBe(307);
    expect(peekOf(1356, 4, 307)).toBeUndefined();
    // A fifth column after it would peek in instead.
    expect(peekOf(1356, 5, tileColumnWidth(1356, 5))).toBe(24);
  });

  it("keeps 310 where the next column shows exactly 24 pixels or hides exactly 24", () => {
    expect(peekOf(748, 4, tileColumnWidth(748, 4))).toBe(24);
    expect(tileColumnWidth(748, 4)).toBe(310);
    expect(peekOf(1010, 4, tileColumnWidth(1010, 4))).toBe(286);
    expect(tileColumnWidth(1010, 4)).toBe(310);
  });

  it("is, in every tall window, the widest column up to 310 that keeps the rule", () => {
    const broken = Array.from({ length: 1500 - 600 + 1 }, (_, at) => 600 + at).flatMap((windowWidth) =>
      [3, 4, 5].flatMap((columns) => {
        const column = tileColumnWidth(windowWidth, columns);
        const widest = Array.from({ length: 311 }, (_, width) => 310 - width).find((width) => keepsTheRule(windowWidth, columns, width));
        return column === widest ? [] : [`${windowWidth} wide, ${columns} columns: ${column}, not ${widest}`];
      })
    );

    expect(broken).toEqual([]);
  });
});
