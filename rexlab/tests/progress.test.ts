import { describe, expect, it } from "vitest";
import { NO_PROGRESS, bestForLevel, finishRound, mergeProgress, type Beaten, type Celebration } from "../src/quiz/progress.ts";
import { scoringSpy } from "./support.ts";

describe("finishRound", () => {
  it.each<[number | null, number, Celebration | null]>([
    [null, 0, null],
    [null, 4, "first-best"],
    [6, 7, "new-best"],
    [7, 5, null]
  ])("from a best of %s, asks the best-score rule about a round of %i, and keeps the best it gives and its %s", (best, score, celebration) => {
    const scoring = scoringSpy<Beaten>({ best: 11, celebration });

    const outcome = finishRound({ best: { hatchling: best, explorer: null, paleontologist: null }, roundsPlayed: 3 }, "hatchling", score, scoring.beatBest);

    expect(scoring.asked).toEqual([[best, score]]);
    expect(outcome).toEqual({ progress: { best: { hatchling: 11, explorer: null, paleontologist: null }, roundsPlayed: 4 }, celebration });
  });

  it("counts the first finished round from no progress", () => {
    const scoring = scoringSpy<Beaten>({ best: 4, celebration: "first-best" });

    expect(finishRound(NO_PROGRESS, "hatchling", 4, scoring.beatBest).progress).toEqual({ best: { hatchling: 4, explorer: null, paleontologist: null }, roundsPlayed: 1 });
  });

  it("scores a round against its own level's best and keeps the other levels'", () => {
    const scoring = scoringSpy<Beaten>({ best: 4, celebration: "first-best" });
    const previous = { best: { hatchling: 8, explorer: 6, paleontologist: null }, roundsPlayed: 5 };

    const outcome = finishRound(previous, "paleontologist", 4, scoring.beatBest);

    expect(scoring.asked).toEqual([[null, 4]]);
    expect(outcome.progress).toEqual({ best: { hatchling: 8, explorer: 6, paleontologist: 4 }, roundsPlayed: 6 });
    expect(bestForLevel(outcome.progress, "explorer")).toBe(6);
  });
});

describe("mergeProgress", () => {
  it("keeps the higher best of each level and the most rounds", () => {
    const kept = { best: { hatchling: 5, explorer: null, paleontologist: 3 }, roundsPlayed: 4 };
    const stored = { best: { hatchling: 7, explorer: 2, paleontologist: null }, roundsPlayed: 6 };

    expect(mergeProgress(kept, stored)).toEqual({ best: { hatchling: 7, explorer: 2, paleontologist: 3 }, roundsPlayed: 6 });
  });
});
