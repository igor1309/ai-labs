import { describe, expect, it } from "vitest";
import { dinosaurPageGeometry, dinosaurWordsWidth, keptLines, NARROW_PAGE } from "../src/dinosaurPageLayout.ts";

describe("a portrait dinosaur page's word bands", () => {
  it.each([
    [472, { description: 5, note: 4 }],
    [519, { description: 5, note: 4 }],
    [520, { description: 4, note: 4 }],
    [599, { description: 4, note: 4 }],
    [600, { description: 4, note: 3 }],
    [655, { description: 4, note: 3 }],
    [656, { description: 3, note: 3 }]
  ])("keeps %j lines at %i pixels", (width, expected) => {
    expect(keptLines(width)).toEqual(expected);
  });

  it.each([
    [280, { description: 8, note: 8 }],
    [294, { description: 8, note: 7 }],
    [295, { description: 7, note: 7 }],
    [311, { description: 6, note: 6 }],
    [335, { description: 6, note: 6 }],
    [357, { description: 5, note: 6 }],
    [403, { description: 5, note: 5 }],
    [429, { description: 4, note: 5 }],
    [448, { description: 4, note: 4 }],
    [559, { description: 4, note: 4 }]
  ])("keeps %j lines at %i pixels on a narrow page", (width, expected) => {
    expect(keptLines(width, true)).toEqual(expected);
  });

  it.each([
    [600, 0, 0, 0, 488],
    [600, 0, 0, 16, 472],
    [744, 19, 13, 0, 600]
  ])("takes side insets, padding and scrollbar from a %i pixel window", (windowWidth, left, right, scrollbar, expected) => {
    expect(dinosaurWordsWidth(windowWidth, left, right, scrollbar)).toBe(expected);
  });

  it("takes a narrow page's 20-pixel sides", () => {
    expect([dinosaurWordsWidth(320, 0, 0, 0, NARROW_PAGE.sidePadding), dinosaurWordsWidth(393, 0, 0, 0, NARROW_PAGE.sidePadding)]).toEqual([280, 353]);
  });
});

describe("a portrait dinosaur page's geometry", () => {
  it.each([
    [600, 800, 626.08, 248, 256, 192, 38, true],
    [744, 1133, 582.62, 346.38, 385, 289, 49, false],
    [768, 1024, 543.96, 276.04, 292, 219, 51, false],
    [820, 1180, 549.03, 426.97, 476, 357, 55, false],
    [1024, 1366, 560, 602, 680, 510, 64, false]
  ] as const)("at %i by %i keeps the example's words, stage, picture, name and scrolling", (width, height, words, stage, pictureWidth, pictureHeight, name, scrolls) => {
    const page = dinosaurPageGeometry(width, height, 0, 0);
    expect(page.wordsHeight).toBeCloseTo(words, 6);
    expect(page.stageHeight).toBeCloseTo(stage, 6);
    expect(Math.abs(page.picture.width - pictureWidth)).toBeLessThanOrEqual(4);
    expect(Math.abs(page.picture.height - pictureHeight)).toBeLessThanOrEqual(4);
    expect(Math.abs(page.nameSize - name)).toBeLessThanOrEqual(1);
    expect(page.scrolls).toBe(scrolls);
  });

  it.each([
    [600, 800, 0, 0, 16, 472, 624.52, 248, 240, 180, true],
    [744, 1133, 19, 13, 0, 600, 579.5, 349.5, 368, 276, false],
    [632, 1366, 0, 0, 0, 520, 588.2, 573.8, 288, 216, false],
    [712, 1366, 0, 0, 0, 600, 579.5, 582.5, 368, 276, false]
  ] as const)("at %i by %i counts insets %i / %i and scrollbar %i in every size", (width, height, left, right, scrollbar, wordsWidth, wordsHeight, stageHeight, pictureWidth, pictureHeight, scrolls) => {
    const page = dinosaurPageGeometry(width, height, left, right, scrollbar);
    expect(page.wordsWidth).toBe(wordsWidth);
    expect(page.nameSize).toBeCloseTo(Math.min(64, wordsWidth * 0.078), 6);
    expect(page.wordsHeight).toBeCloseTo(wordsHeight, 6);
    expect(page.stageHeight).toBeCloseTo(stageHeight, 6);
    expect(page.picture).toEqual({ width: pictureWidth, height: pictureHeight });
    expect(page.scrolls).toBe(scrolls);
  });

  it("scrolls only below the height that leaves the minimum stage, keeping the whole page's words", () => {
    // At this width the words are 560 and the fixed part is 204 pixels.
    const exact = dinosaurPageGeometry(1024, 560 + 204 + 248, 0, 0);
    const below = dinosaurPageGeometry(1024, 560 + 204 + 248 - 0.5, 0, 0);
    const above = dinosaurPageGeometry(1024, 560 + 204 + 248 + 0.5, 0, 0);
    expect([below.scrolls, exact.scrolls, above.scrolls]).toEqual([true, false, false]);
    expect([below.stageHeight, exact.stageHeight, above.stageHeight]).toEqual([248, 248, 248.5]);
    expect([below.wordsHeight, exact.wordsHeight, above.wordsHeight]).toEqual([560, 560, 560]);
  });
});
