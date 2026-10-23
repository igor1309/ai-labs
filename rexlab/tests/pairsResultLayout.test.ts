import { describe, expect, it } from "vitest";
import { CLIMB_LEVELS, LARGE_LEVELS, shapeOf, type BoardLevel } from "../src/pairs/index.ts";
import { pairsResultColumns, pairsResultGeometry, pairsResultType, pairsResultWidth, PORTRAIT_PAIRS_RESULT, type UprightResult } from "../src/pairsResultLayout.ts";

// find-the-pair-result-portrait.feature's rules, as arithmetic.

// Each board the feature names.
const BOARDS = {
  "climb 1": { climbLevel: 1 },
  "climb 2": { climbLevel: 2 },
  explorer: { large: "explorer" },
  paleontologist: { large: "paleontologist" }
} as const satisfies Record<string, BoardLevel>;

// "The result stands upright": the window, the board, its card's height
// and whether the screen scrolls, the badges on one row.
const EXAMPLES = [
  [600, 800, "climb 1", 157, false],
  [600, 800, "climb 2", 112, false],
  [600, 800, "paleontologist", 90, true],
  [744, 1133, "climb 2", 254, false],
  [744, 1133, "paleontologist", 119, false],
  [768, 1024, "explorer", 133, false],
  [768, 1024, "paleontologist", 96, false],
  [820, 1180, "explorer", 177, false],
  [1024, 1366, "paleontologist", 174, false]
] as const;

// Every number of dinosaurs a board deals.
const COUNTS = [...new Set([...Object.values(CLIMB_LEVELS), ...Object.values(LARGE_LEVELS)].map(({ pairs }) => pairs))];

// The tall windows the geometry is held to besides the examples'.
const TALL_WINDOWS = [[600, 640], [600, 700], [600, 800], [600, 1000], [744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366]] as const;

// A card's landscape shape on a card `width` wide: its picture at 4:3 over
// its name, the name 8 from each edge, its type the card's width less
// those 16 over 13 ems, at most 18, on a 1.25 line.
const landscapeShape = (width: number) => (width * 3) / 4 + 16 + 1.25 * Math.min(18, (width - 16) / 13);

const resultOf = (name: keyof typeof BOARDS, badgeRows: UprightResult["badgeRows"] = 1): UprightResult => ({ count: shapeOf(BOARDS[name]).pairs, badgeRows });

describe("the upright result's width", () => {
  it.each([
    [600, 0, 0, 0, 536],
    [600, 0, 0, 16, 520],
    [744, 19, 13, 0, 648],
    [1024, 0, 0, 0, 960]
  ])("takes side insets, padding and scrollbar from a %i pixel window (%i left, %i right, %i scrollbar)", (windowWidth, left, right, scrollbar, expected) => {
    expect(pairsResultWidth(windowWidth, left, right, scrollbar)).toBe(expected);
  });

  it("stands every board's dinosaurs three across, two across for four", () => {
    expect(COUNTS.map((count) => [count, pairsResultColumns(count)])).toEqual(COUNTS.map((count) => [count, count === 4 ? 2 : 3]));
  });
});

describe("the upright result's sizes", () => {
  it.each([
    [536, 3, 168],
    [536, 4, 260],
    [520, 12, (520 - 32) / 3],
    [680, 12, (648 - 32) / 3],
    [960, 4, (648 - 16) / 2]
  ])("caps a card on a %i-pixel result of %i dinosaurs %f wide at its landscape shape", (width, count, card) => {
    expect(pairsResultType(width, count).cardMaximum).toBeCloseTo(landscapeShape(card), 9);
  });

  it("gives the actions the largest type at most 26 that lets the three, their symbols, gaps and sides fit the width", () => {
    for (const width of [500, 520, 536, 600, 648, 680, 700, 960]) {
      const { action } = pairsResultType(width, 12);
      // Three symbols of 28, each 8 from its word and 12 from each side,
      // 10 between the buttons, and the words' 13.6 ems.
      const across = 3 * (28 + 8 + 24) + 2 * 10 + 13.6 * action;
      expect(action).toBeLessThanOrEqual(26);
      if (action < 26) expect(across).toBeCloseTo(width, 9);
      else expect(across).toBeLessThanOrEqual(width);
    }
    expect([pairsResultType(536, 3).action, pairsResultType(520, 3).action].every((action) => action >= 22)).toBe(true);
  });
});

describe("the upright result's geometry", () => {
  it.each(EXAMPLES)("at %i by %i stands %s's cards each %i tall, scrolling %s", (width, height, name, card, scrolls) => {
    const result = pairsResultGeometry(resultOf(name), width, height, 0, 0);
    expect(Math.abs(result.card.height - card)).toBeLessThanOrEqual(4);
    expect(result.scrolls).toBe(scrolls);
  });

  it("stacks the badges, the tries beside the hand, the stars, WELL DONE!, the best and the actions, 16 apart", () => {
    for (const [width, height] of TALL_WINDOWS) {
      const tries = Math.min(180, 0.15 * height);
      const rest = Math.max(tries, 96) + 48 + 48 + 48 + 72 + 4 * 16;
      const columns = ([0, 1, 2] as const).map((badgeRows) => pairsResultGeometry({ count: 12, badgeRows }, width, height, 0, 0));
      expect(columns.map(({ tries: shown }) => shown)).toEqual([tries, tries, tries]);
      expect(columns.map(({ column }) => column)).toEqual([rest, 60 + 16 + rest, 60 + 16 + 60 + 16 + rest]);
    }
  });

  it("shares the height the column leaves between the rows, each card within its landscape shape and at least 90", () => {
    for (const count of COUNTS) {
      for (const badgeRows of [0, 1, 2] as const) {
        for (const [width, height] of TALL_WINDOWS) {
          const result = pairsResultGeometry({ count, badgeRows }, width, height, 0, 0);
          expect([result.columns, result.rows]).toEqual([pairsResultColumns(count), Math.ceil(count / pairsResultColumns(count))]);
          expect(result.card.width).toBeCloseTo((Math.min(648, result.width) - (result.columns - 1) * 16) / result.columns, 9);
          const down = 32 + result.rows * result.card.height + (result.rows - 1) * 16 + 20 + result.column + 32;
          // The cards meet the height unless their landscape shape or
          // their least holds them.
          const bounded = [result.type.cardMaximum, 90].some((bound) => Math.abs(result.card.height - bound) < 1e-9);
          if (!bounded) expect(down).toBeCloseTo(height, 9);
          expect(result.card.height).toBeLessThanOrEqual(Math.max(90, result.type.cardMaximum) + 1e-9);
          expect(result.card.height).toBeGreaterThanOrEqual(90);
          expect(down <= height + 1e-9).toBe(!result.scrolls);
        }
      }
    }
  });

  it("scrolls only below the height that leaves a card 90, which it keeps", () => {
    const result: UprightResult = { count: 12, badgeRows: 1 };
    // Four rows of 90, three gaps of 16, the padding, the gap above the
    // column and the column, its tries 15% of the height.
    const exact = (64 + 20 + 4 * 90 + 3 * 16 + 60 + 144 + 72 + 80) / 0.85;
    const [below, even, above] = [-0.5, 0, 0.5].map((more) => pairsResultGeometry(result, 744, exact + more, 0, 0));
    expect([below!.scrolls, even!.scrolls, above!.scrolls]).toEqual([true, false, false]);
    expect(below!.card.height).toBe(90);
    expect(even!.card.height).toBeCloseTo(90, 9);
    expect(above!.card.height).toBeGreaterThan(90);
  });

  it.each([
    [600, 800, 0, 0, 16, 520],
    [744, 1133, 19, 13, 0, 648],
    [820, 1180, 0, 0, 16, 740]
  ] as const)("at %i by %i counts insets %i / %i and scrollbar %i in the cards' width and the actions' type", (width, height, left, right, scrollbar, resultWidth) => {
    const result = pairsResultGeometry({ count: 3, badgeRows: 1 }, width, height, left, right, scrollbar);
    expect(result.width).toBe(resultWidth);
    expect(result.card.width).toBeCloseTo((Math.min(648, resultWidth) - 32) / 3, 9);
    expect(result.type).toEqual(pairsResultType(resultWidth, 3));
  });

  it("keeps the result's padding, gaps and parts' sizes", () => {
    expect(PORTRAIT_PAIRS_RESULT).toEqual({
      padding: 32, foundGap: 20, gap: 16, foundMaximum: 648, cardsGap: 16, cardMinimum: 90, artRatio: 4 / 3,
      namePadding: 8, nameMaximum: 18, nameEms: 13, nameLineHeight: 1.25, badge: 60, triesShare: 0.15, triesMaximum: 180,
      hand: 96, stars: 48, title: 48, best: 48, actions: 72, actionMaximum: 26, actionIcon: 28, actionInnerGap: 8,
      actionSidePadding: 12, actionsGap: 10, actionsEms: 13.6
    });
  });
});
