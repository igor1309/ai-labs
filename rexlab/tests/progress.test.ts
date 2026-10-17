import { describe, expect, it } from "vitest";
import { NO_PROGRESS, finishRound, type Celebration } from "../src/quiz/progress.ts";

describe("finishRound", () => {
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
  ])("from a best of %s, a round of %i celebrates %s and leaves a best of %i", (bestScore, score, celebration, best) => {
    const outcome = finishRound({ bestScore, roundsPlayed: 3 }, score);

    expect(outcome).toEqual({ progress: { bestScore: best, roundsPlayed: 4 }, celebration });
  });

  it("counts the first finished round from no progress", () => {
    expect(finishRound(NO_PROGRESS, 4).progress).toEqual({ bestScore: 4, roundsPlayed: 1 });
  });
});
