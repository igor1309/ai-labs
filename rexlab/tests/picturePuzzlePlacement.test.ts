import { describe, expect, it } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { cutPicture, pictureDropFits, type PicturePiece } from "../src/picturePuzzle/index.ts";
import { pictureBoardLayout } from "../src/picturePuzzleLayout.ts";

// CSS pixels, deliberately translated from the scene's origin and scaled.
const BOARD = { x: 100, y: 80, width: 768, height: 576 };

describe.each(AGE_LEVELS)("%s picture placement", (level) => {
  const cut = cutPicture(level);
  const width = BOARD.width / cut.columns;
  const height = BOARD.height / cut.rows;
  const fits = (piece: PicturePiece, x: number, y: number) => pictureDropFits(piece, cut, BOARD, { x: x + BOARD.x, y: y + BOARD.y });

  it("accepts every home, gives shared boundaries right/down, and rejects every other slot even within tolerance", () => {
    for (const piece of cut.pieces) {
      for (const slot of cut.pieces) {
        expect(fits(piece, slot.column * width, slot.row * height)).toBe(slot.id === piece.id);
        expect(fits(piece, (slot.column + 0.5) * width, (slot.row + 0.5) * height)).toBe(slot.id === piece.id);
        expect(fits(piece, slot.column * width + 1, slot.row * height + 1)).toBe(slot.id === piece.id);
        expect(fits(piece, (slot.column + 1) * width - 1, (slot.row + 1) * height - 1)).toBe(slot.id === piece.id);
      }
    }
  });

  it("accepts rectangular outside-edge and corner forgiveness through exactly 24px, without expanding inner slots", () => {
    for (const piece of cut.pieces) {
      const left = piece.column * width;
      const top = piece.row * height;
      for (const beyond of [20, 24, 25]) {
        const accepted = beyond <= 24;
        expect(fits(piece, -beyond, top + height / 2)).toBe(accepted && piece.column === 0);
        expect(fits(piece, BOARD.width + beyond, top + height / 2)).toBe(accepted && piece.column === cut.columns - 1);
        expect(fits(piece, left + width / 2, -beyond)).toBe(accepted && piece.row === 0);
        expect(fits(piece, left + width / 2, BOARD.height + beyond)).toBe(accepted && piece.row === cut.rows - 1);
      }
      for (const dx of [20, 24, 25]) for (const dy of [20, 24, 25]) {
        for (const right of [false, true]) for (const bottom of [false, true]) {
          expect(fits(piece, right ? BOARD.width + dx : -dx, bottom ? BOARD.height + dy : -dy)).toBe(
            dx <= 24 && dy <= 24 && piece.column === (right ? cut.columns - 1 : 0) && piece.row === (bottom ? cut.rows - 1 : 0)
          );
        }
      }
    }
  });

  it("rejects absent geometry and nonfinite input", () => {
    const piece = cut.pieces[0]!;
    for (const point of [{ x: NaN, y: 100 }, { x: 100, y: Infinity }]) expect(pictureDropFits(piece, cut, BOARD, point)).toBe(false);
    expect(pictureDropFits(piece, cut, { ...BOARD, width: 0 }, { x: 100, y: 100 })).toBe(false);
  });
});

it.each(AGE_LEVELS)("fits the %s board and four-piece tray at minimum 48px targets in landscape", (level) => {
  const cut = cutPicture(level);
  for (const [width, height] of [[1133, 744], [1024, 690], [1440, 900], [960, 600]]) {
    const room = { width: width! - 48, height: height! - 136 };
    const board = pictureBoardLayout(room, cut);
    expect(board.fits).toBe(true);
    expect(board.width + 248).toBeLessThanOrEqual(room.width);
    expect(board.height).toBeLessThanOrEqual(room.height);
    expect(board.width / board.height).toBeCloseTo(4 / 3);
    expect(Math.min(board.width / cut.columns, board.height / cut.rows)).toBeGreaterThanOrEqual(48);
  }
  expect(pictureBoardLayout({ width: 430, height: 600 }, cut).fits).toBe(false);
  expect(pictureBoardLayout({ width: 1000, height: 280 }, cut).fits).toBe(false);
});
