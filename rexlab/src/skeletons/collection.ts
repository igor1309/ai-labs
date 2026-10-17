import { isComplete, type Puzzle, type Skeleton } from "./puzzle.ts";

// What a child has done in the skeleton game: the ids of the dinosaurs
// whose skeleton they have finished, each earning one star for good, in
// the skeleton list's order, and the best collection score, null until a
// skeleton is finished.
export type SkeletonProgress = {
  earned: readonly string[];
  bestScore: number | null;
};

export const NO_SKELETONS: SkeletonProgress = { earned: [], bestScore: null };

// The progress the game goes by while the app is open. When stored
// progress cannot be read there is no best to compare with, but stars
// earned meanwhile are still kept.
export type KeptSkeletons = { progress: SkeletonProgress; readable: boolean };

export type Celebration = "first-best" | "new-best";

// The best-score rule a collection is scored by, which the app gives: the
// best after a collection of `score` stars, from the best before it, null
// until a skeleton is finished.
export type BeatBest = (previous: number | null, score: number) => { best: number; celebration: Celebration | null };

export type SkeletonResult = {
  skeleton: Skeleton;
  // The collection score: the different dinosaurs with a star, out of
  // every skeleton there is to build.
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to
  // show.
  best: number | undefined;
  // The best before this skeleton, undefined when there was none or it
  // cannot be read.
  previousBest: number | undefined;
  celebration: Celebration | null;
  // This skeleton earned its dinosaur's star; it had none before.
  newStar: boolean;
};

// A finished skeleton earns its dinosaur's star once, and the collection
// is scored by the best-score rule. `order` is the skeleton list's ids:
// stars are kept in its order, and one of a dinosaur no longer in it is
// kept after them, untouched.
export function finishSkeleton(kept: KeptSkeletons, puzzle: Puzzle, order: readonly string[], beatBest: BeatBest): { result: SkeletonResult; kept: KeptSkeletons } {
  if (!isComplete(puzzle)) {
    throw new Error("A skeleton is finished only once every piece is fitted");
  }
  const { earned, bestScore } = kept.progress;
  const { skeleton } = puzzle;
  const all = new Set([...earned, skeleton.id]);
  // Each dinosaur of `order` with a star counts once; one no longer in it
  // has no star to show.
  const stars = order.filter((id) => all.has(id));
  const beaten = beatBest(bestScore, stars.length);
  const progress: SkeletonProgress = {
    earned: [...stars, ...[...all].filter((id) => !order.includes(id))],
    bestScore: beaten.best
  };
  return {
    result: {
      skeleton,
      score: stars.length,
      total: order.length,
      best: kept.readable ? beaten.best : undefined,
      previousBest: kept.readable ? (bestScore ?? undefined) : undefined,
      celebration: kept.readable ? beaten.celebration : null,
      newStar: !earned.includes(skeleton.id)
    },
    kept: { progress, readable: kept.readable }
  };
}
