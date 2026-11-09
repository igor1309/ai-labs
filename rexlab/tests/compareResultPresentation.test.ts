import { expect, test } from "vitest";
import { presentResult } from "../src/presentation.ts";
import type { RoundResult } from "../src/quiz/index.ts";

const rewards = [
  { score: 4, previousBest: undefined, best: 4, celebration: "first-best" },
  { score: 7, previousBest: 6, best: 7, celebration: "new-best" },
  { score: 5, previousBest: 7, best: 7, celebration: null },
  { score: 7, previousBest: 7, best: 7, celebration: null },
  { score: 0, previousBest: undefined, best: 0, celebration: null },
  { score: 4, previousBest: undefined, best: undefined, celebration: null }
] as const;
for (const level of ["hatchling", "explorer", "paleontologist"] as const) for (const reward of rewards) {
  test(`presents the finished ${level} reward ${JSON.stringify(reward)}`, () => {
    const result: RoundResult = {
      level, score: reward.score, total: 10, previousBest: reward.previousBest, celebration: reward.celebration,
      progress: reward.best === undefined ? undefined : {
        best: { hatchling: 1, explorer: 2, paleontologist: 3, [level]: reward.best }, roundsPlayed: 4
      }
    };
    expect(presentResult(result)).toEqual({
      score: reward.score, total: 10, best: reward.best, celebration: reward.celebration,
      beaten: reward.celebration === "new-best" ? reward.previousBest : undefined
    });
  });
}
