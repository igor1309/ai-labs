import { describe, expect, it, vi } from "vitest";
import type { AgeLevel } from "../src/ageLevel.ts";
import records from "../src/data/dinosaurs.json";
import { readPictureDinosaurs } from "../src/dinosaurs.ts";
import { LANGUAGES } from "../src/language/language.ts";
import { cutPicture, fitPicturePiece, pictureComplete, PICTURE_FRAME, startPicturePuzzle } from "../src/picturePuzzle/index.ts";

const DINOSAURS = readPictureDinosaurs(records);
const CUTS: Array<[AgeLevel, number, number]> = [["hatchling", 4, 3], ["explorer", 6, 4], ["paleontologist", 6, 6]];

describe("picture puzzle content", () => {
  it("takes only the three approved dinosaurs, in choice order, with the shipped localized names", () => {
    expect(readPictureDinosaurs([...records].reverse())).toEqual(
      ["tyrannosaurus", "triceratops", "stegosaurus"].map((id) => ({ id, name: records.find((record) => record.id === id)!.name }))
    );
  });

  it.each(["tyrannosaurus", "triceratops", "stegosaurus"])("rejects missing content for %s at composition", (id) => {
    expect(() => readPictureDinosaurs(records.filter((record) => record.id !== id))).toThrow(`No localized picture dinosaur ${id}`);
    for (const language of LANGUAGES) {
      const incomplete = records.map((record) => record.id === id ? { ...record, name: { ...record.name, [language]: "" } } : record);
      expect(() => readPictureDinosaurs(incomplete)).toThrow(`No localized picture dinosaur ${id}`);
    }
  });
});

describe.each(CUTS)("the %s cut", (level, columns, rows) => {
  it("covers the complete 4:3 frame exactly once with upright rectangles and one home per piece", () => {
    const cut = cutPicture(level);
    expect(PICTURE_FRAME.width / PICTURE_FRAME.height).toBe(4 / 3);
    expect([cut.columns, cut.rows, cut.pieces.length]).toEqual([columns, rows, columns * rows]);
    expect(cut.pieces).toEqual(Array.from({ length: columns * rows }, (_, id) => ({
      id, column: id % columns, row: Math.floor(id / columns),
      home: {
        x: (id % columns) * PICTURE_FRAME.width / columns,
        y: Math.floor(id / columns) * PICTURE_FRAME.height / rows,
        width: PICTURE_FRAME.width / columns, height: PICTURE_FRAME.height / rows
      }
    })));
  });

  it.each(DINOSAURS)("starts a fresh $id puzzle, shuffling only with the given random source", (dinosaur) => {
    const draw = vi.fn(() => 0);
    const first = startPicturePuzzle(dinosaur, level, draw);
    const ids = cutPicture(level).pieces.map(({ id }) => id);
    expect(first).toMatchObject({ dinosaur, level, fitted: [], order: [...ids.slice(1), 0] });
    expect(draw).toHaveBeenCalledTimes(ids.length - 1);
    const replay = startPicturePuzzle(dinosaur, level, () => 1 - Number.EPSILON);
    expect(replay.order).toEqual(ids);
    expect(replay.cut).not.toBe(first.cut);
    expect(replay.fitted).not.toBe(first.fitted);
    expect([...first.order].sort((a, b) => a - b)).toEqual(ids);
  });

  it("fits every piece only in its home, once, and completes only after all homes are fitted", () => {
    const started = startPicturePuzzle(DINOSAURS[0]!, level, () => 0);
    let puzzle = started;
    expect(pictureComplete(puzzle)).toBe(false);
    for (const piece of puzzle.order) {
      for (const other of puzzle.order.filter((id) => id !== piece)) {
        expect(fitPicturePiece(puzzle, piece, other)).toBe(puzzle);
      }
      for (const invalid of [-1, columns * rows, 1.5, NaN]) {
        expect(fitPicturePiece(puzzle, invalid, invalid)).toBe(puzzle);
      }
      const previous = puzzle;
      puzzle = fitPicturePiece(puzzle, piece, piece);
      expect(previous.fitted).not.toContain(piece);
      expect(puzzle.fitted).toEqual([...previous.fitted, piece]);
      expect(fitPicturePiece(puzzle, piece, piece)).toBe(puzzle);
      expect(pictureComplete(puzzle)).toBe(puzzle.fitted.length === columns * rows);
    }
    expect(started.fitted).toEqual([]);
    expect(startPicturePuzzle(DINOSAURS[0]!, level, () => 0).fitted).toEqual([]);
  });
});
