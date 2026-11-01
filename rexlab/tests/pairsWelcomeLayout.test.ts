import { describe, expect, it } from "vitest";
import { compareResultType } from "../src/compareResultLayout.ts";
import { levelNameSize, UPRIGHT_LEVEL_SWITCH } from "../src/levelSwitchLayout.ts";
import { pairsWelcomeGeometry, pairsWelcomeType, pairsWelcomeWidth, PORTRAIT_WELCOME } from "../src/pairsWelcomeLayout.ts";

// find-the-pair-welcome-portrait.feature's rules, as arithmetic.
describe("the upright welcome's width and type", () => {
  it.each([
    [600, 0, 0, 0, 536],
    [600, 0, 0, 16, 520],
    [744, 19, 13, 0, 648],
    [1024, 0, 0, 0, 960]
  ])("takes side insets, padding and scrollbar from a %i pixel window (%i left, %i right, %i scrollbar)", (windowWidth, left, right, scrollbar, expected) => {
    expect(pairsWelcomeWidth(windowWidth, left, right, scrollbar)).toBe(expected);
  });

  it.each([
    // The width, then the title's type.
    [520, 412 / 8.1],
    [536, 428 / 8.1],
    [628, 64],
    [680, 64],
    [960, 64]
  ])("at %i pixels sizes the longer title to fit beside its 88 mark and 20 gap, at most 64", (width, title) => {
    expect(pairsWelcomeType(width).title).toBeCloseTo(title, 6);
  });

  it("gives the title 52.8 at 600 wide, 50.9 with a 16 scrollbar, and 64 from 744", () => {
    expect(pairsWelcomeType(pairsWelcomeWidth(600, 0, 0)).title).toBeCloseTo(52.8, 1);
    expect(pairsWelcomeType(pairsWelcomeWidth(600, 0, 0, 16)).title).toBeCloseTo(50.9, 1);
    for (const window of [744, 768, 820, 1024]) expect(pairsWelcomeType(pairsWelcomeWidth(window, 0, 0)).title).toBe(64);
  });

  it("fits the title in the column, at most 648, whatever the width", () => {
    const sizes = PORTRAIT_WELCOME;
    for (const width of [480, 520, 536, 600, 648, 960, 2000]) {
      const { title } = pairsWelcomeType(width);
      expect(sizes.mark + sizes.markGap + sizes.widestTitleEms * title).toBeLessThanOrEqual(Math.min(648, width) + 1e-9);
      expect(title).toBeLessThanOrEqual(64);
    }
  });

  it("sizes the level names by the one switch rule, as the quiz's result does, over the column's width", () => {
    for (const width of [480, 520, 536, 600, 648, 960]) {
      expect(pairsWelcomeType(width).levelName).toBe(levelNameSize(Math.min(648, width)));
      expect(pairsWelcomeType(width).levelName).toBe(compareResultType(width).levelName);
    }
  });
});

describe("the upright level switch's names", () => {
  it.each([
    // The switch's width, then the names' type.
    [500, ((500 - 20) / 3 - 12 - 7) / 9.7],
    [520, ((520 - 20) / 3 - 12 - 7) / 9.7],
    [536, ((536 - 20) / 3 - 12 - 7) / 9.7],
    [648, 16]
  ])("at %i pixels fits the longest name across its third, at most 16", (width, size) => {
    expect(levelNameSize(width)).toBeCloseTo(size, 6);
  });

  it("leaves the longest name its third of the switch, its padding and gaps taken", () => {
    const sizes = UPRIGHT_LEVEL_SWITCH;
    for (const width of [480, 520, 600, 640]) {
      const third = (width - 2 * sizes.padding - 2 * sizes.gap) / 3;
      expect(levelNameSize(width) * sizes.widestEms + sizes.widestLetters * sizes.letterSpacing + 2 * sizes.sidePadding).toBeLessThanOrEqual(third + 1e-9);
    }
    expect(levelNameSize(2000)).toBe(16);
  });
});

describe("the upright welcome's geometry", () => {
  it.each([
    [600, 700, 120, true],
    [600, 800, 135, false],
    [744, 1133, 218, false],
    [768, 1024, 225, false],
    [820, 1180, 242, false],
    [1024, 1366, 280, false]
  ] as const)("at %i by %i keeps the example's %i-pixel card and scrolling", (width, height, card, scrolls) => {
    const welcome = pairsWelcomeGeometry(width, height, 0, 0);
    expect(Math.abs(welcome.card.width - card)).toBeLessThanOrEqual(4);
    expect(welcome.card.height).toBeCloseTo(welcome.card.width * 4 / 3, 6);
    expect(welcome.scrolls).toBe(scrolls);
  });

  it("stacks the title beside its mark, the chips, the switch and PLAY, three gaps of 28 apart", () => {
    const welcome = pairsWelcomeGeometry(744, 1133, 0, 0);
    expect(welcome.levelSwitch).toEqual({ width: 648, height: 76 });
    expect(welcome.stack).toBe(88 + 64 + 76 + 104 + 3 * 28);
    expect(welcome.stack).toBe(416);
  });

  it("makes the column the width, at most 648", () => {
    expect([600, 744, 1024].map((width) => pairsWelcomeGeometry(width, 1000, 0, 0).column)).toEqual([536, 648, 648]);
    expect(pairsWelcomeGeometry(600, 1000, 0, 0, 16).levelSwitch).toEqual({ width: 520, height: 76 });
  });

  it("gives a card the height the padding, the bar, its gap, the cards' gap and the stack leave, where its share and maximum allow", () => {
    for (const [width, height] of [[600, 800], [820, 900], [1024, 900]] as const) {
      const welcome = pairsWelcomeGeometry(width, height, 0, 0);
      expect(88 + 56 + 28 + welcome.card.height + 32 + welcome.stack).toBeCloseTo(height, 6);
    }
  });

  it.each([
    [600, 800, 0, 0, 16, 520],
    [744, 1133, 19, 13, 0, 648],
    [820, 1180, 0, 0, 16, 740]
  ] as const)("at %i by %i counts insets %i / %i and scrollbar %i in every size", (width, height, left, right, scrollbar, welcomeWidth) => {
    const welcome = pairsWelcomeGeometry(width, height, left, right, scrollbar);
    expect(welcome.width).toBe(welcomeWidth);
    expect(welcome.type).toEqual(pairsWelcomeType(welcomeWidth));
    expect(welcome.card.width).toBeCloseTo(Math.max(120, Math.min(280, 0.32 * welcomeWidth, 0.75 * (height - 620))), 6);
  });

  it("scrolls only below the height that leaves a card 120 wide, which it keeps", () => {
    const at = (height: number) => pairsWelcomeGeometry(1024, height, 0, 0);
    const exact = 620 + 160;
    const [below, even, above] = [-0.5, 0, 0.5].map((more) => at(exact + more));
    expect([below!.scrolls, even!.scrolls, above!.scrolls]).toEqual([true, false, false]);
    expect(below!.card.width).toBe(120);
    expect(even!.card.width).toBeCloseTo(120, 6);
    expect(above!.card.width).toBeGreaterThan(120);
  });

  it.each([
    [1024, 2000, 280],
    [600, 2000, 0.32 * 536]
  ])("at %i by %i keeps a card within 280 wide and its 32%% of the width", (width, height, card) => {
    const welcome = pairsWelcomeGeometry(width, height, 0, 0);
    expect([welcome.card.width, welcome.scrolls]).toEqual([card, false]);
  });
});
