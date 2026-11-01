// The levels a round plays at.
export type QuizLevel = "hatchling" | "explorer" | "paleontologist";

// What a player has done in the quiz: each level's best score of a
// finished round, null until one is finished there, and how many rounds
// were finished. A best belongs to the level where it was earned.
export type QuizProgress = {
  best: Record<QuizLevel, number | null>;
  roundsPlayed: number;
};

export const NO_PROGRESS: QuizProgress = { best: { hatchling: null, explorer: null, paleontologist: null }, roundsPlayed: 0 };

export function bestForLevel(progress: QuizProgress, level: QuizLevel): number | null {
  return progress.best[level];
}

// A visit may hold unsaved scores while another tab saves newer progress.
export function mergeProgress(kept: QuizProgress, stored: QuizProgress): QuizProgress {
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

// The best after a round, and what the round celebrates.
export type Beaten = { best: number; celebration: Celebration | null };

// The best-score rule a round is scored by, which the app gives: the best
// after a round of `score`, from the best before it, null until a round is
// finished.
export type BeatBest = (previous: number | null, score: number) => Beaten;

export type RoundOutcome = {
  progress: QuizProgress;
  celebration: Celebration | null;
};

export function finishRound(previous: QuizProgress, level: QuizLevel, score: number, beatBest: BeatBest): RoundOutcome {
  const { best, celebration } = beatBest(bestForLevel(previous, level), score);
  return {
    progress: { best: { ...previous.best, [level]: best }, roundsPlayed: previous.roundsPlayed + 1 },
    celebration
  };
}
