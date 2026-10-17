import { describe, expect, it } from "vitest";
import { NO_PROGRESS, finishRound, type Beaten, type Celebration } from "../src/quiz/progress.ts";
import { scoringSpy } from "./support.ts";

describe("finishRound", () => {
  it.each<[number | null, number, Celebration | null]>([
    [null, 0, null],
    [null, 4, "first-best"],
    [6, 7, "new-best"],
    [7, 5, null]
  ])("from a best of %s, asks the best-score rule about a round of %i, and keeps the best it gives and its %s", (bestScore, score, celebration) => {
    const scoring = scoringSpy<Beaten>({ best: 11, celebration });

    const outcome = finishRound({ bestScore, roundsPlayed: 3 }, score, scoring.beatBest);

    expect(scoring.asked).toEqual([[bestScore, score]]);
    expect(outcome).toEqual({ progress: { bestScore: 11, roundsPlayed: 4 }, celebration });
  });

  it("counts the first finished round from no progress", () => {
    const scoring = scoringSpy<Beaten>({ best: 4, celebration: "first-best" });

    expect(finishRound(NO_PROGRESS, 4, scoring.beatBest).progress).toEqual({ bestScore: 4, roundsPlayed: 1 });
  });
});
