import { describe, expect, it } from "vitest";
import { CLIMB_LEVELS, dealBoard, LARGE_LEVELS, shapeOf, type BoardLevel } from "../src/pairs/index.ts";
import { pairsBoardCardWidth, pairsBoardGeometry, pairsBoardWidth, PORTRAIT_BOARD } from "../src/pairsBoardLayout.ts";
import { presentPairsBoard } from "../src/presentation.ts";
import { fakeBodyPicture, fakeSkeletonPicture, SHIPPED_PALS } from "./support.ts";

// find-the-pair-board-portrait.feature's rules, as arithmetic.

// Each board the feature names, and its floor as the feature gives it.
const BOARDS = {
  "climb 1": [{ climbLevel: 1 }, 150],
  "climb 2": [{ climbLevel: 2 }, 150],
  "climb 3": [{ climbLevel: 3 }, 150],
  "climb 4": [{ climbLevel: 4 }, 150],
  explorer: [{ large: "explorer" }, 130],
  paleontologist: [{ large: "paleontologist" }, 120]
} as const satisfies Record<string, readonly [BoardLevel, number]>;

type BoardName = keyof typeof BOARDS;

const upright = (name: BoardName) => {
  const [level, floor] = BOARDS[name];
  const { rows, columns } = shapeOf(level);
  return { rows, columns, floor };
};

// "The board stands upright": the window, the board, the rows and columns
// it stands in, its card's width and whether the screen scrolls.
const EXAMPLES = [
  [744, 1133, "climb 1", 3, 2, 290, false],
  [744, 1133, "climb 4", 4, 3, 214, false],
  [744, 1133, "explorer", 6, 3, 138, false],
  [744, 1133, "paleontologist", 6, 4, 138, false],
  [768, 1024, "paleontologist", 6, 4, 121, false],
  [768, 1024, "explorer", 6, 3, 130, true],
  [820, 1180, "climb 2", 4, 2, 225, false],
  [1024, 1366, "paleontologist", 6, 4, 174, false],
  [600, 800, "climb 1", 3, 2, 186, false],
  [600, 800, "climb 4", 4, 3, 150, true],
  [600, 800, "paleontologist", 6, 4, 120, true]
] as const;

// The tall windows the geometry is held to besides the examples'.
const TALL_WINDOWS = [[600, 700], [600, 800], [600, 1000], [744, 1133], [768, 1024], [810, 1080], [820, 1180], [834, 1194], [1024, 1366]] as const;

describe("the upright board's width", () => {
  it.each([
    [600, 0, 0, 0, 536],
    [600, 0, 0, 16, 520],
    [744, 19, 13, 0, 648],
    [1024, 0, 0, 0, 960]
  ])("takes side insets, padding and scrollbar from a %i pixel window (%i left, %i right, %i scrollbar)", (windowWidth, left, right, scrollbar, expected) => {
    expect(pairsBoardWidth(windowWidth, left, right, scrollbar)).toBe(expected);
  });

  it.each([
    [680, 4, 158],
    [680, 3, 216],
    [536, 2, 260],
    [704, 4, 164]
  ])("leaves a card of a %i-pixel board with %i landscape rows the width, less 16 between each two, over those rows", (width, rows, card) => {
    expect(pairsBoardCardWidth(width, rows)).toBe(card);
  });
});

describe("the upright board's geometry", () => {
  it.each(EXAMPLES)("at %i by %i stands %s in %i rows of %i cards, each %i wide, scrolling %s", (width, height, name, rows, columns, card, scrolls) => {
    const board = pairsBoardGeometry(upright(name), width, height, 0, 0);
    expect([board.rows, board.columns, board.scrolls]).toEqual([rows, columns, scrolls]);
    expect(Math.abs(board.card.width - card)).toBeLessThanOrEqual(1);
    expect(board.card.height).toBeCloseTo((board.card.width * 3.2) / 3, 6);
  });

  it("turns every board on its side: R rows of C cards stand in C rows of R", () => {
    for (const shape of [...Object.values(CLIMB_LEVELS), ...Object.values(LARGE_LEVELS)]) {
      const board = pairsBoardGeometry({ ...shape, floor: 120 }, 768, 1024, 0, 0);
      expect([board.rows, board.columns]).toEqual([shape.columns, shape.rows]);
    }
  });

  it("gives a card the width or the height under the bar, whichever is less, where the floor allows", () => {
    for (const name of Object.keys(BOARDS) as BoardName[]) {
      const shape = upright(name);
      for (const [width, height] of TALL_WINDOWS) {
        const board = pairsBoardGeometry(shape, width, height, 0, 0);
        const across = board.columns * board.card.width + (board.columns - 1) * 16;
        const down = 172 + board.rows * board.card.height + (board.rows - 1) * 16;
        // The board meets the width or the height, unless the floor holds
        // its cards, and is never wider than the width at a card above it.
        if (board.card.width > shape.floor) expect(Math.min(Math.abs(across - board.width), Math.abs(down - height))).toBeLessThan(1e-6);
        expect(across).toBeLessThanOrEqual(Math.max(board.width, board.columns * shape.floor + (board.columns - 1) * 16) + 1e-6);
        expect(down <= height + 1e-6).toBe(!board.scrolls);
        expect(board.card.width).toBeGreaterThanOrEqual(shape.floor);
      }
    }
  });

  it("scrolls only below the height that leaves a card its floor, which it keeps", () => {
    const shape = upright("explorer");
    // Six rows of 130 wide, 3.2 tall to its 3, five gaps of 16 and 172.
    const exact = 172 + 6 * ((130 * 3.2) / 3) + 5 * 16;
    const [below, even, above] = [-0.5, 0, 0.5].map((more) => pairsBoardGeometry(shape, 1024, exact + more, 0, 0));
    expect([below!.scrolls, even!.scrolls, above!.scrolls]).toEqual([true, false, false]);
    expect(below!.card.width).toBe(130);
    expect(even!.card.width).toBeCloseTo(130, 6);
    expect(above!.card.width).toBeGreaterThan(130);
  });

  it.each([
    [600, 800, 0, 0, 16, 520],
    [744, 1133, 19, 13, 0, 648],
    [820, 1180, 0, 0, 16, 740]
  ] as const)("at %i by %i counts insets %i / %i and scrollbar %i in the card's width", (width, height, left, right, scrollbar, boardWidth) => {
    const shape = upright("climb 1");
    const board = pairsBoardGeometry(shape, width, height, left, right, scrollbar);
    expect(board.width).toBe(boardWidth);
    expect(board.card.width).toBeCloseTo(Math.max(150, Math.min((boardWidth - 16) / 2, ((height - 172 - 2 * 16) / 3) * (3 / 3.2))), 6);
  });

  it("keeps the landscape padding, bar and gap, 32 a side, and the cards 16 apart at 3:3.2", () => {
    expect(PORTRAIT_BOARD).toEqual({ topPadding: 40, bottomPadding: 48, sidePadding: 32, bar: 56, gap: 28, cardsGap: 16, cardRatio: 3 / 3.2 });
  });

  it("holds each board to the floor the game gives its cards", () => {
    for (const name of Object.keys(BOARDS) as BoardName[]) {
      const [level, floor] = BOARDS[name];
      const shown = presentPairsBoard(dealBoard(SHIPPED_PALS, level, () => 0), "en", fakeBodyPicture, fakeSkeletonPicture);
      expect([shown.rows, shown.columns, shown.cardFloor]).toEqual([upright(name).rows, upright(name).columns, floor]);
    }
  });
});
