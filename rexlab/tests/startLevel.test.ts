import { describe, expect, it } from "vitest";
import { AGE_LEVELS, DEFAULT_AGE_LEVEL, pickAgeLevel, type AgeLevel, type AgeLevelSetting } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { startLevel, type LevelChoice, type OfferedLevels } from "../src/startLevel.ts";
import { memoryStorage, seededRandom, type MemoryStorage } from "./support.ts";

const ALL_THREE: OfferedLevels = ["hatchling", "explorer", "paleontologist"];

// age-level-start.feature

describe("the level a game starts at", () => {
  it.each([
    [["hatchling"], "paleontologist", "hatchling"],
    [["hatchling", "explorer"], "paleontologist", "explorer"],
    [["hatchling", "explorer"], "hatchling", "hatchling"],
    [["hatchling", "paleontologist"], "explorer", "hatchling"],
    [ALL_THREE, "hatchling", "hatchling"],
    [ALL_THREE, "explorer", "explorer"],
    [ALL_THREE, "paleontologist", "paleontologist"]
  ] satisfies Array<[OfferedLevels, AgeLevel, AgeLevel]>)("is, for a game with modes for %j at %s, the nearest it has at or below: %s", (offered, level, played) => {
    for (const revision of [null, "picked"]) expect(startLevel({ level, revision }, offered)).toBe(played);
  });

  it.each(AGE_LEVELS)("does not depend on the order a game lists its modes in, at %s", (level) => {
    const setting = { level, revision: "picked" };

    expect(startLevel(setting, ["hatchling", "paleontologist", "explorer"])).toBe(startLevel(setting, ALL_THREE));
  });

  it.each(AGE_LEVELS)("is Hatchling at %s for today's games, which have only Hatchling", (level) => {
    expect(startLevel({ level, revision: "picked" }, ["hatchling"], { level: "paleontologist", revision: "picked" })).toBe("hatchling");
  });

  it.each([
    [["hatchling", "explorer"], "paleontologist", "explorer"],
    [["hatchling", "paleontologist"], "explorer", "hatchling"]
  ] satisfies Array<[OfferedLevels, AgeLevel, AgeLevel]>)("plays, for a game with modes for %j, the nearest it has at or below a child's choice of %s: %s", (offered, chosen, played) => {
    expect(startLevel({ level: "hatchling", revision: "picked" }, offered, { level: chosen, revision: "picked" })).toBe(played);
  });
});

// age-level-choice.feature, on the setting as the app keeps it: a
// parent's pick drawn by pickAgeLevel and saved, and a reopen reading it
// back, Explorer when none can be read.

// One iPad: the storage the setting is kept in, and the setting the app
// holds while it is open.
function iPad(random: () => number = seededRandom(31)) {
  const storage = memoryStorage();
  const store = localAgeLevel(() => storage);
  let setting: AgeLevelSetting = store.load() ?? DEFAULT_AGE_LEVEL;
  return {
    storage,
    get setting() {
      return setting;
    },
    reopen() {
      setting = store.load() ?? DEFAULT_AGE_LEVEL;
    },
    // A parent's picks in the age level menu, each saved when it changes
    // the level.
    choose(...levels: AgeLevel[]) {
      for (const level of levels) {
        const picked = pickAgeLevel(setting, level, random);
        if (picked !== setting) store.save(picked);
        setting = picked;
      }
    },
    // The child's choice of `level` in a game, made under the setting as
    // it stands.
    childChooses(level: AgeLevel): LevelChoice {
      return { level, revision: setting.revision };
    }
  };
}

// How the age level came to be `level`: picked first on a new install,
// where Explorer is the install's own and has no revision, or picked from
// another level a parent had set.
const SET_BY = {
  "a new install": (device: ReturnType<typeof iPad>, level: AgeLevel) => device.choose(level),
  "a pick from another level": (device: ReturnType<typeof iPad>, level: AgeLevel) =>
    device.choose(level === "paleontologist" ? "hatchling" : "paleontologist", level)
};

const WAYS = Object.keys(SET_BY) as Array<keyof typeof SET_BY>;

describe("a child's own level choice in a game", () => {
  it.each(
    WAYS.flatMap((way) =>
      (
        [
          ["explorer", "hatchling", "paleontologist"],
          ["hatchling", "paleontologist", "explorer"]
        ] as const
      ).map(([setting, choice, next]) => [setting, choice, next, way] as const)
    )
  )("at %s, choosing %s, wins until a parent chooses %s, set by %s", (setting, choice, next, way) => {
    const device = iPad();
    SET_BY[way](device, setting);
    const chosen = device.childChooses(choice);

    device.reopen();
    expect(startLevel(device.setting, ALL_THREE, chosen)).toBe(choice);

    device.choose(next);
    device.reopen();
    expect(startLevel(device.setting, ALL_THREE, chosen)).toBe(next);

    device.choose(setting);
    expect(startLevel(device.setting, ALL_THREE, chosen)).toBe(setting);
  });

  // A source that draws the same every time draws the same digits for
  // each pick; the revision still changes.
  const SOURCES = { "a random source": () => seededRandom(31), "a source that draws the same every time": () => () => 0 };

  it.each(WAYS.flatMap((way) => Object.keys(SOURCES).map((source) => [way, source as keyof typeof SOURCES] as const)))("is dropped by a level changed and changed back, set by %s, from %s", (way, source) => {
    const device = iPad(SOURCES[source]());
    SET_BY[way](device, "explorer");
    const chosen = device.childChooses("hatchling");

    device.choose("paleontologist", "explorer");

    expect(startLevel(device.setting, ALL_THREE, chosen)).toBe("explorer");
  });

  it.each(
    WAYS.flatMap((way) =>
      (
        [
          ["deleted", (storage: MemoryStorage) => storage.items.delete(AGE_LEVEL_KEY)],
          ["not readable", (storage: MemoryStorage) => storage.items.set(AGE_LEVEL_KEY, "{level")]
        ] as const
      ).map(([lost, lose]) => [lost, lose, way] as const)
    )
  )("never wins again after the saved level is %s, set by %s", (_, lose, way) => {
    const device = iPad();
    SET_BY[way](device, "explorer");
    const chosen = device.childChooses("hatchling");

    lose(device.storage);
    device.reopen();
    device.choose("paleontologist", "explorer");

    expect(startLevel(device.setting, ALL_THREE, chosen)).toBe("explorer");
  });

  it.each(WAYS)("is kept when a parent chooses the level already set, set by %s", (way) => {
    const device = iPad();
    SET_BY[way](device, "explorer");
    const chosen = device.childChooses("hatchling");

    device.choose("explorer");
    device.reopen();

    expect(startLevel(device.setting, ALL_THREE, chosen)).toBe("hatchling");
  });
});
