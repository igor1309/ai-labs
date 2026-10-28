import { describe, expect, it } from "vitest";
import jaws from "../src/data/jaws.json";
import { localWhoseJawProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { memoryStorage } from "./support.ts";

const ids = jaws.map(({ id }) => id);
const record = (entry: unknown, others = {}) => JSON.stringify({ schemaVersion: 1, games: { ...others, "whose-jaw": entry } });
const empty = { best: { hatchling: null, explorer: null, paleontologist: null }, earned: [], levelChoice: undefined };

describe("Whose Jaw welcome storage", () => {
  it("reads valid level bests and distinct shipped jaws, and saves only the choice over the latest record", () => {
    const rewards = { best: { hatchling: 3, explorer: 2, paleontologist: 1 }, earned: ids.slice(0, 5), offer: { strong: 2 }, future: true };
    const storage = memoryStorage({ [PROGRESS_KEY]: record(rewards) });
    const store = localWhoseJawProgress(() => storage, ids);
    expect(store.load()).toEqual({ best: rewards.best, earned: ids.slice(0, 5), levelChoice: undefined });
    const newest = { ...rewards, earned: ids.slice(0, 6) };
    const others = { dig: { dug: ["stegosaurus"] }, unknown: { future: true } };
    storage.items.set(PROGRESS_KEY, record(newest, others));
    const levelChoice = { level: "hatchling" as const, revision: "parent" };
    store.saveLevel(levelChoice);
    expect(JSON.parse(storage.items.get(PROGRESS_KEY)!)).toEqual(JSON.parse(record({ ...newest, levelChoice }, others)));
    expect(localWhoseJawProgress(() => storage, ids).load()).toEqual({ best: rewards.best, earned: ids.slice(0, 6), levelChoice });
  });

  it.each([null, [], {}, -1, 0, 4, 1.5, "3"])("drops an invalid best %j independently from valid rewards and choices", (bad) => {
    const levelChoice = { level: "explorer", revision: null };
    const storage = memoryStorage({ [PROGRESS_KEY]: record({ best: { hatchling: 3, explorer: bad }, earned: [ids[0], ids[0], "unknown", null], levelChoice }) });
    expect(localWhoseJawProgress(() => storage, ids).load()).toEqual({ best: { hatchling: 3, explorer: null, paleontologist: null }, earned: [ids[0]], levelChoice });
  });

  it.each([undefined, null, {}, { level: "other", revision: null }, { level: "hatchling", revision: "" }])("ignores invalid choices %j", (levelChoice) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: record({ levelChoice }) });
    expect(localWhoseJawProgress(() => storage, ids).load()).toEqual(empty);
  });

  it.each([null, "{", "[]", '{"schemaVersion":99,"games":{}}'])("starts empty for absent or malformed progress %j", (raw) => {
    const storage = memoryStorage(raw === null ? {} : { [PROGRESS_KEY]: raw });
    expect(localWhoseJawProgress(() => storage, ids).load()).toEqual(empty);
  });

  it("catches browser storage access and write failures", () => {
    const blocked = localWhoseJawProgress(() => { throw new Error("blocked"); }, ids);
    expect(blocked.load()).toBeUndefined();
    expect(() => blocked.saveLevel({ level: "explorer", revision: null })).not.toThrow();
    const storage = memoryStorage({ [PROGRESS_KEY]: record({}) }, { save: false });
    localWhoseJawProgress(() => storage, ids).saveLevel({ level: "hatchling", revision: null });
    expect(storage.items.get(PROGRESS_KEY)).toBe(record({}));
  });
});
