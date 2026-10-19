import { NO_LEVEL_OFFER } from "../src/levelOffer.ts";
import { describe, expect, it } from "vitest";
import { NO_CARE } from "../src/care/index.ts";
import type { FeaturedHistory, Featuring } from "../src/featured.ts";
import { NO_PAIRS } from "../src/pairs/index.ts";
import { LANGUAGE_KEY, localLanguage } from "../src/localLanguage.ts";
import {
  PROGRESS_KEY,
  localCareProgress,
  localFeatured,
  localPairsProgress,
  localProgress,
  localSkeletonProgress,
  localSortingProgress,
  type KeyValueStorage
} from "../src/localProgress.ts";
import { THEME_KEY, localTheme } from "../src/localTheme.ts";
import { NO_PROGRESS } from "../src/quiz/progress.ts";
import { NO_SKELETONS, type SkeletonProgress } from "../src/skeletons/index.ts";
import { NO_SORTING } from "../src/sorting/index.ts";
import type { LevelChoice } from "../src/startLevel.ts";
import { memoryStorage } from "./support.ts";

const game = (entry: unknown) => JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": entry } });

const blocked = (): KeyValueStorage => {
  throw new DOMException("Access is denied", "SecurityError");
};

describe("localProgress", () => {
  it("reads no progress from empty storage", () => {
    const storage = memoryStorage();

    expect(localProgress(() => storage).load()).toEqual(NO_PROGRESS);
  });

  it.each([
    [{ bestScore: 8, roundsPlayed: 3 }, { bestScore: 8, roundsPlayed: 3 }],
    [{ bestScore: 0, roundsPlayed: 1, achievements: ["first-round"] }, { bestScore: 0, roundsPlayed: 1 }],
    [{ bestScore: null, roundsPlayed: 0 }, { bestScore: null, roundsPlayed: 0 }]
  ])("reads the game's best score and finished rounds from %j", (entry, progress) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: game(entry) });

    expect(localProgress(() => storage).load()).toEqual(progress);
  });

  it("reads no progress from a record without this game", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { other: { level: 2 } } }) });

    expect(localProgress(() => storage).load()).toEqual(NO_PROGRESS);
  });

  const unusable: Array<[string, string]> = [
    ["text that is not JSON", "{not json"],
    ["JSON null", "null"],
    ["a list", "[]"],
    ["a record of schema version 2", JSON.stringify({ schemaVersion: 2, games: { "compare-dinosaurs": { bestScore: 8, roundsPlayed: 3 } } })],
    ["a record without a schema version", JSON.stringify({ games: { "compare-dinosaurs": { bestScore: 8, roundsPlayed: 3 } } })],
    ["a record without games", JSON.stringify({ schemaVersion: 1 })],
    ["games that are a list", JSON.stringify({ schemaVersion: 1, games: [] })],
    ["a game that is not a record", game(8)],
    ["a best score in text", game({ bestScore: "8", roundsPlayed: 3 })],
    ["a negative best score", game({ bestScore: -1, roundsPlayed: 3 })],
    ["a fractional best score", game({ bestScore: 1.5, roundsPlayed: 3 })],
    ["no finished rounds count", game({ bestScore: 8 })],
    ["a negative finished rounds count", game({ bestScore: 8, roundsPlayed: -2 })]
  ];

  it.each(unusable)("reads %s as no progress", (_, raw) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: raw });

    expect(localProgress(() => storage).load()).toEqual(NO_PROGRESS);
  });

  it.each(unusable)("replaces %s with a readable record on save", (_, raw) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: raw });
    const progress = localProgress(() => storage);

    progress.save({ bestScore: 4, roundsPlayed: 1 });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: 4, roundsPlayed: 1 } }
    });
    expect(progress.load()).toEqual({ bestScore: 4, roundsPlayed: 1 });
  });

  it("keeps a readable record's other games and fields on save", () => {
    const storage = memoryStorage({
      [PROGRESS_KEY]: JSON.stringify({
        schemaVersion: 1,
        games: {
          "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3, achievements: ["first-round"] },
          other: { level: 2 }
        }
      })
    });

    localProgress(() => storage).save({ bestScore: 7, roundsPlayed: 4 });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 7, roundsPlayed: 4, achievements: ["first-round"] },
        other: { level: 2 }
      }
    });
  });

  it.each([
    ["the storage cannot be reached", blocked],
    ["the storage cannot be read", () => memoryStorage({ [PROGRESS_KEY]: game({ bestScore: 8, roundsPlayed: 3 }) }, { read: false })]
  ])("loads nothing and saves nothing when %s", (_, storage) => {
    const progress = localProgress(storage);

    expect(progress.load()).toBeUndefined();
    expect(() => progress.save({ bestScore: 4, roundsPlayed: 1 })).not.toThrow();
  });

  it("drops progress that cannot be saved and keeps the stored record", () => {
    const kept = game({ bestScore: 6, roundsPlayed: 3 });
    const storage = memoryStorage({ [PROGRESS_KEY]: kept }, { save: false });
    const progress = localProgress(() => storage);

    expect(() => progress.save({ bestScore: 7, roundsPlayed: 4 })).not.toThrow();

    expect(storage.items.get(PROGRESS_KEY)).toBe(kept);
    expect(progress.load()).toEqual({ bestScore: 6, roundsPlayed: 3 });
  });
});

const care = (entry: unknown, games: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, games: { ...games, "dinosaur-care": entry } });

describe("localCareProgress", () => {
  it("reads no care progress from empty storage", () => {
    const storage = memoryStorage();

    expect(localCareProgress(() => storage).load()).toEqual(NO_CARE);
  });

  it.each([
    [{ bestScore: 6, visitsFinished: 2, friends: ["tyrannosaurus", "stegosaurus"] }, { bestScore: 6, visitsFinished: 2, friends: ["tyrannosaurus", "stegosaurus"] }],
    [{ bestScore: null, visitsFinished: 0, friends: [], achievements: ["first-visit"] }, { bestScore: null, visitsFinished: 0, friends: [] }]
  ])("reads care's best score, finished visits and friends from %j", (entry, progress) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: care(entry) });

    expect(localCareProgress(() => storage).load()).toEqual(progress);
  });

  it.each([
    ["a best score in text", { bestScore: "6", visitsFinished: 2, friends: [] }],
    ["a fractional best score", { bestScore: 6.5, visitsFinished: 2, friends: [] }],
    ["no finished visits count", { bestScore: 6, friends: [] }],
    ["no friends", { bestScore: 6, visitsFinished: 2 }],
    ["friends that are not a list", { bestScore: 6, visitsFinished: 2, friends: "tyrannosaurus" }],
    ["a friend that is not an id", { bestScore: 6, visitsFinished: 2, friends: ["tyrannosaurus", 3] }],
    ["an entry that is not a record", 6]
  ])("reads %s as no care progress, and keeps the quiz's", (_, entry) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: care(entry, { "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 } }) });

    expect(localCareProgress(() => storage).load()).toEqual(NO_CARE);
    expect(localProgress(() => storage).load()).toEqual({ bestScore: 7, roundsPlayed: 3 });
  });

  it("keeps care beside the quiz in one record, each saved without touching the other", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: game({ bestScore: 7, roundsPlayed: 3 }) });

    localCareProgress(() => storage).save({ bestScore: 8, visitsFinished: 1, friends: ["triceratops"] });
    localProgress(() => storage).save({ bestScore: 9, roundsPlayed: 4 });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 9, roundsPlayed: 4 },
        "dinosaur-care": { bestScore: 8, visitsFinished: 1, friends: ["triceratops"] }
      }
    });
  });

  it("replaces an unusable care entry on save, and keeps a quiz entry it cannot read", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: care({ bestScore: "8" }, { "compare-dinosaurs": { bestScore: "x" } }) });

    localCareProgress(() => storage).save({ bestScore: 4, visitsFinished: 1, friends: [] });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: "x" }, "dinosaur-care": { bestScore: 4, visitsFinished: 1, friends: [] } }
    });
  });

  it.each([
    ["the storage cannot be reached", blocked],
    ["the storage cannot be read", () => memoryStorage({ [PROGRESS_KEY]: care({ bestScore: 8, visitsFinished: 1, friends: [] }) }, { read: false })]
  ])("loads nothing and saves nothing when %s", (_, storage) => {
    const progress = localCareProgress(storage);

    expect(progress.load()).toBeUndefined();
    expect(() => progress.save({ bestScore: 4, visitsFinished: 1, friends: [] })).not.toThrow();
  });
});

const sorting = (entry: unknown, games: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, games: { ...games, "sort-dinosaurs": entry } });

describe("localSortingProgress", () => {
  it("reads no sorting progress from empty storage", () => {
    const storage = memoryStorage();

    expect(localSortingProgress(() => storage).load()).toEqual(NO_SORTING);
  });

  it.each([
    [{ bestScore: 5, roundsPlayed: 3 }, { bestScore: 5, roundsPlayed: 3 }],
    [{ bestScore: null, roundsPlayed: 0, achievements: ["first-round"] }, { bestScore: null, roundsPlayed: 0 }]
  ])("reads the sorting game's best score and finished rounds from %j", (entry, progress) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: sorting(entry) });

    expect(localSortingProgress(() => storage).load()).toEqual(progress);
  });

  it.each([
    ["a best score in text", { bestScore: "5", roundsPlayed: 3 }],
    ["a fractional best score", { bestScore: 4.5, roundsPlayed: 3 }],
    ["no finished rounds count", { bestScore: 5 }],
    ["a negative finished rounds count", { bestScore: 5, roundsPlayed: -1 }],
    ["an entry that is not a record", 5]
  ])("reads %s as no sorting progress, and keeps the quiz's and care's", (_, entry) => {
    const others = { "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 }, "dinosaur-care": { bestScore: 6, visitsFinished: 2, friends: [] } };
    const storage = memoryStorage({ [PROGRESS_KEY]: sorting(entry, others) });

    expect(localSortingProgress(() => storage).load()).toEqual(NO_SORTING);
    expect(localProgress(() => storage).load()).toEqual({ bestScore: 7, roundsPlayed: 3 });
    expect(localCareProgress(() => storage).load()).toEqual({ bestScore: 6, visitsFinished: 2, friends: [] });
  });

  it("keeps the sorting game beside the quiz and care in one record, each saved without touching the others", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: game({ bestScore: 7, roundsPlayed: 3 }) });

    localSortingProgress(() => storage).save({ bestScore: 4, roundsPlayed: 1 });
    localCareProgress(() => storage).save({ bestScore: 8, visitsFinished: 1, friends: ["triceratops"] });
    localProgress(() => storage).save({ bestScore: 9, roundsPlayed: 4 });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 9, roundsPlayed: 4 },
        "dinosaur-care": { bestScore: 8, visitsFinished: 1, friends: ["triceratops"] },
        "sort-dinosaurs": { bestScore: 4, roundsPlayed: 1 }
      }
    });
    expect(localSortingProgress(() => storage).load()).toEqual({ bestScore: 4, roundsPlayed: 1 });
  });

  it("replaces an unusable sorting entry on save, and keeps a quiz entry it cannot read", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: sorting({ bestScore: "4" }, { "compare-dinosaurs": { bestScore: "x" } }) });

    localSortingProgress(() => storage).save({ bestScore: 3, roundsPlayed: 1 });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: "x" }, "sort-dinosaurs": { bestScore: 3, roundsPlayed: 1 } }
    });
  });

  it.each([
    ["the storage cannot be reached", blocked],
    ["the storage cannot be read", () => memoryStorage({ [PROGRESS_KEY]: sorting({ bestScore: 4, roundsPlayed: 2 }) }, { read: false })]
  ])("loads nothing and saves nothing when %s", (_, storage) => {
    const progress = localSortingProgress(storage);

    expect(progress.load()).toBeUndefined();
    expect(() => progress.save({ bestScore: 3, roundsPlayed: 1 })).not.toThrow();
  });
});

const pairs = (entry: unknown, games: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, games: { ...games, "find-the-pair": entry } });

// Find the pair's entry as stored, under the names it had before the
// game had levels, and the same progress as the game speaks of it.
const PAIRS = { stars: 5, level: 3, boardsOnLevel: 1, best: { 1: 4, 2: 6 }, found: ["triceratops"] } as const;
const PAIRS_PROGRESS = { stars: 5, climbLevel: 3, boardsOnClimbLevel: 1, best: { 1: 4, 2: 6 }, found: ["triceratops"] } as const;
const NO_CHOICE = { progress: PAIRS_PROGRESS, levelChoice: undefined, offer: NO_LEVEL_OFFER };
const CHOICE = { level: "paleontologist", revision: "2-picked" } as const;

describe("localPairsProgress", () => {
  it("reads no find-the-pair progress and no level choice from empty storage", () => {
    const storage = memoryStorage();

    expect(localPairsProgress(() => storage).load()).toEqual({ progress: NO_PAIRS, levelChoice: undefined, offer: NO_LEVEL_OFFER });
  });

  it.each([
    [PAIRS, NO_CHOICE],
    [{ ...PAIRS, best: {}, achievements: ["first-board"] }, { ...NO_CHOICE, progress: { ...PAIRS_PROGRESS, best: {} } }],
    [{ ...PAIRS, levelChoice: CHOICE }, { ...NO_CHOICE, levelChoice: CHOICE }],
    [{ ...PAIRS, levelChoice: { level: "hatchling", revision: null } }, { ...NO_CHOICE, levelChoice: { level: "hatchling", revision: null } }]
  ])("reads stars, the climb level, boards on it, bests, found dinosaurs and the level choice from %j", (entry, saved) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairs(entry) });

    expect(localPairsProgress(() => storage).load()).toEqual(saved);
  });

  it("saves and reloads each large level's best beside the climb's, under the same game key", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairs({ ...PAIRS, levelChoice: CHOICE }) });
    const best = { ...PAIRS.best, explorer: 11, paleontologist: 14 };
    const saved = { progress: { ...PAIRS_PROGRESS, best }, levelChoice: CHOICE, offer: NO_LEVEL_OFFER };

    localPairsProgress(() => storage).save(saved);

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "").games["find-the-pair"]).toEqual({ ...PAIRS, best, levelChoice: CHOICE, offer: NO_LEVEL_OFFER });
    expect(localPairsProgress(() => storage).load()).toEqual(saved);
  });

  it.each([
    ["no level choice", NO_CHOICE, PAIRS],
    ["a level choice", { ...NO_CHOICE, levelChoice: CHOICE }, { ...PAIRS, levelChoice: CHOICE }]
  ])("saves its progress and %s under the names it had before levels, and reads them back after a reload", (_, saved, entry) => {
    const storage = memoryStorage();

    localPairsProgress(() => storage).save(saved);

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "").games["find-the-pair"]).toEqual({ ...entry, offer: NO_LEVEL_OFFER });
    expect(localPairsProgress(() => storage).load()).toEqual(saved);
  });

  it("keeps the level choice saved when progress is saved with it again", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairs({ ...PAIRS, levelChoice: CHOICE }) });
    const store = localPairsProgress(() => storage);

    store.save({ progress: { ...PAIRS_PROGRESS, stars: 6 }, levelChoice: store.load()?.levelChoice, offer: NO_LEVEL_OFFER });

    expect(localPairsProgress(() => storage).load()).toEqual({ progress: { ...PAIRS_PROGRESS, stars: 6 }, levelChoice: CHOICE, offer: NO_LEVEL_OFFER });
  });

  it.each([
    ["stars in text", { ...PAIRS, stars: "5" }],
    ["no level", { ...PAIRS, level: undefined }],
    ["a level past the top", { ...PAIRS, level: 5 }],
    ["level 0", { ...PAIRS, level: 0 }],
    ["a fractional level", { ...PAIRS, level: 1.5 }],
    ["no boards on the level", { ...PAIRS, boardsOnLevel: undefined }],
    ["bests that are not a record", { ...PAIRS, best: [4, 6] }],
    ["a best of an unknown level", { ...PAIRS, best: { 5: 4 } }],
    ["a best of no tries", { ...PAIRS, best: { 1: 0 } }],
    ["a best in text", { ...PAIRS, best: { 1: "4" } }],
    ["a large level's best in text", { ...PAIRS, best: { explorer: "9" } }],
    ["a large level's best of no tries", { ...PAIRS, best: { paleontologist: 0 } }],
    ["a large level's negative best", { ...PAIRS, best: { explorer: -1 } }],
    ["a large level's fractional best", { ...PAIRS, best: { paleontologist: 12.5 } }],
    ["a best of an unknown age level", { ...PAIRS, best: { expert: 12 } }],
    ["found dinosaurs that are not a list", { ...PAIRS, found: "triceratops" }],
    ["a found dinosaur that is not an id", { ...PAIRS, found: [3] }],
    ["a level choice that is not a record", { ...PAIRS, levelChoice: "explorer" }],
    ["a level choice of no age level", { ...PAIRS, levelChoice: { level: "expert", revision: "2-picked" } }],
    ["a level choice of a climb level", { ...PAIRS, levelChoice: { level: 2, revision: "2-picked" } }],
    ["a level choice with no revision", { ...PAIRS, levelChoice: { level: "explorer" } }],
    ["a level choice of an empty revision", { ...PAIRS, levelChoice: { level: "explorer", revision: "" } }],
    ["a level choice of a revision that is not text", { ...PAIRS, levelChoice: { level: "explorer", revision: 2 } }],
    ["an entry that is not a record", 6]
  ])("reads %s as no find-the-pair progress, and keeps the other games'", (_, entry) => {
    const storage = memoryStorage({
      [PROGRESS_KEY]: pairs(entry, { "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 }, "dinosaur-care": { bestScore: 6, visitsFinished: 1, friends: [] } })
    });

    expect(localPairsProgress(() => storage).load()).toEqual({ progress: NO_PAIRS, levelChoice: undefined, offer: NO_LEVEL_OFFER });
    expect(localProgress(() => storage).load()).toEqual({ bestScore: 7, roundsPlayed: 3 });
    expect(localCareProgress(() => storage).load()).toEqual({ bestScore: 6, visitsFinished: 1, friends: [] });
  });

  it("reads the strong boards and the offers turned down as saved", () => {
    const offer = { level: "explorer", strong: 2, declined: ["hatchling", "explorer"] };
    const storage = memoryStorage({ [PROGRESS_KEY]: pairs({ ...PAIRS, offer }) });

    expect(localPairsProgress(() => storage).load()).toEqual({ ...NO_CHOICE, offer });
  });

  it.each([
    ["no offer", undefined],
    ["an offer that is not a record", "explorer"],
    ["an offer of an unknown level", { level: "expert", strong: 2, declined: [] }],
    ["an offer of a climb level", { level: 2, strong: 2, declined: [] }],
    ["strong boards in text", { level: "explorer", strong: "2", declined: [] }],
    ["negative strong boards", { level: "explorer", strong: -1, declined: [] }],
    ["fractional strong boards", { level: "explorer", strong: 1.5, declined: [] }],
    ["strong boards at no level", { level: null, strong: 2, declined: [] }],
    ["declines that are not a list", { level: "explorer", strong: 2, declined: "hatchling" }],
    ["a decline of an unknown level", { level: "explorer", strong: 2, declined: ["hatchling", "expert"] }]
  ])("reads %s as no strong boards and no declines, with the rest of the progress as saved", (_, offer) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairs({ ...PAIRS, levelChoice: CHOICE, offer }) });

    expect(localPairsProgress(() => storage).load()).toEqual({ ...NO_CHOICE, levelChoice: CHOICE, offer: NO_LEVEL_OFFER });
  });

  it("reads a level turned down twice once", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: pairs({ ...PAIRS, offer: { level: null, strong: 0, declined: ["explorer", "explorer"] } }) });

    expect(localPairsProgress(() => storage).load()?.offer.declined).toEqual(["explorer"]);
  });

  it("reads progress of an unknown schema version as none", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 2, games: { "find-the-pair": PAIRS } }) });

    expect(localPairsProgress(() => storage).load()).toEqual({ progress: NO_PAIRS, levelChoice: undefined, offer: NO_LEVEL_OFFER });
  });

  it("keeps the other games in one record, each saved without touching the others", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: game({ bestScore: 7, roundsPlayed: 3 }) });

    localPairsProgress(() => storage).save(NO_CHOICE);
    localCareProgress(() => storage).save({ bestScore: 8, visitsFinished: 1, friends: [] });
    localProgress(() => storage).save({ bestScore: 9, roundsPlayed: 4 });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 9, roundsPlayed: 4 },
        "dinosaur-care": { bestScore: 8, visitsFinished: 1, friends: [] },
        "find-the-pair": { ...PAIRS, offer: NO_LEVEL_OFFER }
      }
    });
  });

  it.each([
    ["the storage cannot be reached", blocked],
    ["the storage cannot be read", () => memoryStorage({ [PROGRESS_KEY]: pairs(PAIRS) }, { read: false })]
  ])("loads nothing and saves nothing when %s", (_, storage) => {
    const progress = localPairsProgress(storage);

    expect(progress.load()).toBeUndefined();
    expect(() => progress.save(NO_CHOICE)).not.toThrow();
  });
});

const skeletons = (entry: unknown, games: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, games: { ...games, "skeleton-assembly": entry } });

const SKELETONS = { earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: ["triceratops"] };

// The skeleton game's saved progress and level choice, none by default.
const saved = (progress: SkeletonProgress, levelChoice?: LevelChoice) => ({ progress, levelChoice });

describe("localSkeletonProgress", () => {
  it("reads no skeleton progress from empty storage", () => {
    const storage = memoryStorage();

    expect(localSkeletonProgress(() => storage).load()).toEqual(saved(NO_SKELETONS));
  });

  it.each([
    [SKELETONS, SKELETONS],
    [{ earned: [], bestScore: null, rebuilding: [] }, NO_SKELETONS],
    [{ ...SKELETONS, achievements: ["first-skeleton"] }, SKELETONS]
  ])("reads the best collection score, the dinosaurs with a star and the stands awaiting a rebuild from %j, with no level choice", (entry, progress) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: skeletons(entry) });

    expect(localSkeletonProgress(() => storage).load()).toEqual(saved(progress));
  });

  it("saves its progress and reads it back after a reload", () => {
    const storage = memoryStorage();

    localSkeletonProgress(() => storage).save(saved(SKELETONS));

    expect(localSkeletonProgress(() => storage).load()).toEqual(saved(SKELETONS));
  });

  it("keeps the child's level choice beside the progress, with the revision it was made under", () => {
    const storage = memoryStorage();

    localSkeletonProgress(() => storage).save(saved(SKELETONS, CHOICE));

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "").games["skeleton-assembly"]).toEqual({ ...SKELETONS, levelChoice: CHOICE });
    expect(localSkeletonProgress(() => storage).load()).toEqual(saved(SKELETONS, CHOICE));
  });

  it.each([
    ["of no age level", { level: "grown-up", revision: "2" }],
    ["with no revision", { level: "hatchling" }],
    ["of an empty revision", { level: "hatchling", revision: "" }],
    ["that is not a record", "hatchling"]
  ])("drops a level choice %s, keeping the stars and stands beside it", (_, levelChoice) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: skeletons({ ...SKELETONS, levelChoice }) });

    expect(localSkeletonProgress(() => storage).load()).toEqual(saved(SKELETONS));
  });

  it.each([
    ["a best in text", { ...SKELETONS, bestScore: "2" }],
    ["a negative best", { ...SKELETONS, bestScore: -1 }],
    ["no best", { earned: SKELETONS.earned, rebuilding: SKELETONS.rebuilding }],
    ["stars that are not a list", { ...SKELETONS, earned: "tyrannosaurus" }],
    ["a star that is not an id", { ...SKELETONS, earned: [1] }],
    ["no stands awaiting a rebuild", { earned: SKELETONS.earned, bestScore: SKELETONS.bestScore }],
    ["stands awaiting a rebuild that are not a list", { ...SKELETONS, rebuilding: "triceratops" }],
    ["a stand awaiting a rebuild that is not an id", { ...SKELETONS, rebuilding: [null] }],
    ["an entry that is not a record", 2]
  ])("reads %s as no skeleton progress, and keeps the other games'", (_, entry) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: skeletons(entry, { "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 } }) });

    expect(localSkeletonProgress(() => storage).load()).toEqual(saved(NO_SKELETONS));
    expect(localProgress(() => storage).load()).toEqual({ bestScore: 7, roundsPlayed: 3 });
  });

  it("keeps the other games in one record, each saved without touching the others", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: game({ bestScore: 7, roundsPlayed: 3 }) });

    localSkeletonProgress(() => storage).save(saved(SKELETONS));
    localPairsProgress(() => storage).save({ progress: NO_PAIRS, levelChoice: undefined, offer: NO_LEVEL_OFFER });

    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 }, "skeleton-assembly": SKELETONS, "find-the-pair": { stars: 0, level: 1, boardsOnLevel: 0, best: {}, found: [], offer: NO_LEVEL_OFFER } }
    });
  });

  it.each([
    ["the storage cannot be reached", blocked],
    ["the storage cannot be read", () => memoryStorage({ [PROGRESS_KEY]: skeletons(SKELETONS) }, { read: false })]
  ])("loads nothing and saves nothing when %s", (_, storage) => {
    const progress = localSkeletonProgress(storage);

    expect(progress.load()).toBeUndefined();
    expect(() => progress.save(saved(SKELETONS))).not.toThrow();
  });
});

describe("localFeatured", () => {
  const GAMES = ["compare", "catalogue", "care", "sort", "pairs", "skeletons"];
  // Today's game as stored, and as the choice features it.
  const TODAY = { day: "2026-10-18", game: "care" };
  const FEATURED: Featuring = { game: "care", on: "2026-10-18" };
  const history = (starts: Record<string, number>, lastFeatured?: Featuring): FeaturedHistory => ({ timesStarted: new Map(Object.entries(starts)), lastFeatured });
  const NONE = history({});
  const QUIZ = { bestScore: 7, roundsPlayed: 3 };
  const CARE = { bestScore: 6, visitsFinished: 2, friends: ["triceratops"] };
  const SKELETONS = { bestScore: 1, earned: ["stegosaurus"], rebuilding: [] };

  const record = (games: Record<string, unknown>, schemaVersion: unknown = 1) => JSON.stringify({ schemaVersion, games });
  const featured = (entry: unknown) => record({ "compare-dinosaurs": QUIZ, "home-featured": entry });
  const stored = (storage: { items: Map<string, string> }) => JSON.parse(storage.items.get(PROGRESS_KEY) ?? "null");
  const open = (storage: KeyValueStorage) => localFeatured(() => storage, GAMES);

  it("reads no starts and no featured game from empty storage", () => {
    expect(open(memoryStorage()).history()).toEqual(NONE);
  });

  it("reads the start counts and the day's game it saved after a reload", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: featured({ starts: { care: 2, sort: 5 }, featured: { day: "2026-10-17", game: "sort" } }) });

    expect(open(storage).history()).toEqual(history({ care: 2, sort: 5 }, { game: "sort", on: "2026-10-17" }));
  });

  it("adds each start to the stored count, a game not yet started from none, and saves the day's game beside them", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: featured({ starts: { care: 2 }, featured: { day: "2026-10-17", game: "sort" } }) });
    const store = open(storage);

    store.feature(FEATURED);
    store.countStart("care");
    store.countStart("pairs");

    expect(stored(storage).games["home-featured"]).toEqual({ starts: { care: 3, pairs: 1 }, featured: TODAY });
    expect(open(storage).history()).toEqual(history({ care: 3, pairs: 1 }, FEATURED));
  });

  it("keeps the games' progress, the language and the theme as they are, and is kept by the games' saves", () => {
    const storage = memoryStorage({
      [PROGRESS_KEY]: record({ "compare-dinosaurs": QUIZ, "dinosaur-care": CARE, "skeleton-assembly": SKELETONS }),
      [LANGUAGE_KEY]: "ru",
      [THEME_KEY]: "dark"
    });
    const store = open(storage);

    store.feature(FEATURED);

    expect(stored(storage).games).toEqual({ "compare-dinosaurs": QUIZ, "dinosaur-care": CARE, "skeleton-assembly": SKELETONS, "home-featured": { starts: {}, featured: TODAY } });
    expect([localLanguage(() => storage).load(), localTheme(() => storage).load()]).toEqual(["ru", "dark"]);

    store.countStart("compare");
    localProgress(() => storage).save({ bestScore: 9, roundsPlayed: 4 });
    store.countStart("care");
    localCareProgress(() => storage).save({ ...CARE, visitsFinished: 3 });
    store.countStart("skeletons");
    localSkeletonProgress(() => storage).save(saved({ ...SKELETONS, earned: ["stegosaurus", "triceratops"], bestScore: 2 }));

    expect(open(storage).history()).toEqual(history({ compare: 1, care: 1, skeletons: 1 }, FEATURED));
    expect([localProgress(() => storage).load(), localCareProgress(() => storage).load(), localSkeletonProgress(() => storage).load()]).toEqual([
      { bestScore: 9, roundsPlayed: 4 },
      { ...CARE, visitsFinished: 3 },
      saved({ ...SKELETONS, earned: ["stegosaurus", "triceratops"], bestScore: 2 })
    ]);
  });

  it.each([
    ["absent", record({ "compare-dinosaurs": QUIZ })],
    ["not a record", featured(3)],
    ["without start counts", featured({ featured: TODAY })],
    ["with start counts that are a list", featured({ starts: [1, 2], featured: TODAY })],
    ["with a featured game that is not a day's choice", featured({ starts: {}, featured: "care" })],
    ["with a featured game without its day", featured({ starts: {}, featured: { game: "care" } })],
    ["naming a featured game that no longer exists", featured({ starts: { care: 2 }, featured: { day: "2026-10-18", game: "fossils" } })],
    ["holding a negative start count", featured({ starts: { care: 2, sort: -1 }, featured: TODAY })],
    ["holding a fractional start count", featured({ starts: { care: 2.5 }, featured: TODAY })],
    ["holding a start count in text", featured({ starts: { care: "2" }, featured: TODAY })]
  ])("reads a featured record %s as no starts and no game, and replaces it with the next save, keeping the games' progress", (_state, raw) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: raw });
    const store = open(storage);

    expect(store.history()).toEqual(NONE);

    store.feature(FEATURED);

    expect(open(storage).history()).toEqual(history({}, FEATURED));
    expect(localProgress(() => storage).load()).toEqual(QUIZ);
  });

  it("reads progress that is not JSON as no starts and no game, and replaces it with the next save", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: "{not json" });
    const store = open(storage);

    expect(store.history()).toEqual(NONE);

    store.feature(FEATURED);

    expect(stored(storage)).toEqual({ schemaVersion: 1, games: { "home-featured": { starts: {}, featured: TODAY } } });
  });

  it("reads a record of an unknown schema version as no starts and no game, and replaces it with the next save", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record({ "home-featured": { starts: { care: 2 }, featured: TODAY } }, 2) });
    const store = open(storage);

    expect(store.history()).toEqual(NONE);

    store.feature({ game: "sort", on: "2026-10-19" });

    expect(stored(storage)).toEqual({ schemaVersion: 1, games: { "home-featured": { starts: {}, featured: { day: "2026-10-19", game: "sort" } } } });
  });

  it("drops the count of a game no longer offered, keeping the others and the day's game, and leaves it out of the next save", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: featured({ starts: { care: 2, fossils: 4, gone: -1 }, featured: TODAY }) });
    const store = open(storage);

    expect(store.history()).toEqual(history({ care: 2 }, FEATURED));

    store.countStart("sort");

    expect(stored(storage).games["home-featured"]).toEqual({ starts: { care: 2, sort: 1 }, featured: TODAY });
  });

  it("reads no starts and no game when storage cannot be read, and keeps those of the visit", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: featured({ starts: { care: 2 }, featured: TODAY }) }, { read: false });
    const store = open(storage);

    expect(store.history()).toEqual(NONE);
    expect(localFeatured(blocked, GAMES).history()).toEqual(NONE);

    store.feature({ game: "sort", on: "2026-10-19" });
    store.countStart("care");

    expect(store.history()).toEqual(history({ care: 1 }, { game: "sort", on: "2026-10-19" }));
    expect(stored(storage).games["home-featured"]).toEqual({ starts: { care: 2 }, featured: TODAY });
  });

  it("keeps the visit's choice and counts when they cannot be saved, and the stored record as it was", () => {
    const raw = featured({ starts: { care: 2 }, featured: { day: "2026-10-17", game: "sort" } });
    const storage = memoryStorage({ [PROGRESS_KEY]: raw }, { save: false });
    const store = open(storage);

    store.feature(FEATURED);
    store.countStart("care");
    store.countStart("care");

    expect(store.history()).toEqual(history({ care: 4 }, FEATURED));
    expect(storage.items.get(PROGRESS_KEY)).toBe(raw);
  });
});
