import { isFinished, TOP_LEVEL, type Board, type Level, type Pal } from "./board.ts";

// What a child has done in find the pair: the stars earned, one for each
// finished board; the level played and the boards finished on it; each
// level's best, its fewest tries, absent until a board of it is finished;
// and the ids of the dinosaurs found, in the dinosaur list's order.
export type PairsProgress = {
  stars: number;
  level: Level;
  boardsOnLevel: number;
  best: Partial<Record<Level, number>>;
  found: readonly string[];
};

export const NO_PAIRS: PairsProgress = { stars: 0, level: 1, boardsOnLevel: 0, best: {}, found: [] };

// Finished boards on a level that move the child up to the next.
export const BOARDS_PER_LEVEL = 2;

// The progress the game goes by while the app is open. When stored
// progress cannot be read there is no best to compare with, but stars,
// levels and dinosaurs found meanwhile are still kept.
export type KeptPairs = { progress: PairsProgress; readable: boolean };

export type Celebration = "first-best" | "new-best";

export type PairsResult = {
  level: Level;
  // The board's dinosaurs, in the order they were dealt.
  pals: readonly Pal[];
  tries: number;
  // Every star earned, this board's among them.
  stars: number;
  // Undefined when stored progress cannot be read: there is no best to
  // show.
  best: number | undefined;
  // The level's best before this board, undefined when there was none or
  // it cannot be read.
  previousBest: number | undefined;
  celebration: Celebration | null;
  // The level this board moved the child up to, or null.
  levelUp: Level | null;
  // The ids of the board's dinosaurs found for the first time.
  newlyFound: readonly string[];
};

// A finished board earns a star, and its tries are compared with the
// level's fewest so far: only fewer is a new best. `order` is the dinosaur
// list's ids: found dinosaurs are kept in its order, and one no longer in
// it is kept after them, untouched.
export function finishBoard(kept: KeptPairs, board: Board, order: readonly string[]): { result: PairsResult; kept: KeptPairs } {
  if (!isFinished(board)) {
    throw new Error("A board is finished only once every pair is found");
  }
  const { stars, level, boardsOnLevel, best, found } = kept.progress;
  const { tries } = board;
  const previousBest = best[board.level];
  const ids = board.pals.map(({ id }) => id);
  const newlyFound = ids.filter((id) => !found.includes(id));
  const all = new Set([...found, ...ids]);
  const moving = board.level === level && level < TOP_LEVEL && boardsOnLevel + 1 >= BOARDS_PER_LEVEL;
  const nextLevel = moving ? ((level + 1) as Level) : level;
  const progress: PairsProgress = {
    stars: stars + 1,
    level: nextLevel,
    boardsOnLevel: moving ? 0 : board.level === level ? boardsOnLevel + 1 : boardsOnLevel,
    best: { ...best, [board.level]: previousBest === undefined ? tries : Math.min(previousBest, tries) },
    found: [...order.filter((id) => all.has(id)), ...found.filter((id) => !order.includes(id))]
  };
  const celebration = !kept.readable ? null : previousBest === undefined ? "first-best" : tries < previousBest ? "new-best" : null;
  return {
    result: {
      level: board.level,
      pals: board.pals,
      tries,
      stars: progress.stars,
      best: kept.readable ? progress.best[board.level] : undefined,
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
