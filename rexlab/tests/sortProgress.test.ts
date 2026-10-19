import type { AgeLevel } from "../src/ageLevel.ts";
import { describe, expect, it } from "vitest";
import { boardState, drop, finishBoard, NO_SORTING, type Basket, type Beaten, type Celebration, type Sorting, type SortingProgress } from "../src/sorting/index.ts";
import { scoringSpy, sortingBy } from "./support.ts";

// A board sorted to the end, the first `right` cards on their first drop
// and each other one on the wrong basket first.
function sortedWith(right: number, level: AgeLevel = "hatchling"): Sorting {
  const start = sortingBy(level === "paleontologist" ? "legs" : "diet", undefined, 1, level);
  const [first, second] = boardState(start).baskets;
  const other = (basket: Basket) => (basket === first ? second : first);
  return boardState(start).cards.reduce((sorting, { dinosaur, basket }, at) => {
    const tried = at < right ? sorting : drop(sorting, dinosaur.id, other(basket));
    return drop(tried, dinosaur.id, basket);
  }, start);
}

describe("finishBoard", () => {
  it.each<[SortingProgress, number, Celebration | null, number | undefined]>([
    [NO_SORTING, 0, null, undefined],
    [NO_SORTING, 3, "first-best", undefined],
    [{ ...NO_SORTING, bestScore: 0, roundsPlayed: 1 }, 1, "new-best", 0],
    [{ ...NO_SORTING, bestScore: 4, roundsPlayed: 2 }, 6, "new-best", 4],
    [{ ...NO_SORTING, bestScore: 5, roundsPlayed: 2 }, 3, null, 5]
  ])("from %j, asks the best-score rule about a board of %i right, and keeps the best it gives and its %s", (stored, right, celebration, previousBest) => {
    const scoring = scoringSpy<Beaten>({ best: 9, celebration });

    const result = finishBoard(sortedWith(right), stored, scoring.beatBest);

    expect(scoring.asked).toEqual([[stored.bestScore, right]]);
    expect(result).toEqual({
      level: "hatchling",
      score: right,
      total: 6,
      progress: { ...stored, bestScore: 9, roundsPlayed: stored.roundsPlayed + 1 },
      previousBest,
      celebration
    });
  });

  it("scores a board against no progress, asks the best-score rule nothing and celebrates nothing, when stored progress cannot be read", () => {
    const scoring = scoringSpy<Beaten>({ best: 9, celebration: "new-best" });

    expect(finishBoard(sortedWith(4), undefined, scoring.beatBest)).toEqual({ level: "hatchling", score: 4, total: 6, progress: undefined, previousBest: undefined, celebration: null });
    expect(scoring.asked).toEqual([]);
  });
});

it.each([
  ["hatchling", 5, { bestScore: 8, explorerBest: 6, paleontologistBest: null }],
  ["explorer", 6, { bestScore: 5, explorerBest: 8, paleontologistBest: null }],
  ["paleontologist", null, { bestScore: 5, explorerBest: 6, paleontologistBest: 8 }]
] as const)("scores %s against only its own best and preserves its choice", (level, previousBest, bests) => {
  const stored = { bestScore: 5, explorerBest: 6, paleontologistBest: null, roundsPlayed: 9, levelChoice: { level: "explorer" as const, revision: "parent" } };
  const scoring = scoringSpy<Beaten>({ best: 8, celebration: "new-best" });
  const result = finishBoard(sortedWith(3, level), stored, scoring.beatBest);
  expect(scoring.asked).toEqual([[previousBest, 3]]);
  expect(result).toEqual({ level, score: 3, total: { hatchling: 6, explorer: 8, paleontologist: 10 }[level], previousBest: previousBest ?? undefined, celebration: "new-best", progress: { ...stored, ...bests, roundsPlayed: 10 } });
});
