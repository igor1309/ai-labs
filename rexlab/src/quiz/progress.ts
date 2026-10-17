// What a player has done in one game: the best score of a finished round,
// null until one is finished, and how many rounds were finished.
export type GameProgress = {
  bestScore: number | null;
  roundsPlayed: number;
};

export const NO_PROGRESS: GameProgress = { bestScore: null, roundsPlayed: 0 };

export type Celebration = "first-best" | "new-best";

// The best after a round, and what the round celebrates.
export type Beaten = { best: number; celebration: Celebration | null };

// The best-score rule a round is scored by, which the app gives: the best
// after a round of `score`, from the best before it, null until a round is
// finished.
export type BeatBest = (previous: number | null, score: number) => Beaten;

export type RoundOutcome = {
  progress: { bestScore: number; roundsPlayed: number };
  celebration: Celebration | null;
};

export function finishRound(previous: GameProgress, score: number, beatBest: BeatBest): RoundOutcome {
  const { best, celebration } = beatBest(previous.bestScore, score);
  return {
    progress: { bestScore: best, roundsPlayed: previous.roundsPlayed + 1 },
    celebration
  };
}
