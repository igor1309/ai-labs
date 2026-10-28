import { describe, expect, it } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { localPicturePuzzleChoice, PROGRESS_KEY, type KeyValueStorage } from "../src/localProgress.ts";
import { memoryStorage } from "./support.ts";

const stored = (entry: unknown) => JSON.stringify({ schemaVersion: 1, games: { "picture-puzzle": entry, other: { keep: [1, 2] } } });

describe("the picture puzzle's saved choice", () => {
  it.each(AGE_LEVELS)("round-trips %s under both the initial and a parent's revision, preserving collection and other games", (level) => {
    for (const revision of [null, "parent-2"]) {
      const collection = { earned: ["tyrannosaurus", "stegosaurus"], best: { hatchling: 2 }, roundsPlayed: 7 };
      const storage = memoryStorage({ [PROGRESS_KEY]: stored(collection) });
      const levelChoice = { level, revision };
      localPicturePuzzleChoice(() => storage).saveLevel(levelChoice);
      expect(localPicturePuzzleChoice(() => storage).load()).toEqual({ earned: collection.earned, levelChoice });
      expect(JSON.parse(storage.items.get(PROGRESS_KEY)!)).toEqual({
        schemaVersion: 1, games: { "picture-puzzle": { ...collection, levelChoice }, other: { keep: [1, 2] } }
      });
    }
  });

  it.each([undefined, "{bad", "null", "[]", JSON.stringify({ schemaVersion: 2, games: {} }), stored(7)])(
    "can save a choice with no readable record (%s)", (raw) => {
      const storage = memoryStorage(raw === undefined ? {} : { [PROGRESS_KEY]: raw });
      const store = localPicturePuzzleChoice(() => storage);
      expect(store.load()).toEqual({ earned: [], levelChoice: undefined });
      store.saveLevel({ level: "hatchling", revision: null });
      expect(store.load()).toEqual({ earned: [], levelChoice: { level: "hatchling", revision: null } });
    }
  );

  it.each([null, { level: "unknown", revision: null }, { level: "explorer" }, { level: "explorer", revision: "" }])(
    "ignores an invalid choice %j while retaining collection data", (levelChoice) => {
      const storage = memoryStorage({ [PROGRESS_KEY]: stored({ earned: ["triceratops"], levelChoice }) });
      expect(localPicturePuzzleChoice(() => storage).load()).toEqual({ earned: ["triceratops"], levelChoice: undefined });
    }
  );

  it.each(["tyrannosaurus", [1], null])("ignores malformed collection ids %j while retaining the choice", (earned) => {
    const levelChoice = { level: "explorer" as const, revision: null };
    const storage = memoryStorage({ [PROGRESS_KEY]: stored({ earned, levelChoice }) });
    expect(localPicturePuzzleChoice(() => storage).load()).toEqual({ earned: [], levelChoice });
  });

  it.each(["access", "read", "write"])("does not throw when storage fails on %s", (failure) => {
    const storage = memoryStorage({}, { read: failure !== "read", save: failure !== "write" });
    const reach = (): KeyValueStorage => {
      if (failure === "access") throw new Error("Blocked storage");
      return storage;
    };
    const store = localPicturePuzzleChoice(reach);
    expect(store.load()).toEqual(failure === "write" ? { earned: [], levelChoice: undefined } : undefined);
    expect(() => store.saveLevel({ level: "hatchling", revision: null })).not.toThrow();
    expect(storage.items.size).toBe(0);
  });
});
