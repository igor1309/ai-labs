import { describe, expect, it } from "vitest";
import { LANGUAGE_KEY, localLanguage } from "../src/localLanguage.ts";
import { memoryStorage } from "./support.ts";

describe("localLanguage", () => {
  it.each(["en", "ru"] as const)("reads a chosen %s", (language) => {
    const storage = memoryStorage({ [LANGUAGE_KEY]: language });

    expect(localLanguage(() => storage).load()).toBe(language);
  });

  it.each([
    ["empty storage", memoryStorage()],
    ["a language the app does not speak", memoryStorage({ [LANGUAGE_KEY]: "de" })],
    ["a tag rather than a language", memoryStorage({ [LANGUAGE_KEY]: "ru-RU" })],
    ["storage that cannot be read", memoryStorage({ [LANGUAGE_KEY]: "ru" }, { read: false })]
  ])("reads no choice from %s", (_, storage) => {
    expect(localLanguage(() => storage).load()).toBeUndefined();
  });

  it("reads no choice and saves nothing when the storage cannot be reached", () => {
    const language = localLanguage(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });

    expect(language.load()).toBeUndefined();
    expect(() => language.save("ru")).not.toThrow();
  });

  it("keeps the chosen language, replacing the one before", () => {
    const storage = memoryStorage({ [LANGUAGE_KEY]: "en" });
    const language = localLanguage(() => storage);

    language.save("ru");

    expect(storage.items.get(LANGUAGE_KEY)).toBe("ru");
    expect(language.load()).toBe("ru");
  });

  it("drops a choice that cannot be saved and keeps the stored one", () => {
    const storage = memoryStorage({ [LANGUAGE_KEY]: "en" }, { save: false });
    const language = localLanguage(() => storage);

    expect(() => language.save("ru")).not.toThrow();

    expect(language.load()).toBe("en");
  });
});
