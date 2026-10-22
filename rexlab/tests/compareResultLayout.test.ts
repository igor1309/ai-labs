import { describe, expect, it } from "vitest";
import { compareResultGeometry, compareResultType, compareResultWidth, PORTRAIT_RESULT } from "../src/compareResultLayout.ts";

// compare-dinosaurs-result-portrait.feature's rules, as arithmetic.
describe("an upright result's width and sizes", () => {
  it.each([
    [600, 0, 0, 0, 536],
    [600, 0, 0, 16, 520],
    [744, 19, 13, 0, 648],
    [1024, 0, 0, 0, 960]
  ])("takes side insets, padding and scrollbar from a %i pixel window (%i left, %i right, %i scrollbar)", (windowWidth, left, right, scrollbar, expected) => {
    expect(compareResultWidth(windowWidth, left, right, scrollbar)).toBe(expected);
  });

  it.each([
    // The width, then the stars, the level names and the dinosaur's most.
    [520, 44.8, (500 / 3 - 12 - 7) / 9.7, 390],
    [536, 46.4, (516 / 3 - 12 - 7) / 9.7, 402],
    [600, 48, 16, 450],
    [648, 48, 16, 480],
    [960, 48, 16, 480]
  ])("at %i pixels sizes ten stars across it, the longest name across its third of the switch, and the dinosaur no wider", (width, star, levelName, heroMaximum) => {
    const type = compareResultType(width);
    expect(type.star).toBeCloseTo(star, 6);
    expect(type.levelName).toBeCloseTo(levelName, 6);
    expect(type.heroMaximum).toBeCloseTo(heroMaximum, 6);
  });

  it("fits ten stars and their nine gaps exactly while they are under their most", () => {
    for (const width of [480, 520, 536, 551]) {
      const { star } = compareResultType(width);
      expect(10 * star + 9 * PORTRAIT_RESULT.starGap).toBeCloseTo(width, 6);
    }
  });

  it("makes the switch the width, at most 648, and sizes the names by its third whatever the width", () => {
    const sizes = PORTRAIT_RESULT;
    for (const width of [520, 600, 640]) {
      const third = (Math.min(648, width) - 2 * sizes.switchPadding - 2 * sizes.switchGap) / 3;
      expect(compareResultType(width).levelName * sizes.widestLevelEms + sizes.widestLevelLetters * sizes.levelLetterSpacing + 2 * sizes.levelSidePadding).toBeLessThanOrEqual(third + 1e-9);
    }
    expect(compareResultType(2000).levelName).toBe(16);
    expect(compareResultGeometry(1024, 1366, 0, 0).levelSwitch).toEqual({ width: 648, height: 76 });
    expect(compareResultGeometry(600, 800, 0, 0).levelSwitch).toEqual({ width: 536, height: 76 });
  });
});

describe("an upright result's geometry", () => {
  it.each([
    [600, 800, 200, true],
    [744, 1133, 431, false],
    [768, 1024, 338, false],
    [820, 1180, 471, false],
    [1024, 1366, 480, false]
  ] as const)("at %i by %i keeps the example's %i-pixel dinosaur and scrolling", (width, height, dinosaur, scrolls) => {
    const result = compareResultGeometry(width, height, 0, 0);
    expect(Math.abs(result.hero.height - dinosaur)).toBeLessThanOrEqual(4);
    expect(result.hero.width).toBeCloseTo(result.hero.height * 4 / 3, 6);
    expect(result.scrolls).toBe(scrolls);
  });

  it.each([
    [600, 800, 120],
    [744, 1133, 169.95],
    [1024, 1366, 180]
  ])("at %i by %i makes the score 15%% of the window's height, at most 180", (width, height, score) => {
    expect(compareResultGeometry(width, height, 0, 0).score).toBeCloseTo(score, 6);
  });

  it("stacks the column from the celebration to the actions, six gaps of 16 apart", () => {
    const result = compareResultGeometry(744, 1133, 0, 0);
    expect(result.column).toBeCloseTo(52 + 169.95 + 48 + 48 + 48 + 76 + 80 + 6 * 16, 6);
  });

  it("gives the dinosaur the height the padding, its gap and the column leave, under its most", () => {
    for (const [width, height] of [[744, 1133], [768, 1024], [820, 1180]] as const) {
      const result = compareResultGeometry(width, height, 0, 0);
      expect(2 * 32 + result.hero.height + 20 + result.column).toBeCloseTo(height, 6);
    }
  });

  it.each([
    [600, 800, 0, 0, 16, 520],
    [744, 1133, 19, 13, 0, 648],
    [820, 1180, 0, 0, 16, 740]
  ] as const)("at %i by %i counts insets %i / %i and scrollbar %i in every size", (width, height, left, right, scrollbar, resultWidth) => {
    const result = compareResultGeometry(width, height, left, right, scrollbar);
    expect(result.width).toBe(resultWidth);
    expect(result.type).toEqual(compareResultType(resultWidth));
    expect(result.levelSwitch.width).toBe(Math.min(648, resultWidth));
    const column = 52 + result.score + result.type.star + 48 + 48 + 76 + 80 + 96;
    expect(result.column).toBeCloseTo(column, 6);
    expect(result.hero.height).toBeCloseTo(Math.max(200, Math.min(480, resultWidth * 0.75, height - 84 - column)), 6);
  });

  it("scrolls only below the height that leaves the dinosaur 200 pixels, which it keeps", () => {
    // At 1024 wide the column is 448 pixels and the score's 15% of the
    // height, and the padding and the dinosaur's gap 84 more.
    const at = (height: number) => compareResultGeometry(1024, height, 0, 0);
    const exact = (84 + 200 + 448) / 0.85;
    const [below, even, above] = [-0.5, 0, 0.5].map((more) => at(exact + more));
    expect(even!.score).toBeCloseTo(0.15 * exact, 6);
    expect([below!.scrolls, even!.scrolls, above!.scrolls]).toEqual([true, false, false]);
    expect(below!.hero.height).toBe(200);
    expect(even!.hero.height).toBeCloseTo(200, 6);
    expect(above!.hero.height).toBeGreaterThan(200);
  });

  it.each([
    [1024, 2000, 480],
    [600, 2000, 402]
  ])("at %i by %i keeps the dinosaur within 480 tall and the width wide", (width, height, dinosaur) => {
    const { hero, scrolls } = compareResultGeometry(width, height, 0, 0);
    expect([hero.height, scrolls]).toEqual([dinosaur, false]);
    expect(hero.width).toBeLessThanOrEqual(width - 64);
  });
});
