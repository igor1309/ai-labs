import { describe, expect, it } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import { memoryStorage } from "./support.ts";

const saved = (value: unknown) => JSON.stringify(value);

describe("localAgeLevel", () => {
  it("is kept under a key of its own, apart from the games' progress, the language and the theme", () => {
    expect(AGE_LEVEL_KEY).toBe("rexlab-age-level");
    expect([PROGRESS_KEY, LANGUAGE_KEY, THEME_KEY]).not.toContain(AGE_LEVEL_KEY);
  });

  it.each(AGE_LEVELS)("reads a picked %s with its revision", (level) => {
    const storage = memoryStorage({ [AGE_LEVEL_KEY]: saved({ level, revision: "r1" }) });

    expect(localAgeLevel(() => storage).load()).toEqual({ level, revision: "r1" });
  });

  it.each([
    ["empty storage", memoryStorage()],
    ["a level the app does not have", memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "toddler", revision: "r1" }) })],
    ["a level in another case", memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "Explorer", revision: "r1" }) })],
    ["a bare level", memoryStorage({ [AGE_LEVEL_KEY]: "explorer" })],
    ["a level without its revision", memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "hatchling" }) })],
    ["an empty revision", memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "hatchling", revision: "" }) })],
    ["a revision that is not text", memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "hatchling", revision: 7 }) })],
    ["a list", memoryStorage({ [AGE_LEVEL_KEY]: saved(["hatchling", "r1"]) })],
    ["null", memoryStorage({ [AGE_LEVEL_KEY]: "null" })],
    ["text that is not JSON", memoryStorage({ [AGE_LEVEL_KEY]: "{level" })],
    ["storage that cannot be read", memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "hatchling", revision: "r1" }) }, { read: false })]
  ])("reads no setting from %s", (_, storage) => {
    expect(localAgeLevel(() => storage).load()).toBeUndefined();
  });

  it("reads no setting and saves nothing when the storage cannot be reached", () => {
    const ageLevel = localAgeLevel(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });

    expect(ageLevel.load()).toBeUndefined();
    expect(() => ageLevel.save({ level: "hatchling", revision: "r1" })).not.toThrow();
  });

  it("keeps the picked level and its revision, replacing the one before, and touches nothing else", () => {
    const progress = saved({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 } } });
    const storage = memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "explorer", revision: "r1" }), [PROGRESS_KEY]: progress });
    const ageLevel = localAgeLevel(() => storage);

    ageLevel.save({ level: "paleontologist", revision: "r2" });

    expect(JSON.parse(storage.items.get(AGE_LEVEL_KEY) ?? "")).toEqual({ level: "paleontologist", revision: "r2" });
    expect(ageLevel.load()).toEqual({ level: "paleontologist", revision: "r2" });
    expect([...storage.items.keys()].sort()).toEqual([AGE_LEVEL_KEY, PROGRESS_KEY].sort());
    expect(storage.items.get(PROGRESS_KEY)).toBe(progress);
  });

  it("drops a setting that cannot be saved and keeps the stored one", () => {
    const storage = memoryStorage({ [AGE_LEVEL_KEY]: saved({ level: "paleontologist", revision: "r1" }) }, { save: false });
    const ageLevel = localAgeLevel(() => storage);

    expect(() => ageLevel.save({ level: "hatchling", revision: "r2" })).not.toThrow();

    expect(ageLevel.load()).toEqual({ level: "paleontologist", revision: "r1" });
  });
});
