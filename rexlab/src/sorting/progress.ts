import type { SortingLevel } from "./board.ts";

// A best belongs to the level where it was earned.
export type SortingProgress = {
  best: Record<SortingLevel, number | null>;
  roundsPlayed: number;
};

export const NO_SORTING: SortingProgress = { best: { hatchling: null, explorer: null, paleontologist: null }, roundsPlayed: 0 };

export function bestForLevel(progress: SortingProgress, level: SortingLevel): number | null {
  return progress.best[level];
}

// A visit may hold unsaved scores while another tab saves newer progress.
export function mergeProgress(kept: SortingProgress, stored: SortingProgress): SortingProgress {
  const higher = (left: number | null, right: number | null) => left === null ? right : right === null ? left : Math.max(left, right);
  return {
    best: {
      hatchling: higher(kept.best.hatchling, stored.best.hatchling),
      explorer: higher(kept.best.explorer, stored.best.explorer),
      paleontologist: higher(kept.best.paleontologist, stored.best.paleontologist)
    },
    roundsPlayed: Math.max(kept.roundsPlayed, stored.roundsPlayed)
  };
}

export type Celebration = "first-best" | "new-best";

// The best after a board, and what the board celebrates.
export type Beaten = { best: number; celebration: Celebration | null };

// The best-score rule a board is scored by, which the app gives: the best
// after a board of `score`, from the best before it, null until a board is
// finished.
export type BeatBest = (previous: number | null, score: number) => Beaten;

export type SortingOutcome = {
  progress: SortingProgress;
  celebration: Celebration | null;
};

export function finishRound(previous: SortingProgress, level: SortingLevel, score: number, beatBest: BeatBest): SortingOutcome {
  const { best, celebration } = beatBest(bestForLevel(previous, level), score);
  return {
    progress: { best: { ...previous.best, [level]: best }, roundsPlayed: previous.roundsPlayed + 1 },
    celebration
  };
}
