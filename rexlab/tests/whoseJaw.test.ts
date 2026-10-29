import { describe, expect, it } from "vitest";
import { advanceJaw, currentJaw, nextJaw, placeJaw, startJawRound } from "../src/whoseJaw/index.ts";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { seededRandom } from "./support.ts";
import { JAWS } from "./whoseJaw.ts";

describe("Whose Jaw round rules", () => {
  it.each(AGE_LEVELS)("deals five distinct, solvable %s questions across the whole roster", (level) => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 48; seed++) {
      const round = startJawRound(JAWS, level, seededRandom(seed));
      expect(new Set(round.questions.map(({ owner }) => owner.id)).size).toBe(5);
      for (const { owner, choices } of round.questions) {
        seen.add(owner.id);
        expect(new Set(choices.map(({ id }) => id)).size).toBe(choices.length);
        expect(choices.filter(({ id }) => id === owner.id)).toHaveLength(1);
        if (level === "paleontologist") {
          expect(choices).toHaveLength(4);
          const pairs = [...new Set(choices.map(({ pair }) => pair))];
          expect(pairs).toHaveLength(2);
          for (const pair of pairs) expect(choices.filter((jaw) => jaw.pair === pair)).toHaveLength(2);
          const sameDietPartner = choices.find((jaw) => jaw.id !== owner.id && jaw.pair === owner.pair)!;
          expect(sameDietPartner.diet).toBe(owner.diet);
          expect(placeJaw({ ...advanceJaw(round), questions: [{ owner, choices }] }, sameDietPartner.id).phase).toBe("wrong");
        } else {
          expect(choices).toHaveLength(level === "hatchling" ? 2 : 3);
          expect(choices.filter(({ diet }) => diet === owner.diet).map(({ id }) => id)).toEqual([owner.id]);
        }
      }
    }
    expect([...seen].sort()).toEqual(JAWS.map(({ id }) => id).sort());
  });

  it.each(AGE_LEVELS)("keeps errors, first-try teeth and input locks through a complete %s round", (level) => {
    let round = startJawRound(JAWS, level, () => 0);
    expect(placeJaw(round, currentJaw(round).owner.id)).toBe(round);
    for (let index = 0; index < 5; index++) {
      round = advanceJaw(round);
      const { owner, choices } = currentJaw(round);
      expect(round.phase).toBe("waiting");
      expect(placeJaw(round, "absent")).toBe(round);
      if (index === 0) {
        const wrong = choices.find(({ id }) => id !== owner.id)!;
        for (let miss = 1; miss <= 2; miss++) {
          round = placeJaw(round, wrong.id);
          expect([round.phase, round.errors, round.misses, round.placed.length]).toEqual(["wrong", miss, miss, 0]);
          expect(placeJaw(round, owner.id)).toBe(round);
          round = advanceJaw(round);
          expect(currentJaw(round)).toEqual({ owner, choices });
        }
      }
      round = placeJaw(round, owner.id);
      expect(round.phase).toBe("right");
      expect(placeJaw(round, owner.id)).toBe(round);
      round = advanceJaw(round);
      expect(round.phase).toBe("reading");
      expect(advanceJaw(round)).toBe(round);
      expect(placeJaw(round, owner.id)).toBe(round);
      round = nextJaw(round);
      expect(nextJaw(round)).toBe(round);
      expect(round.placed.at(-1)).toEqual({ id: owner.id, firstTry: index !== 0 });
      expect(round.misses).toBe(0);
    }
    expect([round.phase, round.errors, round.placed.length]).toEqual(["done", 2, 5]);
    expect(advanceJaw(round)).toBe(round);
    expect(placeJaw(round, "tyrannosaurus")).toBe(round);
  });

  it("rejects rounds without enough owners, opposite diets or shape pairs", () => {
    expect(() => startJawRound(JAWS.slice(0, 4), "hatchling", () => 0)).toThrow("five distinct");
    expect(() => startJawRound([...JAWS, JAWS[0]!], "hatchling", () => 0)).toThrow("five distinct");
    expect(() => startJawRound(JAWS.filter(({ diet }) => diet === "meat"), "explorer", () => 0)).toThrow("opposite-diet");
    expect(() => startJawRound(JAWS.slice(1), "paleontologist", () => 0)).toThrow("look-alike");
  });

  it.each(AGE_LEVELS)("requires a settled correct answer for Next at %s", (level) => {
    const entering = startJawRound(JAWS, level, () => 0);
    const waiting = advanceJaw(entering);
    const { owner, choices } = currentJaw(waiting);
    const wrong = placeJaw(waiting, choices.find(({ id }) => id !== owner.id)!.id);
    const right = placeJaw(waiting, owner.id);
    for (const round of [entering, waiting, wrong, right]) expect(nextJaw(round)).toBe(round);
    const reading = advanceJaw(right);
    expect(reading).toEqual({ ...right, phase: "reading" });
    for (let at = 0; at < 100; at++) expect(advanceJaw(reading)).toBe(reading);
    const next = nextJaw(reading);
    expect([next.phase, next.placed, currentJaw(next)]).toEqual([
      "entering", [{ id: owner.id, firstTry: true }], entering.questions[1]
    ]);
    expect(nextJaw(next)).toBe(next);
  });
});
