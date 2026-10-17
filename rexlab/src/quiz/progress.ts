// What a player has done in one game: the best score of a finished round,
// null until one is finished, and how many rounds were finished.
export type GameProgress = {
  bestScore: number | null;
  roundsPlayed: number;
};

export const NO_PROGRESS: GameProgress = { bestScore: null, roundsPlayed: 0 };

export type Celebration = "first-best" | "new-best";

export type RoundOutcome = {
  progress: { bestScore: number; roundsPlayed: number };
  celebration: Celebration | null;
};

// A finished round is compared with the highest score so far, never with
// the last one. A first round of 0 sets the first best but has nothing to
// celebrate.
export function finishRound(previous: GameProgress, score: number): RoundOutcome {
  const { bestScore, roundsPlayed } = previous;
  const firstBest = bestScore === null && score > 0;
  const beatPersonalBest = bestScore !== null && score > bestScore;
  return {
    progress: {
      bestScore: bestScore === null ? score : Math.max(bestScore, score),
      roundsPlayed: roundsPlayed + 1
    },
    celebration: firstBest ? "first-best" : beatPersonalBest ? "new-best" : null
  };
}
