import { describe, expect, it } from "vitest";
import { boardState, drop, finishBoard, NO_SORTING, type Basket, type Celebration, type Sorting, type SortingProgress } from "../src/sorting/index.ts";
import { sortingBy } from "./support.ts";

// A board sorted to the end, the first `right` cards on their first drop
// and each other one on the wrong basket first.
function sortedWith(right: number): Sorting {
  const start = sortingBy("diet");
  const [first, second] = boardState(start).baskets;
  const other = (basket: Basket) => (basket === first ? second : first);
  return boardState(start).cards.reduce((sorting, { dinosaur, basket }, at) => {
    const tried = at < right ? sorting : drop(sorting, dinosaur.id, other(basket));
    return drop(tried, dinosaur.id, basket);
  }, start);
}

describe("finishBoard", () => {
  it.each<[SortingProgress, number, Celebration | null, number, number | undefined]>([
    [NO_SORTING, 0, null, 0, undefined],
    [NO_SORTING, 3, "first-best", 3, undefined],
    [{ bestScore: 0, roundsPlayed: 1 }, 1, "new-best", 1, 0],
    [{ bestScore: 4, roundsPlayed: 2 }, 5, "new-best", 5, 4],
    [{ bestScore: 5, roundsPlayed: 2 }, 5, null, 5, 5],
    [{ bestScore: 5, roundsPlayed: 2 }, 3, null, 5, 5],
    [{ bestScore: 6, roundsPlayed: 2 }, 0, null, 6, 6]
  ])("from %j, a board of %i right celebrates %s and leaves a best of %i", (stored, right, celebration, best, previousBest) => {
    expect(finishBoard(sortedWith(right), stored)).toEqual({
      score: right,
      total: 6,
      progress: { bestScore: best, roundsPlayed: stored.roundsPlayed + 1 },
      previousBest,
      celebration
    });
  });

  it("scores a board against no progress, and celebrates nothing, when stored progress cannot be read", () => {
    expect(finishBoard(sortedWith(4), undefined)).toEqual({ score: 4, total: 6, progress: undefined, previousBest: undefined, celebration: null });
  });
});
