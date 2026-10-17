import { beatBest, type Celebration } from "../bestScore.ts";

export type { Celebration };

// What a player has done in one game: the best score of a finished round,
// null until one is finished, and how many rounds were finished.
export type GameProgress = {
  bestScore: number | null;
  roundsPlayed: number;
};

export const NO_PROGRESS: GameProgress = { bestScore: null, roundsPlayed: 0 };

export type RoundOutcome = {
  progress: { bestScore: number; roundsPlayed: number };
  celebration: Celebration | null;
};

export function finishRound(previous: GameProgress, score: number): RoundOutcome {
  const { best, celebration } = beatBest(previous.bestScore, score);
  return {
    progress: { bestScore: best, roundsPlayed: previous.roundsPlayed + 1 },
    celebration
  };
}
