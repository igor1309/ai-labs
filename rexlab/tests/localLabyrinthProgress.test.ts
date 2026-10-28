import { describe, expect, it } from "vitest";
import { NO_LABYRINTH } from "../src/labyrinth/index.ts";
import { NO_LEVEL_OFFER } from "../src/levelOffer.ts";
import { localLabyrinthProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { memoryStorage } from "./support.ts";

const empty = { progress: NO_LABYRINTH, levelChoice: undefined, offer: NO_LEVEL_OFFER };
const kept = {
  progress: { stars: 12, roundsPlayed: 4, best: { hatchling: 3, explorer: 3, paleontologist: null } },
  levelChoice: { level: "hatchling" as const, revision: "parent" },
  offer: { level: "hatchling" as const, strong: 2, declined: ["explorer" as const] }
};
const record = (labyrinth: unknown, others = {}) => JSON.stringify({ schemaVersion: 1, games: { ...others, labyrinth } });

describe("labyrinth's shared storage entry", () => {
  it("round-trips level bests, shared stars, the override and offer, retaining fields and games saved meanwhile", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record({ ...kept, futureField: "kept" }) });
    const progress = localLabyrinthProgress(() => storage);
    expect(progress.load()).toEqual(kept);
    const others = { dig: { dug: ["stegosaurus"], badges: [] }, unknownGame: { score: 91 } };
    storage.items.set(PROGRESS_KEY, record({ ...kept, futureField: "kept" }, others));
    progress.save({ ...kept, progress: { ...kept.progress, stars: 15, roundsPlayed: 5 } });
    expect(JSON.parse(storage.items.get(PROGRESS_KEY)!)).toEqual({ schemaVersion: 1, games: { ...others, labyrinth: { ...kept, futureField: "kept", progress: { ...kept.progress, stars: 15, roundsPlayed: 5 } } } });
    expect(localLabyrinthProgress(() => storage).load()?.progress.stars).toBe(15);
  });

  const badProgress = [
    null, [], {}, { ...kept.progress, best: null },
    ...["stars", "roundsPlayed"].flatMap((field) => [-1, 0.5, "3", null, Number.MAX_SAFE_INTEGER + 1].map((value) => ({ ...kept.progress, [field]: value }))),
    ...["hatchling", "explorer", "paleontologist"].flatMap((level) => [-1, 4, 1.5, "3", undefined].map((value) => ({ ...kept.progress, best: { ...kept.progress.best, [level]: value } })))
  ];
  it.each(badProgress)("drops corrupt scores %j and replaces them without losing other games", (bad) => {
    const others = { dig: { dug: ["triceratops"], badges: [] } };
    const storage = memoryStorage({ [PROGRESS_KEY]: record({ ...kept, progress: bad }, others) });
    const progress = localLabyrinthProgress(() => storage);
    expect(progress.load()).toEqual(empty);
    progress.save(kept);
    expect(JSON.parse(storage.items.get(PROGRESS_KEY)!).games).toEqual({ ...others, labyrinth: kept });
  });

  it.each([undefined, null, {}, { level: "unknown", revision: null }, { level: "hatchling", revision: "" }])("drops an unusable optional choice %j without dropping rewards", (levelChoice) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record({ ...kept, levelChoice }) });
    expect(localLabyrinthProgress(() => storage).load()).toEqual({ ...kept, levelChoice: undefined });
  });

  it.each([undefined, null, {}, { level: null, strong: 1, declined: [] }, { level: "hatchling", strong: -1, declined: [] }, { level: "hatchling", strong: 2, declined: ["unknown"] }])("drops an unusable optional offer %j without dropping rewards", (offer) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record({ ...kept, offer }) });
    expect(localLabyrinthProgress(() => storage).load()).toEqual({ ...kept, offer: NO_LEVEL_OFFER });
  });

  it.each([null, "{", "[]", JSON.stringify({ schemaVersion: 99, games: { labyrinth: kept } })])("starts empty for an unreadable record %s", (raw) => {
    const storage = memoryStorage(raw === null ? {} : { [PROGRESS_KEY]: raw });
    expect(localLabyrinthProgress(() => storage).load()).toEqual(empty);
  });

  it("catches storage access, read and write errors", () => {
    const blocked = localLabyrinthProgress(() => { throw new Error("storage blocked"); });
    expect(blocked.load()).toBeUndefined();
    expect(() => blocked.save(kept)).not.toThrow();
    const unreadable = localLabyrinthProgress(() => memoryStorage({}, { read: false }));
    expect(unreadable.load()).toBeUndefined();
    expect(() => unreadable.save(kept)).not.toThrow();
    const storage = memoryStorage({ [PROGRESS_KEY]: record(kept) }, { save: false });
    const unwritable = localLabyrinthProgress(() => storage);
    unwritable.save(empty);
    expect(unwritable.load()).toEqual(kept);
  });
});
