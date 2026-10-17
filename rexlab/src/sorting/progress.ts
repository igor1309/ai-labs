import { beatBest, type Celebration } from "../bestScore.ts";

export type { Celebration };

// What a child has done in the sorting game: the best score of a finished
// board, null until one is finished, and how many boards were finished.
export type SortingProgress = {
  bestScore: number | null;
  roundsPlayed: number;
};

export const NO_SORTING: SortingProgress = { bestScore: null, roundsPlayed: 0 };

export type SortingOutcome = {
  progress: { bestScore: number; roundsPlayed: number };
  celebration: Celebration | null;
};

export function finishRound(previous: SortingProgress, score: number): SortingOutcome {
  const { best, celebration } = beatBest(previous.bestScore, score);
  return {
    progress: { bestScore: best, roundsPlayed: previous.roundsPlayed + 1 },
    celebration
  };
}
