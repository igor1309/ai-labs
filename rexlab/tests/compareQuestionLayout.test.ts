import { describe, expect, it } from "vitest";
import { compareQuestionGeometry, compareQuestionType, compareQuestionWidth, NARROW_QUESTION, PORTRAIT_QUESTION } from "../src/compareQuestionLayout.ts";

describe("an upright question's width and type", () => {
  it.each([
    [600, 0, 0, 0, 488], [600, 0, 0, 16, 472],
    [744, 19, 13, 0, 600], [1024, 0, 0, 0, 912]
  ])("takes insets, padding and scrollbar from %i pixels (%i left, %i right, %i scrollbar)", (width, left, right, scrollbar, expected) => {
    expect(compareQuestionWidth(width, left, right, scrollbar)).toBe(expected);
  });

  it.each([
    [472, 396 / 10.12, 416 / 12.7], [488, 40, 34], [600, 40, 34], [912, 40, 34]
  ])("fits the prompt beside its symbol and names inside the pocket at %i pixels", (width, prompt, name) => {
    expect(compareQuestionType(width).prompt).toBeCloseTo(prompt, 6);
    expect(compareQuestionType(width).name).toBeCloseTo(name, 6);
  });
});

// The picture is the equal-sized contain box; each asset keeps its own aspect.
export const UPRIGHT_WINDOWS = [
  [600, 800, 234.5, 432, 150, true],
  [744, 1133, 362, 576, 277.5, false],
  [768, 1024, 307.5, 600, 223, false],
  [820, 1180, 385.5, 652, 301, false],
  [1024, 1366, 478.5, 856, 394, false]
] as const;
export const PHONE_WINDOWS = [
  [320, 568, 161.622, 240, 110, true],
  [375, 667, 167.035, 295, 110, true],
  [393, 759, 210.5, 313, 151.693, false],
  [393, 852, 257, 313, 198.193, false],
  [430, 932, 297, 350, 234.551, false]
] as const;

describe("an upright question's geometry", () => {
  const cases: readonly [typeof PORTRAIT_QUESTION | typeof NARROW_QUESTION, readonly (readonly [number, number, number, number, number, boolean])[]][] = [[PORTRAIT_QUESTION, UPRIGHT_WINDOWS], [NARROW_QUESTION, PHONE_WINDOWS]];
  for (const [sizes, windows] of cases) {
    it.each(windows)("at %i by %i has %i-pixel pockets, %i by %i picture boxes, scrolling %s", (width, height, card, pictureWidth, pictureHeight, scrolls) => {
      const geometry = compareQuestionGeometry(width, height, 0, 0, 0, sizes);
      expect(geometry.cardHeight).toBeCloseTo(card, 2);
      expect(geometry.picture.width).toBe(pictureWidth);
      expect(geometry.picture.height).toBeCloseTo(pictureHeight, 2);
      expect(geometry.scrolls).toBe(scrolls);
    });

    it("shares the remaining height equally and scrolls exactly below the picture minimum", () => {
      const width = 744;
      const type = compareQuestionType(compareQuestionWidth(width, 19, 13, 16, sizes), sizes);
      const fixed = sizes.topPadding + sizes.barHeight + sizes.barGap + sizes.promptSymbol + sizes.sandLead + sizes.rowHeight + sizes.bottomPadding + sizes.cardsGap;
      const least = sizes.minimumPicture + sizes.pocketTop + sizes.pocketBottom + sizes.nameGap + type.name * sizes.textLineHeight;
      const at = (extra: number) => compareQuestionGeometry(width, fixed + 2 * least + extra, 19, 13, 16, sizes);
      expect([-1, 0, 1].map((extra) => at(extra).scrolls)).toEqual([true, false, false]);
      expect(at(-1).picture.height).toBeCloseTo(sizes.minimumPicture, 6);
      expect(at(0).picture.height).toBeCloseTo(sizes.minimumPicture, 6);
      expect(at(1).cardHeight).toBe(least + .5);
      expect(at(1).width).toBe(width - 19 - 13 - 16 - 2 * sizes.sidePadding);
    });
  }
});
