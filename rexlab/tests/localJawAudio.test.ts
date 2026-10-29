import { describe, expect, it } from "vitest";
import { JAW_AUDIO_KEY, localJawAudio } from "../src/localJawAudio.ts";
import { memoryStorage } from "./support.ts";

describe("local Whose Jaw audio preference", () => {
  it.each([null, "true", "false", "TRUE", "0", "{}"])("reads %s without coercing invalid choices", (raw) => {
    const storage = memoryStorage(raw === null ? {} : { [JAW_AUDIO_KEY]: raw });
    expect(localJawAudio(() => storage).load()).toBe(raw === "true" ? true : raw === "false" ? false : undefined);
  });

  it.each([true, false])("persists %s across adapter recreation and preserves other preferences", (muted) => {
    const storage = memoryStorage({ unrelated: "kept" });
    localJawAudio(() => storage).save(muted);
    expect(localJawAudio(() => storage).load()).toBe(muted);
    expect(storage.items.get("unrelated")).toBe("kept");
  });

  it("tolerates inaccessible storage, failed reads and failed writes", () => {
    const denied = localJawAudio(() => { throw new Error("denied"); });
    const broken = localJawAudio(() => memoryStorage({}, { read: false, save: false }));
    for (const store of [denied, broken]) {
      expect(store.load()).toBeUndefined();
      expect(() => store.save(true)).not.toThrow();
      expect(() => store.save(false)).not.toThrow();
    }
  });
});
