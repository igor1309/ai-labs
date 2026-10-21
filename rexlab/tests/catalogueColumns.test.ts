import { describe, expect, it } from "vitest";
import { catalogueColumns, type SideInsets } from "../src/catalogueColumns.ts";

const NO_INSETS: SideInsets = { left: 0, right: 0 };

// The list's row: the window's width less each side's inset, or what lies
// beyond the 1440 cap where that is more, and the list's 56-pixel padding
// on each side; its cards 20 apart.
const rowIn = (windowWidth: number, { left, right }: SideInsets) => {
  const beyond = windowWidth / 2 - 720;
  return windowWidth - Math.max(left, beyond) - Math.max(right, beyond) - 2 * 56;
};
const cardIn = (windowWidth: number, columns: number, insets = NO_INSETS) => (rowIn(windowWidth, insets) - (columns - 1) * 20) / columns;

describe("the catalogue's cards in a row", () => {
  it.each([
    [600, 2, 234],
    [744, 2, 306],
    [768, 2, 318],
    [810, 3, 219],
    [820, 3, 223],
    [1024, 4, 213],
    [1400, 4, 307]
  ])("in a tall window %i wide are %i, each %i wide", (windowWidth, columns, card) => {
    expect(catalogueColumns(windowWidth, "tall", NO_INSETS)).toBe(columns);
    expect(Math.abs(cardIn(windowWidth, columns) - card)).toBeLessThan(1);
  });

  it.each([
    [1180, 252],
    [1024, 213]
  ])("in a landscape window %i wide are four, each %i wide", (windowWidth, card) => {
    expect(catalogueColumns(windowWidth, "wide", NO_INSETS)).toBe(4);
    expect(cardIn(windowWidth, 4)).toBe(card);
  });

  it("are four in a short landscape window and under the picture of a tall-narrow one", () => {
    expect(catalogueColumns(1024, "wide-short", NO_INSETS)).toBe(4);
    expect(catalogueColumns(393, "tall-narrow", NO_INSETS)).toBe(4);
  });

  it("go up by one exactly where a card of 213 fits one more, 791 wide for three and 1024 for four", () => {
    expect([790, 791, 1023, 1024].map((windowWidth) => catalogueColumns(windowWidth, "tall", NO_INSETS))).toEqual([2, 3, 3, 4]);
    expect([cardIn(791, 3), cardIn(1024, 4)]).toEqual([213, 213]);
  });

  it("count the side insets, or the cap where it takes more", () => {
    expect(catalogueColumns(791, "tall", { left: 1, right: 0 })).toBe(2);
    expect(catalogueColumns(1060, "tall", { left: 18, right: 18 })).toBe(4);
    expect(catalogueColumns(1060, "tall", { left: 19, right: 18 })).toBe(3);
    // 1500 wide, the cap leaves 30 on each side, more than the insets.
    expect(rowIn(1500, { left: 20, right: 20 })).toBe(1440 - 112);
    expect(catalogueColumns(1500, "tall", { left: 20, right: 20 })).toBe(4);
  });

  it("are, in every tall window, the most up to four that keep a card at least 213 wide", () => {
    const broken = Array.from({ length: 1600 - 600 + 1 }, (_, at) => 600 + at).flatMap((windowWidth) => {
      const columns = catalogueColumns(windowWidth, "tall", NO_INSETS);
      const most = [4, 3, 2, 1].find((count) => cardIn(windowWidth, count) >= 213);
      return columns === most ? [] : [`${windowWidth} wide: ${columns}, not ${most}`];
    });

    expect(broken).toEqual([]);
  });
});
