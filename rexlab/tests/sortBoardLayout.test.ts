import { describe, expect, it } from "vitest";
import { TEXTS } from "../src/language/texts.ts";
import { sortBasketType, sortBoardGeometry, sortBoardStyle, sortBoardWidth } from "../src/sortBoardLayout.ts";
import { BASKET_EMS } from "./basketWidths.ts";

// sort-dinosaurs-board-portrait.feature's sums, with no safe areas.

// "The board stands upright": the window, the cards and baskets, the
// tray's rows and columns, a card's width, the baskets' height and
// whether the screen scrolls.
const EXAMPLES = [
  [744, 1133, 6, 2, 2, 3, 200, 445, false],
  [744, 1133, 8, 3, 2, 4, 158, 524, false],
  [744, 1133, 10, 3, 2, 5, 123, 576, false],
  [768, 1024, 6, 2, 2, 3, 200, 336, false],
  [768, 1024, 10, 3, 2, 5, 128, 460, false],
  [820, 1180, 8, 2, 2, 4, 177, 542, false],
  [1024, 1366, 10, 3, 2, 5, 179, 725, false],
  [600, 1000, 6, 2, 2, 3, 168, 360, false],
  [600, 1000, 10, 3, 3, 4, 120, 320, true],
  [600, 800, 8, 3, 2, 4, 120, 320, true]
] as const;

describe("sort's upright board geometry", () => {
  it.each(EXAMPLES)("at %i by %i, %i cards and %i baskets stand in %i rows of %i, each %i wide, the baskets %i tall, scrolling %s", (width, height, cards, baskets, rows, columns, card, tall, scrolls) => {
    const geometry = sortBoardGeometry(cards, baskets, width, height, 0, 0);
    expect([geometry.rows, geometry.columns, geometry.scrolls]).toEqual([rows, columns, scrolls]);
    expect(Math.abs(geometry.card - card)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.baskets - tall)).toBeLessThanOrEqual(1);
  });

  it("takes the side insets and the scrollbar from the width", () => {
    expect(sortBoardWidth(744, 19, 13, 16)).toBe(744 - 19 - 13 - 64 - 16);
    expect(sortBoardWidth(40, 0, 0)).toBe(0);
  });

  it("gives the stylesheet the tray's rows and columns, the cards' widest, their strip and the baskets' type", () => {
    expect(sortBoardStyle(680, 8, 3)).toEqual({
      "--upright-columns": "4", "--upright-rows": "2", "--card-by-width": "158px", "--strip": "38px", "--basket-type": `${sortBasketType(680, 3)}px`
    });
    expect(sortBoardStyle(536, 10, 3)).toMatchObject({ "--upright-columns": "4", "--upright-rows": "3", "--strip": "38px" });
    expect(sortBoardStyle(680, 6, 2)).toMatchObject({ "--card-by-width": "200px", "--strip": "46px", "--basket-type": "34px" });
  });

  it("fits every word of every basket's name across a basket at the narrowest width, in either language, at least 16 and at most the maximum", () => {
    const words = (["en", "ru"] as const).flatMap((language) => Object.values(TEXTS[language].baskets).flatMap((name) => name.split(" ")));
    for (const scrollbar of [0, 16]) {
      const width = sortBoardWidth(600, 0, 0, scrollbar);
      for (const [baskets, gap, maximum] of [[2, 24, 34], [3, 16, 28]] as const) {
        const type = sortBasketType(width, baskets);
        const across = (width - (baskets - 1) * gap) / baskets - 40;
        expect(type).toBeGreaterThanOrEqual(16);
        expect(type).toBeLessThanOrEqual(maximum);
        for (const word of words) {
          const ems = BASKET_EMS[word];
          if (ems === undefined) throw new Error(`No width for ${word}`);
          expect(type * ems, word).toBeLessThanOrEqual(across);
        }
      }
    }
    expect(sortBasketType(1000, 2)).toBe(34);
    expect(sortBasketType(1000, 3)).toBe(28);
  });
});
