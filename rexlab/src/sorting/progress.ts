// What a child has done in the sorting game: the best score of a finished
// board, null until one is finished, and how many boards were finished.
export type SortingProgress = {
  bestScore: number | null;
  roundsPlayed: number;
};

export const NO_SORTING: SortingProgress = { bestScore: null, roundsPlayed: 0 };

export type Celebration = "first-best" | "new-best";

// The best after a board, and what the board celebrates.
export type Beaten = { best: number; celebration: Celebration | null };

// The best-score rule a board is scored by, which the app gives: the best
// after a board of `score`, from the best before it, null until a board is
// finished.
export type BeatBest = (previous: number | null, score: number) => Beaten;

export type SortingOutcome = {
  progress: { bestScore: number; roundsPlayed: number };
  celebration: Celebration | null;
};

export function finishRound(previous: SortingProgress, score: number, beatBest: BeatBest): SortingOutcome {
  const { best, celebration } = beatBest(previous.bestScore, score);
  return {
    progress: { bestScore: best, roundsPlayed: previous.roundsPlayed + 1 },
    celebration
  };
}
