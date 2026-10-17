import type { Language } from "../language/language.ts";

// The pieces every skeleton is built from, in the order the tray shows
// them: at the first level the spine carries the neck and ribs, and the
// legs piece all four or both legs.
export const PIECES = ["skull", "spine", "legs", "tail"] as const;

export type Piece = (typeof PIECES)[number];

// A piece's home on the outline, in pixels of the skeleton's frame.
export type Place = { x: number; y: number; width: number; height: number };

// A point on the outline, in pixels of the skeleton's frame.
export type Point = { x: number; y: number };

export type Skeleton = {
  id: string;
  name: Record<Language, string>;
  // The frame the outline is drawn in, which the dinosaur's body picture
  // shares, and each piece's home in it.
  frame: { width: number; height: number };
  places: Record<Piece, Place>;
};

export type Puzzle = {
  skeleton: Skeleton;
  // The pieces fitted on the outline, in the order they were fitted.
  fitted: readonly Piece[];
  // How long the child has been at the puzzle since a piece last fitted,
  // or since it started, in milliseconds. Drops that miss do not reset
  // it, so trying again and again never puts help off.
  waited: number;
};

// How long the child works at the puzzle without fitting a piece before
// help is offered, in milliseconds.
export const HELP_AFTER = 10_000;

// A puzzle starts with every piece in the tray, the right way up.
export function startPuzzle(skeleton: Skeleton): Puzzle {
  return { skeleton, fitted: [], waited: 0 };
}

// A piece dropped with its centre at `centre` fits its own home, and no
// other, when its centre is within `reach` of its home's centre. Any
// other drop leaves the puzzle as it is: the piece goes back to the tray
// with nothing lost, and a fitted piece stays fitted.
export function drop(puzzle: Puzzle, piece: Piece, centre: Point, reach: number): Puzzle {
  if (puzzle.fitted.includes(piece)) return puzzle;
  const { x, y, width, height } = puzzle.skeleton.places[piece];
  if (Math.hypot(centre.x - (x + width / 2), centre.y - (y + height / 2)) > reach) return puzzle;
  return { ...puzzle, fitted: [...puzzle.fitted, piece], waited: 0 };
}

export function isComplete(puzzle: Puzzle): boolean {
  return PIECES.every((piece) => puzzle.fitted.includes(piece));
}

// Whether the time the child spends at the puzzle still counts towards
// help: not once help is due, nor once the skeleton is complete.
export function awaitsHelp(puzzle: Puzzle): boolean {
  return puzzle.waited < HELP_AFTER && !isComplete(puzzle);
}

// `ms` more spent at the puzzle without fitting a piece.
export function wait(puzzle: Puzzle, ms: number): Puzzle {
  if (!awaitsHelp(puzzle)) return puzzle;
  return { ...puzzle, waited: Math.min(puzzle.waited + ms, HELP_AFTER) };
}

// The piece, and so its home, that help points at once it is due: the
// first in the tray still to fit. Help never fits it for the child.
export function help(puzzle: Puzzle): Piece | undefined {
  if (puzzle.waited < HELP_AFTER) return undefined;
  return PIECES.find((piece) => !puzzle.fitted.includes(piece));
}
