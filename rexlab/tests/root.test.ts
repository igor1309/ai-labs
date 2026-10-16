import { describe, expect, it } from "vitest";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { appProps } from "../src/root.ts";
import { memoryStorage, portraitQuery } from "./support.ts";

// A browser whose local and session storage the test reads apart.
function browser({ local = memoryStorage(), language = "en-GB", portrait = false } = {}) {
  const media = portraitQuery(portrait);
  return {
    localStorage: local,
    sessionStorage: memoryStorage(),
    matchMedia: media.matchMedia,
    navigator: { language },
    media
  };
}

const record = (bestScore: number, roundsPlayed: number) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed } } });

describe("the app in a browser", () => {
  it("reads progress and the chosen language from local storage", () => {
    const props = appProps(browser({ local: memoryStorage({ [PROGRESS_KEY]: record(6, 3), [LANGUAGE_KEY]: "ru" }) }));

    expect(props.progress.load()).toEqual({ bestScore: 6, roundsPlayed: 3 });
    expect(props.languageStore.load()).toBe("ru");
  });

  it("keeps progress and the chosen language in local storage, and nothing in session storage", () => {
    const given = browser();
    const props = appProps(given);

    props.progress.save({ bestScore: 4, roundsPlayed: 1 });
    props.languageStore.save("ru");

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual(JSON.parse(record(4, 1)));
    expect(given.localStorage.items.get(LANGUAGE_KEY)).toBe("ru");
    expect([...given.sessionStorage.items]).toEqual([]);
  });

  it.each(["ru-RU", "en-GB"])("takes the device language %s from the browser", (language) => {
    expect(appProps(browser({ language })).deviceLanguage).toBe(language);
  });

  it("follows the portrait media query", () => {
    const given = browser({ portrait: true });
    const { orientation } = appProps(given);
    const seen: boolean[] = [];
    expect(orientation.isPortrait()).toBe(true);

    const unsubscribe = orientation.subscribe(() => seen.push(orientation.isPortrait()));
    given.media.change(false);
    unsubscribe();
    given.media.change(true);

    expect(seen).toEqual([false]);
  });
});
