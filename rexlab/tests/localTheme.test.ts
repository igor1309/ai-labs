import { describe, expect, it } from "vitest";
import { THEME_KEY, localTheme } from "../src/localTheme.ts";
import { memoryStorage } from "./support.ts";

describe("localTheme", () => {
  it.each(["system", "light", "dark"] as const)("reads a chosen %s", (choice) => {
    const storage = memoryStorage({ [THEME_KEY]: choice });

    expect(localTheme(() => storage).load()).toBe(choice);
  });

  it.each([
    ["empty storage", memoryStorage()],
    ["a theme the app does not have", memoryStorage({ [THEME_KEY]: "sepia" })],
    ["a theme in another case", memoryStorage({ [THEME_KEY]: "Dark" })],
    ["storage that cannot be read", memoryStorage({ [THEME_KEY]: "dark" }, { read: false })]
  ])("reads no choice from %s", (_, storage) => {
    expect(localTheme(() => storage).load()).toBeUndefined();
  });

  it("reads no choice and saves nothing when the storage cannot be reached", () => {
    const theme = localTheme(() => {
      throw new DOMException("Access is denied", "SecurityError");
    });

    expect(theme.load()).toBeUndefined();
    expect(() => theme.save("dark")).not.toThrow();
  });

  it("keeps the chosen theme, replacing the one before", () => {
    const storage = memoryStorage({ [THEME_KEY]: "dark" });
    const theme = localTheme(() => storage);

    theme.save("system");

    expect(storage.items.get(THEME_KEY)).toBe("system");
    expect(theme.load()).toBe("system");
  });

  it("drops a choice that cannot be saved and keeps the stored one", () => {
    const storage = memoryStorage({ [THEME_KEY]: "light" }, { save: false });
    const theme = localTheme(() => storage);

    expect(() => theme.save("dark")).not.toThrow();

    expect(theme.load()).toBe("light");
  });
});
