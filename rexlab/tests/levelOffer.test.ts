import { describe, expect, it } from "vitest";
import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { acceptOffer, countBoard, NO_LEVEL_OFFER, offeredLevel, showOffer, type LevelOffer } from "../src/levelOffer.ts";

function run(state: LevelOffer, level: AgeLevel, boards: number) {
  for (let board = 0; board < boards; board++) state = countBoard(state, level, true);
  return state;
}

describe("the shared level offer rule", () => {
  it.each(AGE_LEVELS)("offers only the next level after three strong %s boards", (level) => {
    let state = NO_LEVEL_OFFER;
    expect(offeredLevel(state)).toBeUndefined();
    for (let board = 1; board <= 10; board++) {
      state = countBoard(state, level, true);
      expect(offeredLevel(state)).toBe(board < 3 ? undefined : AGE_LEVELS[AGE_LEVELS.indexOf(level) + 1]);
    }
    expect(NO_LEVEL_OFFER).toEqual({ level: null, strong: 0, declined: [] });
  });

  it.each(AGE_LEVELS)("a weak board or a different level breaks a run at %s", (level) => {
    const state = run(NO_LEVEL_OFFER, level, 2);
    expect(countBoard(state, level, false)).toEqual({ level, strong: 0, declined: [] });
    for (const other of AGE_LEVELS.filter((each) => each !== level)) {
      expect(countBoard(state, other, true)).toEqual({ level: other, strong: 1, declined: [] });
      expect(countBoard(state, other, false)).toEqual({ level: other, strong: 0, declined: [] });
    }
    expect(state.strong).toBe(2);
  });

  it.each(["hatchling", "explorer"] as const)("showing at %s resets the count and requires five until YES", (level) => {
    const due = run(NO_LEVEL_OFFER, level, 3);
    const shown = showOffer(due);
    expect(shown).toEqual({ level, strong: 0, declined: [level] });
    for (let board = 1; board <= 5; board++) {
      expect(offeredLevel(run(shown, level, board))).toBe(board === 5 ? offeredLevel(due) : undefined);
    }
    const shownAgain = showOffer(run(shown, level, 5));
    expect(shownAgain).toEqual(shown);
    const accepted = acceptOffer(shownAgain);
    expect(accepted).toEqual({ level, strong: 0, declined: [] });
    expect(offeredLevel(run(accepted, level, 3))).toBe(offeredLevel(due));
    expect(due.declined).toEqual([]);
  });

  it("keeps declines through weak boards and other levels, and removes only the accepted level's", () => {
    const hatchling = showOffer(run(NO_LEVEL_OFFER, "hatchling", 3));
    const weak = countBoard(hatchling, "hatchling", false);
    const explorer = run(weak, "explorer", 3);
    expect(offeredLevel(explorer)).toBe("paleontologist");
    const both = showOffer(explorer);
    expect(both.declined).toEqual(["hatchling", "explorer"]);
    const accepted = acceptOffer(both);
    expect(accepted.declined).toEqual(["hatchling"]);
    expect(offeredLevel(run(accepted, "hatchling", 4))).toBeUndefined();
    expect(offeredLevel(run(accepted, "hatchling", 5))).toBe("explorer");
  });

  it("does not record an offer that is not due, including at the top", () => {
    for (const state of [NO_LEVEL_OFFER, run(NO_LEVEL_OFFER, "explorer", 2), run(NO_LEVEL_OFFER, "paleontologist", 10)]) {
      expect(showOffer(state)).toBe(state);
    }
  });
});
