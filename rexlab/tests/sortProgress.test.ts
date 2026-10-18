import { describe, expect, it } from "vitest";
import { boardState, drop, finishBoard, NO_SORTING, type Basket, type Beaten, type Celebration, type Sorting, type SortingProgress } from "../src/sorting/index.ts";
import { scoringSpy, sortingBy } from "./support.ts";

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
  it.each<[SortingProgress, number, Celebration | null, number | undefined]>([
    [NO_SORTING, 0, null, undefined],
    [NO_SORTING, 3, "first-best", undefined],
    [{ bestScore: 0, roundsPlayed: 1 }, 1, "new-best", 0],
    [{ bestScore: 4, roundsPlayed: 2 }, 6, "new-best", 4],
    [{ bestScore: 5, roundsPlayed: 2 }, 3, null, 5]
  ])("from %j, asks the best-score rule about a board of %i right, and keeps the best it gives and its %s", (stored, right, celebration, previousBest) => {
    const scoring = scoringSpy<Beaten>({ best: 9, celebration });

    const result = finishBoard(sortedWith(right), stored, scoring.beatBest);

    expect(scoring.asked).toEqual([[stored.bestScore, right]]);
    expect(result).toEqual({
      score: right,
      total: 6,
      progress: { bestScore: 9, roundsPlayed: stored.roundsPlayed + 1 },
      previousBest,
      celebration
    });
  });

  it("scores a board against no progress, asks the best-score rule nothing and celebrates nothing, when stored progress cannot be read", () => {
    const scoring = scoringSpy<Beaten>({ best: 9, celebration: "new-best" });

    expect(finishBoard(sortedWith(4), undefined, scoring.beatBest)).toEqual({ score: 4, total: 6, progress: undefined, previousBest: undefined, celebration: null });
    expect(scoring.asked).toEqual([]);
  });
});
