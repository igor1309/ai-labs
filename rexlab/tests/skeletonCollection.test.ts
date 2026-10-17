import { describe, expect, it } from "vitest";
import { finishSkeleton, NO_SKELETONS, PIECES, startPuzzle, type KeptSkeletons, type Puzzle, type SkeletonProgress } from "../src/skeletons/index.ts";
import { SHIPPED_SKELETONS, scoringSpy } from "./support.ts";

const ORDER = ["tyrannosaurus", "triceratops", "stegosaurus"];

// The shipped skeleton of `id` with every piece fitted.
function finished(id: string): Puzzle {
  const skeleton = SHIPPED_SKELETONS.find((each) => each.id === id);
  if (!skeleton) throw new Error(`No ${id} skeleton is shipped`);
  return { ...startPuzzle(skeleton), fitted: [...PIECES] };
}

const kept = (progress: SkeletonProgress, readable = true): KeptSkeletons => ({ progress, readable });

describe("finishing a skeleton", () => {
  it("earns its dinosaur's first star and scores the collection by the rule it is given", () => {
    const scoring = scoringSpy({ best: 1, celebration: "first-best" as const });

    const { result, kept: after } = finishSkeleton(kept(NO_SKELETONS), finished("triceratops"), ORDER, scoring.beatBest);

    expect(scoring.asked).toEqual([[null, 1]]);
    expect(after).toEqual(kept({ earned: ["triceratops"], bestScore: 1 }));
    expect(result).toEqual({
      skeleton: finished("triceratops").skeleton,
      score: 1,
      total: 3,
      best: 1,
      previousBest: undefined,
      celebration: "first-best",
      newStar: true
    });
  });

  it("keeps the stars in the skeletons' order, and counts a different dinosaur's star towards the collection", () => {
    const scoring = scoringSpy({ best: 3, celebration: "new-best" as const });

    const { result, kept: after } = finishSkeleton(kept({ earned: ["stegosaurus", "tyrannosaurus"], bestScore: 2 }), finished("triceratops"), ORDER, scoring.beatBest);

    expect(scoring.asked).toEqual([[2, 3]]);
    expect(after.progress).toEqual({ earned: ORDER, bestScore: 3 });
    expect([result.score, result.best, result.previousBest, result.celebration, result.newStar]).toEqual([3, 3, 2, "new-best", true]);
  });

  it("earns no second star for a dinosaur built again", () => {
    const scoring = scoringSpy({ best: 2, celebration: null });

    const { result, kept: after } = finishSkeleton(kept({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 }), finished("triceratops"), ORDER, scoring.beatBest);

    expect(scoring.asked).toEqual([[2, 2]]);
    expect(after.progress).toEqual({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 });
    expect([result.score, result.celebration, result.newStar]).toEqual([2, null, false]);
  });

  it("counts each dinosaur of the skeletons once, keeping a star of one no longer among them, untouched, after the others", () => {
    const scoring = scoringSpy({ best: 2, celebration: "new-best" as const });

    const { result, kept: after } = finishSkeleton(
      kept({ earned: ["allosaurus", "tyrannosaurus", "tyrannosaurus", "allosaurus"], bestScore: 1 }),
      finished("stegosaurus"),
      ORDER,
      scoring.beatBest
    );

    expect(scoring.asked).toEqual([[1, 2]]);
    expect(after.progress.earned).toEqual(["tyrannosaurus", "stegosaurus", "allosaurus"]);
    expect([result.score, result.total]).toEqual([2, 3]);
  });

  it("keeps the star with no best to show or celebrate when stored progress cannot be read", () => {
    const scoring = scoringSpy({ best: 1, celebration: "first-best" as const });

    const { result, kept: after } = finishSkeleton(kept(NO_SKELETONS, false), finished("tyrannosaurus"), ORDER, scoring.beatBest);

    expect(after).toEqual(kept({ earned: ["tyrannosaurus"], bestScore: 1 }, false));
    expect([result.score, result.best, result.previousBest, result.celebration]).toEqual([1, undefined, undefined, null]);
  });

  it("fails on a skeleton with a piece still in the tray", () => {
    const puzzle = { ...finished("tyrannosaurus"), fitted: ["skull", "spine", "legs"] as const };

    expect(() => finishSkeleton(kept(NO_SKELETONS), puzzle, ORDER, scoringSpy({ best: 1, celebration: null }).beatBest)).toThrow(
      "A skeleton is finished only once every piece is fitted"
    );
  });
});
