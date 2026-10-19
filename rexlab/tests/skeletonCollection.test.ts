import { describe, expect, it } from "vitest";
import { finishSkeleton, knockDown, museumOf, NO_SKELETONS, openCollection, startPuzzle, type Badge, type KeptSkeletons, type Puzzle, type SkeletonProgress } from "../src/skeletons/index.ts";
import { SHIPPED_SKELETONS, scoringSpy } from "./support.ts";

const ORDER = ["tyrannosaurus", "triceratops", "stegosaurus"];

// The shipped skeleton of `id` with every piece fitted.
function finished(id: string): Puzzle {
  const skeleton = SHIPPED_SKELETONS.find((each) => each.id === id);
  if (!skeleton) throw new Error(`No ${id} skeleton is shipped`);
  return { ...startPuzzle(skeleton, skeleton.cuts.hatchling), fitted: skeleton.cuts.hatchling.map(({ id }) => id) };
}

// Kept progress of these stars and best, with the stands of `rebuilding`
// awaiting their skeletons.
const kept = ({ earned, bestScore }: Omit<SkeletonProgress, "rebuilding" | "badges">, readable = true, rebuilding: readonly string[] = []): KeptSkeletons => ({
  progress: { earned, bestScore, rebuilding, badges: {} },
  readable
});

describe("opening the collection", () => {
  it("keeps the progress stored, its stands awaiting their skeletons among it", () => {
    const stored = { earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: ["triceratops"], badges: {} };

    expect(openCollection(stored, ORDER)).toEqual({ progress: stored, readable: true });
  });

  it("opens with no progress, and none to compare with, when stored progress cannot be read", () => {
    expect(openCollection(undefined, ORDER)).toEqual({ progress: NO_SKELETONS, readable: false });
  });

  it.each<[string, Omit<SkeletonProgress, "rebuilding" | "badges">, number | null]>([
    ["repeats a dinosaur", { earned: ["tyrannosaurus", "tyrannosaurus"], bestScore: 2 }, 1],
    ["names a dinosaur with no skeleton", { earned: ["allosaurus", "triceratops"], bestScore: 3 }, 1],
    ["names only dinosaurs with no skeleton", { earned: ["allosaurus"], bestScore: 1 }, null],
    ["has a best its stars fall short of", { earned: ORDER, bestScore: 5 }, 3]
  ])("caps a best that a save which %s would inflate at the different dinosaurs with a star", (_, stored, best) => {
    const opened = openCollection({ ...stored, rebuilding: [], badges: {} }, ORDER);

    expect(opened.progress).toEqual({ ...stored, bestScore: best, rebuilding: [], badges: {} });
    expect(museumOf(opened, SHIPPED_SKELETONS).best).toBe(best ?? undefined);
  });

  it("keeps a best that is no more than the stars counted", () => {
    const stored = { earned: ["stegosaurus", "allosaurus"], bestScore: 1, rebuilding: [], badges: {} };

    expect(openCollection(stored, ORDER).progress.bestScore).toBe(1);
  });
});

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
    expect(after.progress).toEqual({ earned: ORDER, bestScore: 3, rebuilding: [], badges: {} });
    expect([result.score, result.best, result.previousBest, result.celebration, result.newStar]).toEqual([3, 3, 2, "new-best", true]);
  });

  it("earns no second star for a dinosaur built again", () => {
    const scoring = scoringSpy({ best: 2, celebration: null });

    const { result, kept: after } = finishSkeleton(kept({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 }), finished("triceratops"), ORDER, scoring.beatBest);

    expect(scoring.asked).toEqual([[2, 2]]);
    expect(after.progress).toEqual({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: [], badges: {} });
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

  it("stands a skeleton knocked down to be built again back on its stand, with no second star or best", () => {
    const scoring = scoringSpy({ best: 2, celebration: null });

    const { result, kept: after } = finishSkeleton(
      kept({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 }, true, ["tyrannosaurus", "triceratops"]),
      finished("triceratops"),
      ORDER,
      scoring.beatBest
    );

    expect(after).toEqual(kept({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 }, true, ["tyrannosaurus"]));
    expect([result.score, result.best, result.celebration, result.newStar]).toEqual([2, 2, null, false]);
  });

  it("fails on a skeleton with a piece still in the tray", () => {
    const puzzle = { ...finished("tyrannosaurus"), fitted: ["skull", "spine", "legs"] as const };

    expect(() => finishSkeleton(kept(NO_SKELETONS), puzzle, ORDER, scoringSpy({ best: 1, celebration: null }).beatBest)).toThrow(
      "A skeleton is finished only once every piece is fitted"
    );
  });
});

describe("knocking a skeleton down", () => {
  it("leaves its star and best as they are, its stand waiting for it", () => {
    const before = kept({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 }, true, ["tyrannosaurus"]);

    expect(knockDown(before, "triceratops")).toEqual(kept({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 }, true, ["tyrannosaurus", "triceratops"]));
  });

  it.each([
    ["one not earned", "stegosaurus"],
    ["one already knocked down", "tyrannosaurus"]
  ])("knocks nothing down of %s", (_, id) => {
    const before = kept({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2 }, true, ["tyrannosaurus"]);

    expect(knockDown(before, id)).toBe(before);
  });
});

describe("the museum", () => {
  const states = (museum: ReturnType<typeof museumOf>) => museum.stands.map(({ skeleton, state }) => [skeleton.id, state]);

  it("has an empty stand for each skeleton, in their order, before any is built", () => {
    const museum = museumOf(kept(NO_SKELETONS), SHIPPED_SKELETONS);

    expect(states(museum)).toEqual(ORDER.map((id) => [id, "empty"]));
    expect([museum.score, museum.total, museum.best]).toEqual([0, 3, undefined]);
  });

  it("stands each earned skeleton on its stand, and keeps the stand of one knocked down waiting for it, its star counted", () => {
    const museum = museumOf(kept({ earned: ["triceratops", "tyrannosaurus"], bestScore: 2 }, true, ["tyrannosaurus"]), SHIPPED_SKELETONS);

    expect(states(museum)).toEqual([
      ["tyrannosaurus", "rebuilding"],
      ["triceratops", "built"],
      ["stegosaurus", "empty"]
    ]);
    expect([museum.score, museum.total, museum.best]).toEqual([2, 3, 2]);
  });

  it("gives a dinosaur kept twice one stand and one star, and one with no skeleton none", () => {
    const museum = museumOf(kept({ earned: ["tyrannosaurus", "allosaurus", "tyrannosaurus"], bestScore: 1 }), SHIPPED_SKELETONS);

    expect(states(museum)).toEqual([
      ["tyrannosaurus", "built"],
      ["triceratops", "empty"],
      ["stegosaurus", "empty"]
    ]);
    expect([museum.score, museum.total]).toEqual([1, 3]);
  });

  it("shows no best when stored progress cannot be read, but counts the stars earned meanwhile", () => {
    const museum = museumOf(kept({ earned: ["stegosaurus"], bestScore: 1 }, false), SHIPPED_SKELETONS);

    expect(states(museum)).toEqual([
      ["tyrannosaurus", "empty"],
      ["triceratops", "empty"],
      ["stegosaurus", "built"]
    ]);
    expect([museum.score, museum.best]).toEqual([1, undefined]);
  });
});

describe("level badges", () => {
  // The shipped skeleton of `id` finished at a level offering `badge`,
  // after help's last step showed or not.
  const finishedFor = (id: string, badge: Badge | undefined, lastStepShown = false): Puzzle => ({ ...finished(id), badge, lastStepShown });
  const withBadges = (badges: SkeletonProgress["badges"]): KeptSkeletons => ({ progress: { earned: ["triceratops"], bestScore: 1, rebuilding: [], badges }, readable: true });
  const finish = (from: KeptSkeletons, puzzle: Puzzle) => finishSkeleton(from, puzzle, ORDER, scoringSpy({ best: 1, celebration: null }).beatBest);

  it("are earned by a skeleton finished without help's last step, at a level that offers one", () => {
    const { result, kept: after } = finish(withBadges({}), finishedFor("triceratops", "explorer"));

    expect([result.badge, after.progress.badges]).toEqual(["explorer", { triceratops: ["explorer"] }]);
  });

  it.each<[string, Badge | undefined, boolean]>([
    ["after help's last step showed", "paleontologist", true],
    ["at a level that offers none", undefined, false]
  ])("are not earned %s, the star earned all the same", (_, badge, lastStepShown) => {
    const { result, kept: after } = finish(withBadges({}), finishedFor("stegosaurus", badge, lastStepShown));

    expect([result.badge, result.newStar, after.progress.badges, after.progress.earned]).toEqual([undefined, true, {}, ["triceratops", "stegosaurus"]]);
  });

  it("are kept for good: a later try with help takes none away", () => {
    const { result, kept: after } = finish(withBadges({ triceratops: ["explorer"] }), finishedFor("triceratops", "explorer", true));

    expect([result.badge, after.progress.badges]).toEqual([undefined, { triceratops: ["explorer"] }]);
  });

  it("are each level's own, kept in the levels' order, and earned again without a second", () => {
    const paleontologist = finish(withBadges({ triceratops: ["explorer"], stegosaurus: ["paleontologist"] }), finishedFor("triceratops", "paleontologist")).kept;
    const again = finish(paleontologist, finishedFor("stegosaurus", "explorer")).kept;
    const twice = finish(again, finishedFor("triceratops", "explorer"));

    expect(again.progress.badges).toEqual({ triceratops: ["explorer", "paleontologist"], stegosaurus: ["explorer", "paleontologist"] });
    expect([twice.result.badge, twice.kept.progress.badges]).toEqual(["explorer", again.progress.badges]);
  });

  it("stay through a skeleton knocked down to be built again, and show on its stand", () => {
    const knocked = knockDown(withBadges({ triceratops: ["explorer", "paleontologist"], allosaurus: ["explorer"] }), "triceratops");

    expect(knocked.progress.badges).toEqual({ triceratops: ["explorer", "paleontologist"], allosaurus: ["explorer"] });
    expect(museumOf(knocked, SHIPPED_SKELETONS).stands.map(({ skeleton, state, badges }) => [skeleton.id, state, badges])).toEqual([
      ["tyrannosaurus", "empty", []],
      ["triceratops", "rebuilding", ["explorer", "paleontologist"]],
      ["stegosaurus", "empty", []]
    ]);
  });
});
