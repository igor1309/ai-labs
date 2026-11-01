import type { AgeLevel } from "../ageLevel.ts";
import type { Language } from "../language/language.ts";

export const PICTURE_DINOSAURS = ["tyrannosaurus", "triceratops", "stegosaurus"] as const;
export type PictureDinosaurId = (typeof PICTURE_DINOSAURS)[number];
export type PictureDinosaur = { id: PictureDinosaurId; name: Record<Language, string> };

// Every cut uses the same complete picture, in coordinates independent
// of the size at which the board or tray draws it.
export const PICTURE_FRAME = { width: 1200, height: 900 } as const;
export type Rectangle = { x: number; y: number; width: number; height: number };
export type PicturePiece = { id: number; column: number; row: number; home: Rectangle };
export type PictureCut = { columns: number; rows: number; pieces: readonly PicturePiece[] };

const GRIDS: Record<AgeLevel, { columns: number; rows: number }> = {
  hatchling: { columns: 4, rows: 3 },
  explorer: { columns: 6, rows: 4 },
  paleontologist: { columns: 6, rows: 6 }
};

export function cutPicture(level: AgeLevel): PictureCut {
  const { columns, rows } = GRIDS[level];
  const width = PICTURE_FRAME.width / columns;
  const height = PICTURE_FRAME.height / rows;
  return {
    columns,
    rows,
    pieces: Array.from({ length: columns * rows }, (_, id) => {
      const column = id % columns;
      const row = Math.floor(id / columns);
      return { id, column, row, home: { x: column * width, y: row * height, width, height } };
    })
  };
}

export type PicturePuzzle = {
  dinosaur: PictureDinosaur;
  level: AgeLevel;
  cut: PictureCut;
  order: readonly number[];
  fitted: readonly number[];
};

// Fisher–Yates draws only from the supplied source, never from a clock
// or a shared random generator. A replay owns a fresh cut and tray.
export function startPicturePuzzle(dinosaur: PictureDinosaur, level: AgeLevel, random: () => number): PicturePuzzle {
  const cut = cutPicture(level);
  const order = cut.pieces.map(({ id }) => id);
  for (let at = order.length - 1; at > 0; at--) {
    const other = Math.floor(random() * (at + 1));
    [order[at], order[other]] = [order[other]!, order[at]!];
  }
  return { dinosaur, level, cut, order, fitted: [] };
}

// A piece fits only its own slot, once. Leaving this value behind never
// awards anything: completion rewards belong to the game's result.
export function fitPicturePiece(puzzle: PicturePuzzle, piece: number, slot: number): PicturePuzzle {
  if (piece !== slot || puzzle.fitted.includes(piece) || !puzzle.cut.pieces.some(({ id }) => id === piece)) return puzzle;
  return { ...puzzle, fitted: [...puzzle.fitted, piece] };
}

export function pictureComplete(puzzle: PicturePuzzle): boolean {
  return puzzle.cut.pieces.every(({ id }) => puzzle.fitted.includes(id));
}
