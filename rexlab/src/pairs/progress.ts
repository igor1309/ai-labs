import { isFinished, TOP_CLIMB_LEVEL, type Board, type BoardLevel, type ClimbLevel, type Pal } from "./board.ts";

// What a child has done in find the pair: the stars earned, one for each
// finished board; the climb level reached and the boards finished on it;
// each climb level's best, its fewest tries, absent until a board of it is
// finished; and the ids of the dinosaurs found, in the dinosaur list's
// order.
export type PairsProgress = {
  stars: number;
  climbLevel: ClimbLevel;
  boardsOnClimbLevel: number;
  best: Partial<Record<ClimbLevel, number>>;
  found: readonly string[];
};

export const NO_PAIRS: PairsProgress = { stars: 0, climbLevel: 1, boardsOnClimbLevel: 0, best: {}, found: [] };

// Finished boards on a climb level that move the child up to the next.
export const BOARDS_PER_CLIMB_LEVEL = 2;

// The progress the game goes by while the app is open. When stored
// progress cannot be read there is no best to compare with, but stars,
// levels and dinosaurs found meanwhile are still kept.
export type KeptPairs = { progress: PairsProgress; readable: boolean };

export type Celebration = "first-best" | "new-best";

export type PairsResult = {
  level: BoardLevel;
  // The board's dinosaurs, in the order they were dealt.
  pals: readonly Pal[];
  tries: number;
  // Every star earned, this board's among them.
  stars: number;
  // Undefined when stored progress cannot be read, or the board is a
  // larger level's, which keeps no best: there is no best to show.
  best: number | undefined;
  // The climb level's best before this board, undefined when there was
  // none, it cannot be read, or the board is a larger level's.
  previousBest: number | undefined;
  celebration: Celebration | null;
  // The climb level this board moved the child up to, or null.
  levelUp: ClimbLevel | null;
  // The ids of the board's dinosaurs found for the first time.
  newlyFound: readonly string[];
};

// A finished board earns a star and finds its dinosaurs at every level.
// A board of the climb has its tries compared with its climb level's
// fewest so far, only fewer being a new best, and moves the climb on; a
// larger level's board neither climbs nor touches the climb's bests.
// `order` is the dinosaur list's ids: found dinosaurs are kept in its
// order, and one no longer in it is kept after them, untouched.
export function finishBoard(kept: KeptPairs, board: Board, order: readonly string[]): { result: PairsResult; kept: KeptPairs } {
  if (!isFinished(board)) {
    throw new Error("A board is finished only once every pair is found");
  }
  const { stars, climbLevel, boardsOnClimbLevel, best, found } = kept.progress;
  const { tries } = board;
  const played = "climbLevel" in board.level ? board.level.climbLevel : undefined;
  const previousBest = played === undefined ? undefined : best[played];
  const ids = board.pals.map(({ id }) => id);
  const newlyFound = ids.filter((id) => !found.includes(id));
  const all = new Set([...found, ...ids]);
  const onClimbLevel = played === climbLevel;
  const moving = onClimbLevel && climbLevel < TOP_CLIMB_LEVEL && boardsOnClimbLevel + 1 >= BOARDS_PER_CLIMB_LEVEL;
  const nextLevel = moving ? ((climbLevel + 1) as ClimbLevel) : climbLevel;
  const progress: PairsProgress = {
    stars: stars + 1,
    climbLevel: nextLevel,
    boardsOnClimbLevel: moving ? 0 : onClimbLevel ? boardsOnClimbLevel + 1 : boardsOnClimbLevel,
    best: played === undefined ? best : { ...best, [played]: previousBest === undefined ? tries : Math.min(previousBest, tries) },
    found: [...order.filter((id) => all.has(id)), ...found.filter((id) => !order.includes(id))]
  };
  const celebration = !kept.readable || played === undefined ? null : previousBest === undefined ? "first-best" : tries < previousBest ? "new-best" : null;
  return {
    result: {
      level: board.level,
      pals: board.pals,
      tries,
      stars: progress.stars,
      best: kept.readable && played !== undefined ? progress.best[played] : undefined,
      previousBest: kept.readable ? previousBest : undefined,
      celebration,
      levelUp: moving ? nextLevel : null,
      newlyFound
    },
    kept: { progress, readable: kept.readable }
  };
}

// The found dinosaurs still in the dinosaur list; one no longer in it is
// not counted.
export function foundOf(found: readonly string[], order: readonly string[]): string[] {
  return order.filter((id) => found.includes(id));
}
