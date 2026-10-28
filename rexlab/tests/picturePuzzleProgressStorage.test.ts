import { describe, expect, it } from "vitest";
import { localPicturePuzzleChoice, localPicturePuzzleProgress, PROGRESS_KEY, type KeyValueStorage } from "../src/localProgress.ts";
import { NO_PICTURES, type PictureProgress } from "../src/picturePuzzle/index.ts";
import { memoryStorage } from "./support.ts";

const stored = (entry: unknown) => JSON.stringify({ schemaVersion: 1, games: { "picture-puzzle": entry, other: { keep: [1, 2] } } });
const FIRST: PictureProgress = { earned: ["tyrannosaurus"], completed: { hatchling: ["tyrannosaurus"], explorer: [], paleontologist: [] } };
const SECOND: PictureProgress = { earned: ["triceratops"], completed: { hatchling: [], explorer: ["triceratops"], paleontologist: [] } };

describe("stored picture collections", () => {
  it("round-trips both collections while keeping level choice, unknown fields and other games", () => {
    const levelChoice = { level: "hatchling" as const, revision: "parent-2" };
    const storage = memoryStorage({ [PROGRESS_KEY]: stored({ levelChoice, custom: [7] }) });
    const store = localPicturePuzzleProgress(() => storage);
    expect(store.load()).toEqual(NO_PICTURES);
    expect(store.save(FIRST)).toBe(true);
    expect(localPicturePuzzleProgress(() => storage).load()).toEqual(FIRST);
    expect(localPicturePuzzleChoice(() => storage).load()).toEqual({ earned: FIRST.earned, levelChoice });
    localPicturePuzzleChoice(() => storage).saveLevel({ level: "explorer", revision: null });
    expect(store.load()).toEqual(FIRST);
    expect(JSON.parse(storage.items.get(PROGRESS_KEY)!)).toEqual({ schemaVersion: 1, games: {
      "picture-puzzle": { ...FIRST, levelChoice: { level: "explorer", revision: null }, custom: [7] }, other: { keep: [1, 2] }
    } });
  });

  it("unions an intervening tab's shared and per-level collections", () => {
    const storage = memoryStorage();
    const one = localPicturePuzzleProgress(() => storage);
    const two = localPicturePuzzleProgress(() => storage);
    expect(one.load()).toEqual(NO_PICTURES);
    expect(two.load()).toEqual(NO_PICTURES);
    one.save(FIRST);
    two.save(SECOND);
    one.save(FIRST);
    expect(two.load()).toEqual({ earned: ["tyrannosaurus", "triceratops"], completed: { hatchling: ["tyrannosaurus"], explorer: ["triceratops"], paleontologist: [] } });
  });

  it.each([undefined, "{bad", "null", "[]", JSON.stringify({ schemaVersion: 2, games: {} }), stored(7)])("recovers an empty collection from %s", (raw) => {
    const storage = memoryStorage(raw === undefined ? {} : { [PROGRESS_KEY]: raw });
    const store = localPicturePuzzleProgress(() => storage);
    expect(store.load()).toEqual(NO_PICTURES);
    expect(store.save(FIRST)).toBe(true);
    expect(store.load()).toEqual(FIRST);
  });

  it("normalizes duplicate, retired and malformed ids without erasing valid levels", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: stored({ earned: ["stegosaurus", "stegosaurus", "retired"], completed: {
      hatchling: ["tyrannosaurus", "tyrannosaurus", "retired"], explorer: [1], paleontologist: ["triceratops"], unknown: ["stegosaurus"]
    } }) });
    expect(localPicturePuzzleProgress(() => storage).load()).toEqual({
      earned: ["tyrannosaurus", "triceratops", "stegosaurus"],
      completed: { hatchling: ["tyrannosaurus"], explorer: [], paleontologist: ["triceratops"] }
    });
  });

  it.each(["access", "read", "write"])("reports failure without throwing when storage fails on %s", (failure) => {
    const storage = memoryStorage({}, { read: failure !== "read", save: failure !== "write" });
    const reach = (): KeyValueStorage => {
      if (failure === "access") throw new Error("Blocked storage");
      return storage;
    };
    const store = localPicturePuzzleProgress(reach);
    expect(store.load()).toEqual(failure === "write" ? NO_PICTURES : undefined);
    expect(store.save(FIRST)).toBe(false);
    expect(storage.items.size).toBe(0);
  });
});
