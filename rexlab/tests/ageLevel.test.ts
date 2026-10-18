import { describe, expect, it } from "vitest";
import { AGE_LEVELS, DEFAULT_AGE_LEVEL, isAgeLevel, pickAgeLevel, type AgeLevelSetting } from "../src/ageLevel.ts";
import { seededRandom } from "./support.ts";

// docs/age-levels.md

describe("the age levels", () => {
  it("are Hatchling, Explorer and Paleontologist, youngest first, and nothing else", () => {
    expect(AGE_LEVELS).toEqual(["hatchling", "explorer", "paleontologist"]);
    expect([...AGE_LEVELS, "Explorer", "toddler", "", null, 1].map(isAgeLevel)).toEqual([true, true, true, false, false, false, false, false]);
  });

  it("start at Explorer, which no parent has picked", () => {
    expect(DEFAULT_AGE_LEVEL).toEqual({ level: "explorer", revision: null });
  });
});

describe("a level a parent picks", () => {
  const PICKED: AgeLevelSetting = { level: "explorer", revision: "earlier" };

  it.each(AGE_LEVELS.flatMap((from) => AGE_LEVELS.filter((to) => to !== from).map((to) => [from, to] as const)))(
    "moves from %s to %s as a fresh revision, drawn from the random source",
    (from, to) => {
      const random = seededRandom(5);
      const draws: number[] = [];
      const counted = () => {
        const drawn = random();
        draws.push(drawn);
        return drawn;
      };

      const picked = pickAgeLevel({ level: from, revision: "earlier" }, to, counted);

      expect(picked.level).toBe(to);
      expect(picked.revision).toMatch(/^[0-9a-z]{16}$/);
      expect(draws).toHaveLength(16);
      expect(pickAgeLevel({ level: from, revision: "earlier" }, to, seededRandom(5))).toEqual(picked);
    }
  );

  it.each([PICKED, DEFAULT_AGE_LEVEL])("keeps the setting %o as it is when its own level is picked again, drawing nothing", (setting) => {
    const drawn = () => {
      throw new Error("A level already set draws no revision");
    };

    expect(pickAgeLevel(setting, setting.level, drawn)).toBe(setting);
  });

  it("never draws the same revision twice, picked to and fro", () => {
    const random = seededRandom(17);
    const revisions = new Set<string | null>();
    let setting = DEFAULT_AGE_LEVEL;
    for (let pick = 0; pick < 3000; pick++) {
      setting = pickAgeLevel(setting, AGE_LEVELS[(pick + 1) % AGE_LEVELS.length] ?? "explorer", random);
      revisions.add(setting.revision);
    }

    expect(revisions.size).toBe(3000);
  });
});
