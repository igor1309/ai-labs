import { describe, expect, it } from "vitest";
import { PROGRESS_KEY, localProgress, type KeyValueStorage } from "../src/localProgress.ts";
import { NO_PROGRESS } from "../src/quiz/progress.ts";
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
