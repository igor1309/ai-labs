import type { Language } from "../language/language.ts";
import { shuffled } from "./shuffled.ts";

// A piece's home on the outline, in pixels of the skeleton's frame.
export type Place = { x: number; y: number; width: number; height: number };

// The parts of a body a piece of skeleton belongs to, head to tail.
export const BODY_AREAS = ["head", "neck", "back", "hips", "legs", "tail"] as const;

export type BodyArea = (typeof BODY_AREAS)[number];

// A piece of a skeleton: its id, which is also its picture's name and is
// unique in its cut, its name, its body area and its home on the outline.
export type Piece = { id: string; name: Record<Language, string>; area: BodyArea; place: Place };

// A skeleton cut into pieces, head to tail.
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

// A distractor's id in the puzzle's tray: its skeleton's and its own, so
// it never shares one with a piece of the puzzle's cut.
export const strayId = ({ skeleton, id }: Distractor) => `${skeleton}/${id}`;

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

// A level's badge, which a skeleton finished there without help's last
// step earns, in the levels' order; Hatchling has none.
export const BADGES = ["explorer", "paleontologist"] as const;
export type Badge = (typeof BADGES)[number];

export type Puzzle = {
  skeleton: Skeleton;
  // The cut the skeleton is built from, and its pieces' ids in the order
  // the tray shows them.
  cut: Cut;
  order: readonly string[];
  // The ids of the pieces fitted on the outline, in the order they were
  // fitted.
  fitted: readonly string[];
  // How long the child has been at the puzzle since a piece last fitted,
  // or since it started, in milliseconds. Drops that miss do not reset
  // it, so trying again and again never puts help off; on the ladder a
  // touch does, so help waits while the child is busy.
  waited: number;
  // Whether help climbs the ladder of steps rather than glowing once.
  ladder: boolean;
  // On the ladder, the piece of the cut the child last touched, which
  // help points at while it is unfitted, and how many times a touch has
  // started the count again.
  handled: string | undefined;
  touches: number;
  // Other skeletons' bones mixed into the tray, which fit nowhere, and
  // the one last dropped, until another piece is touched, so the child is
  // told whose bone it is.
  distractors: readonly Distractor[];
  told: Distractor | undefined;
  // The badge finishing the puzzle earns, if any, and whether help's last
  // step has shown, which leaves it none.
  badge: Badge | undefined;
  lastStepShown: boolean;
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
// up, its help the ladder's when `ladder` says so, and the skeleton's
// distractors among them when `distractors` says so. With `shuffling`, the
// tray shows the pieces in an order drawn from it, so their order gives
// nothing away; without, in the cut's order. Finished without help's last
// step, it earns `badge`, if any.
export function startPuzzle(
  skeleton: Skeleton,
  cut: Cut,
  {
    ladder = false,
    distractors = false,
    shuffling,
    badge
  }: { ladder?: boolean; distractors?: boolean; shuffling?: (() => number) | undefined; badge?: Badge | undefined } = {}
): Puzzle {
  const ids = cut.map(({ id }) => id);
  return {
    skeleton,
    cut,
    order: shuffling === undefined ? ids : shuffled(ids, shuffling),
    fitted: [],
    waited: 0,
    ladder,
    handled: undefined,
    touches: 0,
    distractors: distractors ? (skeleton.distractors ?? []) : [],
    told: undefined,
    badge,
    lastStepShown: false
  };
}

// The tray's order: the pieces in the puzzle's order, with the
// distractors spread evenly among them, until the skeleton is complete
// and they leave.
export function trayOf(puzzle: Puzzle): string[] {
  const pieces = [...puzzle.order];
  if (isComplete(puzzle)) return pieces;
  const { distractors } = puzzle;
  // The piece each distractor follows, counted from one.
  const after = (at: number) => Math.max(1, Math.round(((at + 1) * pieces.length) / (distractors.length + 1)));
  return pieces.flatMap((id, at) => [id, ...distractors.filter((_, each) => after(each) === at + 1).map(strayId)]);
}

// How long help takes to reach its last step.
const lastHelpAt = (puzzle: Puzzle) => (puzzle.ladder ? LADDER.length : 1) * HELP_AFTER;

// A piece dropped with its centre at `centre` fits its own home, and no
// other, when its centre is within `reach` of its home's centre. Any
// other drop leaves the puzzle as it is: the piece goes back to the tray
// with nothing lost, and a fitted piece stays fitted. A distractor fits
// nowhere: dropped anywhere it goes back, and the puzzle tells whose bone
// it is until the next drop. Neither puts help off.
export function drop(puzzle: Puzzle, piece: string, centre: Point, reach: number): Puzzle {
  const stray = puzzle.distractors.find((distractor) => strayId(distractor) === piece);
  if (stray !== undefined) return puzzle.told === stray ? puzzle : { ...puzzle, told: stray };
  const missed = puzzle.told === undefined ? puzzle : { ...puzzle, told: undefined };
  const home = puzzle.cut.find(({ id }) => id === piece);
  if (home === undefined || puzzle.fitted.includes(piece)) return missed;
  const { x, y, width, height } = home.place;
  if (Math.hypot(centre.x - (x + width / 2), centre.y - (y + height / 2)) > reach) return missed;
  return { ...puzzle, fitted: [...puzzle.fitted, piece], waited: 0, told: undefined };
}

// `piece` touched in the tray: the line about another skeleton's bone
// goes, unless it is that bone again. On the ladder the child is busy, so
// help showing hides and its count starts again, and a piece of the cut
// becomes the one help will point at.
export function touch(puzzle: Puzzle, piece: string): Puzzle {
  const told = puzzle.told === undefined || strayId(puzzle.told) === piece ? puzzle : { ...puzzle, told: undefined };
  if (!puzzle.ladder || isComplete(puzzle)) return told;
  const own = puzzle.cut.some(({ id }) => id === piece) && !puzzle.fitted.includes(piece);
  return { ...told, waited: 0, touches: puzzle.touches + 1, handled: own ? piece : puzzle.handled };
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

// Help's last step, a piece moving towards its home, has shown on the
// screen. Its falling due is not enough: it waits while a piece is held,
// and the piece may fit first.
export function showLastStep(puzzle: Puzzle): Puzzle {
  return puzzle.lastStepShown ? puzzle : { ...puzzle, lastStepShown: true };
}

// The piece, and so its home, that help points at once it is due, and
// the step help has reached: one more every HELP_AFTER on the ladder. It
// is the piece the child last handled while that is unfitted, or else
// the first in the tray still to fit. Help never fits it for the child.
export function help(puzzle: Puzzle): Help | undefined {
  const reached = Math.floor(puzzle.waited / HELP_AFTER);
  const { handled, fitted } = puzzle;
  const piece = handled !== undefined && !fitted.includes(handled) ? handled : puzzle.order.find((id) => !fitted.includes(id));
  if (reached === 0 || piece === undefined) return undefined;
  return { piece, step: puzzle.ladder ? (LADDER[Math.min(reached, LADDER.length) - 1] ?? "region") : "glow" };
}
