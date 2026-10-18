import { describe, expect, it } from "vitest";
import { beatBest, type Celebration } from "../src/bestScore.ts";

describe("beatBest", () => {
  it.each<[number | null, number, Celebration | null, number]>([
    [null, 0, null, 0],
    [null, 1, "first-best", 1],
    [null, 10, "first-best", 10],
    [0, 0, null, 0],
    [0, 1, "new-best", 1],
    [6, 7, "new-best", 7],
    [9, 10, "new-best", 10],
    [7, 7, null, 7],
    [7, 5, null, 7],
    [10, 0, null, 10]
  ])("from a best of %s, a round of %i celebrates %s and leaves a best of %i", (previous, score, celebration, best) => {
    expect(beatBest(previous, score)).toEqual({ best, celebration });
  });
});
