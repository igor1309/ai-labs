import type { SortingLevel } from "./board.ts";

// A best belongs to the level where it was earned. The original field
// stays Hatchling's so progress saved before levels keeps its meaning.
export type SortingProgress = {
  bestScore: number | null;
  explorerBest: number | null;
  paleontologistBest: number | null;
  roundsPlayed: number;
};

export const NO_SORTING: SortingProgress = { bestScore: null, explorerBest: null, paleontologistBest: null, roundsPlayed: 0 };

const BEST_FIELDS = { hatchling: "bestScore", explorer: "explorerBest", paleontologist: "paleontologistBest" } as const;

export function bestForLevel(progress: SortingProgress, level: SortingLevel): number | null {
  return progress[BEST_FIELDS[level]];
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
    progress: { ...previous, [BEST_FIELDS[level]]: best, roundsPlayed: previous.roundsPlayed + 1 },
    celebration
  };
}
