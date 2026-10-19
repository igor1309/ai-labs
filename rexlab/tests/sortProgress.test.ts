import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { describe, expect, it } from "vitest";
import { boardState, drop, finishBoard, mergeProgress, NO_SORTING, type Basket, type Beaten, type Celebration, type Sorting, type SortingProgress } from "../src/sorting/index.ts";
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
  it.each(AGE_LEVELS.flatMap((level) => {
    const total = { hatchling: 6, explorer: 8, paleontologist: 10 }[level];
    return Array.from({ length: total + 1 }, (_, right) => [level, right, total] as const);
  }))("derives %s's score of %i and passes it to the best-score rule", (level, right, total) => {
    const scoring = scoringSpy<Beaten>({ best: right, celebration: null });

    const result = finishBoard(sortedWith(right, level), NO_SORTING, scoring.beatBest);

    expect(result.score).toBe(right);
    expect(result.total).toBe(total);
    expect(scoring.asked).toEqual([[null, right]]);
  });

  it.each<[SortingProgress, number, Celebration | null, number | undefined]>([
    [NO_SORTING, 0, null, undefined],
    [NO_SORTING, 3, "first-best", undefined],
    [{ best: { ...NO_SORTING.best, hatchling: 0 }, roundsPlayed: 1 }, 1, "new-best", 0],
    [{ best: { ...NO_SORTING.best, hatchling: 4 }, roundsPlayed: 2 }, 6, "new-best", 4],
    [{ best: { ...NO_SORTING.best, hatchling: 5 }, roundsPlayed: 2 }, 3, null, 5]
  ])("from %j, asks the best-score rule about a board of %i right, and keeps the best it gives and its %s", (stored, right, celebration, previousBest) => {
    const scoring = scoringSpy<Beaten>({ best: 9, celebration });

    const result = finishBoard(sortedWith(right), stored, scoring.beatBest);

    expect(scoring.asked).toEqual([[stored.best.hatchling, right]]);
    expect(result).toEqual({
      level: "hatchling",
      score: right,
      total: 6,
      progress: { best: { ...stored.best, hatchling: 9 }, roundsPlayed: stored.roundsPlayed + 1 },
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

describe("mergeProgress", () => {
  const bests = [
    [null, null, null], [null, 0, 0], [0, null, 0], [0, 0, 0],
    [null, 5, 5], [5, null, 5], [3, 5, 5], [5, 3, 5], [5, 5, 5]
  ] as const;

  it.each(AGE_LEVELS.flatMap((level) => bests.map((bests) => [level, ...bests] as const)))(
    "merges %s's kept best %s and stored best %s into %s without changing either input",
    (level, keptBest, storedBest, best) => {
      const kept: SortingProgress = { best: { hatchling: 2, explorer: 4, paleontologist: 6, [level]: keptBest }, roundsPlayed: 3 };
      const stored: SortingProgress = { best: { hatchling: 1, explorer: 5, paleontologist: 7, [level]: storedBest }, roundsPlayed: 4 };
      const before = structuredClone([kept, stored]);

      expect(mergeProgress(kept, stored)).toEqual({ best: { hatchling: 2, explorer: 5, paleontologist: 7, [level]: best }, roundsPlayed: 4 });
      expect([kept, stored]).toEqual(before);
    }
  );

  it.each([[0, 0, 0], [4, 1, 4], [1, 4, 4], [4, 4, 4]])("keeps the higher round count from %i and %i", (kept, stored, roundsPlayed) => {
    expect(mergeProgress({ ...NO_SORTING, roundsPlayed: kept }, { ...NO_SORTING, roundsPlayed: stored }).roundsPlayed).toBe(roundsPlayed);
  });
});

it.each([
  ["hatchling", 5, { hatchling: 8, explorer: 6, paleontologist: null }],
  ["explorer", 6, { hatchling: 5, explorer: 8, paleontologist: null }],
  ["paleontologist", null, { hatchling: 5, explorer: 6, paleontologist: 8 }]
] as const)("scores %s against only its own best and retains the other levels' bests", (level, previousBest, best) => {
  const stored: SortingProgress = { best: { hatchling: 5, explorer: 6, paleontologist: null }, roundsPlayed: 9 };
  const scoring = scoringSpy<Beaten>({ best: 8, celebration: "new-best" });
  const result = finishBoard(sortedWith(3, level), stored, scoring.beatBest);
  expect(scoring.asked).toEqual([[previousBest, 3]]);
  expect(result).toEqual({ level, score: 3, total: { hatchling: 6, explorer: 8, paleontologist: 10 }[level], previousBest: previousBest ?? undefined, celebration: "new-best", progress: { best, roundsPlayed: 10 } });
  expect(stored).toEqual({ best: { hatchling: 5, explorer: 6, paleontologist: null }, roundsPlayed: 9 });
});
