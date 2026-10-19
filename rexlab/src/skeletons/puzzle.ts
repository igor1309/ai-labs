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
  // it, so trying again and again never puts help off.
  waited: number;
  // Whether help climbs the ladder of steps rather than glowing once.
  ladder: boolean;
  // Other skeletons' bones mixed into the tray, which fit nowhere, and
  // the one last dropped, until another piece is touched, so the child is
  // told whose bone it is.
  distractors: readonly Distractor[];
  told: Distractor | undefined;
  // Whether a tap turns a piece, and how many quarter turns, clockwise,
  // each piece of the cut lies turned in the tray; none for a piece the
  // right way up.
  turning: boolean;
  turns: Readonly<Record<string, number>>;
  // The badge finishing the puzzle earns, if any, and whether help's last
  // step has shown, which leaves it none.
  badge: Badge | undefined;
  lastStepShown: boolean;
};

// A piece turns a quarter at a time, so four turns bring it back.
const QUARTERS = 4;

// A draw falls in one of nine equal parts: the first UPRIGHT leave a
// piece the right way up, so about one piece in three arrives turned, and
// each of the last three turns it one quarter more.
const PARTS = 9;
const UPRIGHT = 6;

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
// distractors among them when `distractors` says so. With `turning`, a
// draw for each piece in the cut's order turns it a quarter, half or
// three quarters, or leaves it the right way up. With `shuffling`, the
// tray shows the pieces in an order drawn from it, so their order gives
// nothing away; without, in the cut's order. Finished without help's last
// step, it earns `badge`, if any.
export function startPuzzle(
  skeleton: Skeleton,
  cut: Cut,
  {
    ladder = false,
    distractors = false,
    turning,
    shuffling,
    badge
  }: { ladder?: boolean; distractors?: boolean; turning?: (() => number) | undefined; shuffling?: (() => number) | undefined; badge?: Badge | undefined } = {}
): Puzzle {
  const turns = turning === undefined ? [] : cut.map(({ id }) => [id, Math.min(QUARTERS - 1, Math.floor(turning() * PARTS) - UPRIGHT + 1)] as const);
  const ids = cut.map(({ id }) => id);
  return {
    skeleton,
    cut,
    order: shuffling === undefined ? ids : shuffled(ids, shuffling),
    fitted: [],
    waited: 0,
    ladder,
    distractors: distractors ? (skeleton.distractors ?? []) : [],
    told: undefined,
    turning: turning !== undefined,
    turns: Object.fromEntries(turns.filter(([, quarters]) => quarters > 0)),
    badge,
    lastStepShown: false
  };
}

// A tap turns a piece in the tray a quarter clockwise, back the right way
// up after four. A fitted piece, one not of the cut, or any piece of a
// puzzle that does not turn, stays as it is.
export function turn(puzzle: Puzzle, piece: string): Puzzle {
  if (!puzzle.turning || !puzzle.cut.some(({ id }) => id === piece) || puzzle.fitted.includes(piece)) return puzzle;
  const { [piece]: quarters = 0, ...others } = puzzle.turns;
  const next = (quarters + 1) % QUARTERS;
  return { ...puzzle, turns: next === 0 ? others : { ...others, [piece]: next } };
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
// with nothing lost, and a fitted piece stays fitted, as does a piece
// dropped turned, which fits only the right way up. A distractor fits
// nowhere: dropped anywhere it goes back, and the puzzle tells whose bone
// it is until the next drop. Neither puts help off.
export function drop(puzzle: Puzzle, piece: string, centre: Point, reach: number): Puzzle {
  const stray = puzzle.distractors.find((distractor) => strayId(distractor) === piece);
  if (stray !== undefined) return puzzle.told === stray ? puzzle : { ...puzzle, told: stray };
  const missed = puzzle.told === undefined ? puzzle : { ...puzzle, told: undefined };
  const home = puzzle.cut.find(({ id }) => id === piece);
  if (home === undefined || puzzle.fitted.includes(piece) || (puzzle.turns[piece] ?? 0) > 0) return missed;
  const { x, y, width, height } = home.place;
  if (Math.hypot(centre.x - (x + width / 2), centre.y - (y + height / 2)) > reach) return missed;
  return { ...puzzle, fitted: [...puzzle.fitted, piece], waited: 0, told: undefined };
}

// `piece` touched in the tray: the line about another skeleton's bone
// goes, unless it is that bone again.
export function touch(puzzle: Puzzle, piece: string): Puzzle {
  if (puzzle.told === undefined || strayId(puzzle.told) === piece) return puzzle;
  return { ...puzzle, told: undefined };
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

// The piece, and so its home, that help points at once it is due, the
// first in the tray still to fit, and the step help has reached: one
// more every HELP_AFTER on the ladder. Help never fits it for the child.
export function help(puzzle: Puzzle): Help | undefined {
  const reached = Math.floor(puzzle.waited / HELP_AFTER);
  const piece = puzzle.order.find((id) => !puzzle.fitted.includes(id));
  if (reached === 0 || piece === undefined) return undefined;
  return { piece, step: puzzle.ladder ? (LADDER[Math.min(reached, LADDER.length) - 1] ?? "region") : "glow" };
}
