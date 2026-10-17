// The best-score rule of docs/mvp-infrastructure.md section 5, which the
// composition root gives every game alike: a finished round is compared
// with the highest score so far, never with the last one, and a first
// round of 0 sets the first best but has nothing to celebrate.

export type Celebration = "first-best" | "new-best";

export type BestScore = {
  best: number;
  celebration: Celebration | null;
};

// The best after a round of `score`, from the best before it, null until a
// round is finished.
export function beatBest(previous: number | null, score: number): BestScore {
  if (previous === null) {
    return { best: score, celebration: score > 0 ? "first-best" : null };
  }
  return { best: Math.max(previous, score), celebration: score > previous ? "new-best" : null };
}
