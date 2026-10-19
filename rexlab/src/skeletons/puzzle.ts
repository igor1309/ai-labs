import type { Language } from "../language/language.ts";

// A piece's home on the outline, in pixels of the skeleton's frame.
export type Place = { x: number; y: number; width: number; height: number };

// A piece of a skeleton: its id, which is also its picture's name and is
// unique in its cut, its name, and its home on the outline.
export type Piece = { id: string; name: Record<Language, string>; place: Place };

// A skeleton cut into pieces, in the order the tray shows them.
export type Cut = readonly Piece[];

// The cuts a skeleton is played in. Today's four pieces are Hatchling's:
// the spine carries the neck and ribs, and the legs piece all four or both
// legs.
export type Cuts = { hatchling: Cut };

// A point on the outline, in pixels of the skeleton's frame.
export type Point = { x: number; y: number };

export type Skeleton = {
  id: string;
  name: Record<Language, string>;
  // The one short anatomy fact its finished skeleton reveals.
  fact: Record<Language, string>;
  // The frame the outline is drawn in, which the dinosaur's body picture
  // shares, and its cuts, each piece's home in it.
  frame: { width: number; height: number };
  cuts: Cuts;
};

export type Puzzle = {
  skeleton: Skeleton;
  // The cut the skeleton is built from.
  cut: Cut;
  // The ids of the pieces fitted on the outline, in the order they were
  // fitted.
  fitted: readonly string[];
  // How long the child has been at the puzzle since a piece last fitted,
  // or since it started, in milliseconds. Drops that miss do not reset
  // it, so trying again and again never puts help off.
  waited: number;
};

// How long the child works at the puzzle without fitting a piece before
// help is offered, in milliseconds.
export const HELP_AFTER = 10_000;

// A puzzle starts with every piece of its cut in the tray, the right way
// up.
export function startPuzzle(skeleton: Skeleton, cut: Cut): Puzzle {
  return { skeleton, cut, fitted: [], waited: 0 };
}

// A piece dropped with its centre at `centre` fits its own home, and no
// other, when its centre is within `reach` of its home's centre. Any
// other drop leaves the puzzle as it is: the piece goes back to the tray
// with nothing lost, and a fitted piece stays fitted.
export function drop(puzzle: Puzzle, piece: string, centre: Point, reach: number): Puzzle {
  const home = puzzle.cut.find(({ id }) => id === piece);
  if (home === undefined || puzzle.fitted.includes(piece)) return puzzle;
  const { x, y, width, height } = home.place;
  if (Math.hypot(centre.x - (x + width / 2), centre.y - (y + height / 2)) > reach) return puzzle;
  return { ...puzzle, fitted: [...puzzle.fitted, piece], waited: 0 };
}

export function isComplete(puzzle: Puzzle): boolean {
  return puzzle.cut.every(({ id }) => puzzle.fitted.includes(id));
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
export function help(puzzle: Puzzle): string | undefined {
  if (puzzle.waited < HELP_AFTER) return undefined;
  return puzzle.cut.find(({ id }) => !puzzle.fitted.includes(id))?.id;
}
