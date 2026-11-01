import { describe, expect, it } from "vitest";
import { anchoredScroll, rowAnchor, type RowAnchor } from "../src/rowAnchor.ts";
import { tileColumnWidth } from "../src/tileColumns.ts";

// The home page's row with COMPARE featured: ANCIENT REPTILES and FIND
// THE PAIR, SKELETONS and DIG, SORT and CARE, then MORE COMING, in four
// columns 24 apart.
const COLUMNS = 4;
const GAP = 24;
const runOf = (column: number) => COLUMNS * column + (COLUMNS - 1) * GAP;

// 1180 by 820, landscape: the row takes four sevenths of the page's 1068
// pixels the large card and its 28-pixel gap leave, its columns 310 wide.
const LANDSCAPE = { width: 594, scrollWidth: runOf(310), columns: { column: 310, gap: GAP } };
// 820 by 1180, upright: the row runs from the page's 56-pixel padding to
// the window's right edge, its columns as narrow as the window asks.
const UPRIGHT_COLUMN = tileColumnWidth(820, COLUMNS);
const UPRIGHT = { width: 764, scrollWidth: runOf(UPRIGHT_COLUMN), columns: { column: UPRIGHT_COLUMN, gap: GAP } };

const anchorIn = (row: typeof LANDSCAPE, scroll: number) => rowAnchor({ scroll, width: row.width, scrollWidth: row.scrollWidth }, row.columns);
const scrollIn = (row: typeof LANDSCAPE, anchor: RowAnchor) => anchoredScroll(anchor, row, row.columns);
const SKELETONS_AT_EDGE = 310 + GAP;

describe("where the row of tiles stands", () => {
  it.each([
    ['"SKELETONS" exactly at its left edge', SKELETONS_AT_EDGE, 1, SKELETONS_AT_EDGE, SKELETONS_AT_EDGE],
    ['60 pixels of "SKELETONS" hidden', SKELETONS_AT_EDGE + 60, 1, SKELETONS_AT_EDGE, SKELETONS_AT_EDGE],
    ['200 of "ANCIENT REPTILES" hidden', 200, 1, SKELETONS_AT_EDGE, SKELETONS_AT_EDGE],
    ["at its end", LANDSCAPE.scrollWidth - LANDSCAPE.width, "end", UPRIGHT.scrollWidth - UPRIGHT.width, LANDSCAPE.scrollWidth - LANDSCAPE.width]
  ] as const)("with %s is kept through a turn to 820 by 1180 and back", (_, swiped, anchor, upright, back) => {
    expect(UPRIGHT_COLUMN).toBe(310);
    expect(anchorIn(LANDSCAPE, swiped)).toBe(anchor);
    expect(scrollIn(UPRIGHT, anchor)).toBe(upright);
    expect(scrollIn(LANDSCAPE, anchorIn(UPRIGHT, upright))).toBe(back);
  });

  it("works a share column out of the row's own width", () => {
    // A row 316 wide whose columns are four fifths of it short of a
    // 16-pixel gap, 240 each: 140 into it, the second column shows more
    // than half of itself, where 310-wide columns would show less.
    const share = { column: (width: number) => (width - 16) * 0.8, gap: 16 };
    const row = { width: 316, scrollWidth: 4 * 240 + 3 * 16 };
    expect([110, 140].map((scroll) => rowAnchor({ scroll, ...row }, share))).toEqual([0, 1]);
    expect(anchoredScroll(1, row, share)).toBe(256);
  });

  it("stands at the leftmost column showing at least half of itself, past any gap", () => {
    expect([155, 156, 310, 320, 334 + 154, 334 + 155, 334 + 156].map((scroll) => anchorIn(LANDSCAPE, scroll))).toEqual([0, 1, 1, 1, 1, 1, 2]);
  });

  it("stands at the start where the row does not scroll, however it was scrolled", () => {
    const whole = { width: 1344, scrollWidth: runOf(310) };

    expect([0, 40].map((scroll) => rowAnchor({ scroll, ...whole }, LANDSCAPE.columns))).toEqual([0, 0]);
    expect(anchoredScroll(0, whole, LANDSCAPE.columns)).toBe(0);
    expect(anchoredScroll("end", whole, LANDSCAPE.columns)).toBe(0);
  });

  it("stands at its end less than a pixel short of it, where its scroll is a fraction", () => {
    const end = LANDSCAPE.scrollWidth - LANDSCAPE.width;

    expect([end - 0.5, end - 1, end - 1.5].map((scroll) => anchorIn(LANDSCAPE, scroll))).toEqual(["end", "end", 2]);
  });

  it("puts a column at the left edge only as far as the row scrolls", () => {
    expect([0, 1, 2, 3].map((column) => scrollIn(UPRIGHT, column))).toEqual([0, 334, 548, 548]);
  });
});
