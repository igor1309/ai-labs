import { isComplete, type Puzzle, type Skeleton } from "./puzzle.ts";

// What a child has done in the skeleton game: the ids of the dinosaurs
// whose skeleton they have finished, each earning one star for good, in
// the skeleton list's order, the best collection score, null until a
// skeleton is finished, and the ids of the earned skeletons knocked down
// to be built again, whose stands wait for them. A rebuild keeps no
// fitted bones: one left unfinished starts afresh.
export type SkeletonProgress = {
  earned: readonly string[];
  bestScore: number | null;
  rebuilding: readonly string[];
};

export const NO_SKELETONS: SkeletonProgress = { earned: [], bestScore: null, rebuilding: [] };

// The progress the game goes by while the app is open. When stored
// progress cannot be read there is no best to compare with, but stars
// earned meanwhile are still kept.
export type KeptSkeletons = { progress: SkeletonProgress; readable: boolean };

// The progress the game opens with, from `stored`, the progress kept, or
// undefined when it cannot be read. A best is never more than the different
// dinosaurs of `order` with a star, so a save that repeats a dinosaur, or
// names one with no skeleton, cannot inflate it; with none of them there
// is no best.
export function openCollection(stored: SkeletonProgress | undefined, order: readonly string[]): KeptSkeletons {
  if (stored === undefined) return { progress: NO_SKELETONS, readable: false };
  const stars = starsOf(stored.earned, order).length;
  const bestScore = stored.bestScore === null || stars === 0 ? null : Math.min(stored.bestScore, stars);
  return { progress: { ...stored, bestScore }, readable: true };
}

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
  const { earned, bestScore, rebuilding } = kept.progress;
  const { skeleton } = puzzle;
  const all = [...new Set([...earned, skeleton.id])];
  const stars = starsOf(all, order);
  const beaten = beatBest(bestScore, stars.length);
  // A skeleton finished stands on its stand again.
  const progress: SkeletonProgress = {
    earned: [...stars, ...all.filter((id) => !order.includes(id))],
    bestScore: beaten.best,
    rebuilding: rebuilding.filter((id) => id !== skeleton.id)
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

// Each dinosaur of `order` with a star counts once; one no longer in it
// has no star to show.
function starsOf(earned: readonly string[], order: readonly string[]): string[] {
  return order.filter((id) => earned.includes(id));
}

// An earned skeleton knocked down to be built again keeps its star and its
// stand, which waits for it until it is finished again. One not earned,
// or already knocked down, has nothing to knock down.
export function knockDown(kept: KeptSkeletons, id: string): KeptSkeletons {
  const { earned, rebuilding } = kept.progress;
  if (!earned.includes(id) || rebuilding.includes(id)) return kept;
  return { ...kept, progress: { ...kept.progress, rebuilding: [...rebuilding, id] } };
}

// A stand shows its skeleton once earned, and its silhouette while the
// skeleton is still to build, or has been knocked down to be built again.
export type StandState = "built" | "rebuilding" | "empty";

export type Stand = { skeleton: Skeleton; state: StandState };

export type Museum = {
  // One stand for each skeleton, in their order.
  stands: Stand[];
  // The collection score: the dinosaurs with a star, a stand awaiting its
  // skeleton among them, out of every skeleton there is to build.
  score: number;
  total: number;
  // Undefined until a skeleton is finished, or when stored progress cannot
  // be read: there is no best to show.
  best: number | undefined;
};

// The museum of every skeleton there is to build: a star of a dinosaur
// with no skeleton, or kept twice, gets no stand of its own and counts
// for nothing.
export function museumOf(kept: KeptSkeletons, skeletons: readonly Skeleton[]): Museum {
  const { earned, bestScore, rebuilding } = kept.progress;
  const order = skeletons.map(({ id }) => id);
  return {
    stands: skeletons.map((skeleton) => ({
      skeleton,
      state: !earned.includes(skeleton.id) ? "empty" : rebuilding.includes(skeleton.id) ? "rebuilding" : "built"
    })),
    score: starsOf(earned, order).length,
    total: skeletons.length,
    best: kept.readable ? (bestScore ?? undefined) : undefined
  };
}
