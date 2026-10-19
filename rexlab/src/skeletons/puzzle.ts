import type { Language } from "../language/language.ts";

// A piece's home on the outline, in pixels of the skeleton's frame.
export type Place = { x: number; y: number; width: number; height: number };

// The parts of a body a piece of skeleton belongs to, head to tail.
export const BODY_AREAS = ["head", "neck", "back", "hips", "legs", "tail"] as const;

export type BodyArea = (typeof BODY_AREAS)[number];

// A piece of a skeleton: its id, which is also its picture's name and is
// unique in its cut, its name, its body area and its home on the outline.
export type Piece = { id: string; name: Record<Language, string>; area: BodyArea; place: Place };

// A skeleton cut into pieces, in the order the tray shows them.
export type Cut = readonly Piece[];

// The cuts a skeleton is played in, by age level (docs/age-levels.md).
// Today's four pieces are Hatchling's: the spine carries the neck and
// ribs, and the legs piece all four or both legs. A level with no cut of
// its own plays Hatchling's.
export type Cuts = { hatchling: Cut; explorer?: Cut; paleontologist?: Cut };

// A bone of another skeleton, which Paleontologist mixes into the tray:
// the piece of that skeleton's Paleontologist cut, with its picture and
// size, named with the dinosaur it belongs to.
export type Distractor = Piece & { skeleton: string };

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
  // Paleontologist's bones of other skeletons, if any.
  distractors?: readonly Distractor[];
};

// The cut a skeleton is built from at `level`: the level's own, or
// Hatchling's while it has none.
export const cutAt = (skeleton: Skeleton, level: keyof Cuts): Cut => skeleton.cuts[level] ?? skeleton.cuts.hatchling;

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
  // Whether help climbs the ladder of steps rather than glowing once.
  ladder: boolean;
};

// How long the child works at the puzzle without fitting a piece before
// help is offered, in milliseconds, and before each further step of the
// ladder.
export const HELP_AFTER = 10_000;

// Help's steps: Hatchling's one glow on a piece and its slot, or the
// ladder's, each adding to the ones before: the piece's body region on
// the outline, a faint ghost of it at its home, then the piece moving
// towards its home and back.
export const LADDER = ["region", "ghost", "move"] as const;

export type HelpStep = "glow" | (typeof LADDER)[number];

// The piece help points at, and the step it has reached.
export type Help = { piece: string; step: HelpStep };

// A puzzle starts with every piece of its cut in the tray, the right way
// up, its help the ladder's when `ladder` says so.
export function startPuzzle(skeleton: Skeleton, cut: Cut, { ladder = false }: { ladder?: boolean } = {}): Puzzle {
  return { skeleton, cut, fitted: [], waited: 0, ladder };
}

// How long help takes to reach its last step.
const lastHelpAt = (puzzle: Puzzle) => (puzzle.ladder ? LADDER.length : 1) * HELP_AFTER;

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
// help: not once help has reached its last step, nor once the skeleton is
// complete.
export function awaitsHelp(puzzle: Puzzle): boolean {
  return puzzle.waited < lastHelpAt(puzzle) && !isComplete(puzzle);
}

// `ms` more spent at the puzzle without fitting a piece.
export function wait(puzzle: Puzzle, ms: number): Puzzle {
  if (!awaitsHelp(puzzle)) return puzzle;
  return { ...puzzle, waited: Math.min(puzzle.waited + ms, lastHelpAt(puzzle)) };
}

// The piece, and so its home, that help points at once it is due, the
// first in the tray still to fit, and the step help has reached: one
// more every HELP_AFTER on the ladder. Help never fits it for the child.
export function help(puzzle: Puzzle): Help | undefined {
  const reached = Math.floor(puzzle.waited / HELP_AFTER);
  const piece = puzzle.cut.find(({ id }) => !puzzle.fitted.includes(id))?.id;
  if (reached === 0 || piece === undefined) return undefined;
  return { piece, step: puzzle.ladder ? (LADDER[Math.min(reached, LADDER.length) - 1] ?? "region") : "glow" };
}
