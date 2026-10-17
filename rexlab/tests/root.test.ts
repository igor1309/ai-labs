import { describe, expect, it } from "vitest";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import { appProps } from "../src/root.ts";
import { mediaQueries, memoryStorage, pictureBrowser } from "./support.ts";

const PORTRAIT = "(orientation: portrait)";
const DARK = "(prefers-color-scheme: dark)";

// A browser whose local and session storage the test reads apart.
function browser({ local = memoryStorage(), language = "en-GB", portrait = false, dark = false } = {}) {
  const media = mediaQueries({ [PORTRAIT]: portrait, [DARK]: dark });
  return {
    localStorage: local,
    sessionStorage: memoryStorage(),
    matchMedia: media.matchMedia,
    navigator: { language },
    media,
    ...pictureBrowser()
  };
}

const record = (bestScore: number, roundsPlayed: number) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed } } });

describe("the app in a browser", () => {
  it("reads progress, the chosen language and the chosen theme from local storage", () => {
    const props = appProps(browser({ local: memoryStorage({ [PROGRESS_KEY]: record(6, 3), [LANGUAGE_KEY]: "ru", [THEME_KEY]: "dark" }) }));

    expect(props.progress.load()).toEqual({ bestScore: 6, roundsPlayed: 3 });
    expect(props.languageStore.load()).toBe("ru");
    expect(props.themeStore.load()).toBe("dark");
  });

  it("keeps progress, the chosen language and the chosen theme in local storage, and nothing in session storage", () => {
    const given = browser();
    const props = appProps(given);

    props.progress.save({ bestScore: 4, roundsPlayed: 1 });
    props.languageStore.save("ru");
    props.themeStore.save("light");

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual(JSON.parse(record(4, 1)));
    expect(given.localStorage.items.get(LANGUAGE_KEY)).toBe("ru");
    expect(given.localStorage.items.get(THEME_KEY)).toBe("light");
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
    given.media.change(PORTRAIT, false);
    unsubscribe();
    given.media.change(PORTRAIT, true);

    expect(seen).toEqual([false]);
  });

  it("follows the dark colour scheme media query", () => {
    const given = browser({ dark: true });
    const { appearance } = appProps(given);
    const seen: boolean[] = [];
    expect(appearance.isDark()).toBe(true);

    const unsubscribe = appearance.subscribe(() => seen.push(appearance.isDark()));
    given.media.change(DARK, false);
    unsubscribe();
    given.media.change(DARK, true);

    expect(seen).toEqual([false]);
  });

  it("decodes each picture with the browser's own images", () => {
    const given = browser();
    const { loadPicture } = appProps(given);

    loadPicture("/pictures/stegosaurus.webp", () => {});
    loadPicture("/pictures/triceratops.webp", () => {});

    expect(given.decoding).toEqual(["/pictures/stegosaurus.webp", "/pictures/triceratops.webp"]);
  });

  it("starts and stops the browser's own timers", () => {
    const given = browser();
    const { startTimer } = appProps(given);
    const fired: number[] = [];

    startTimer(1000, () => fired.push(1000));
    const stop = startTimer(500, () => fired.push(500));
    stop();
    given.timers[0]?.fire();

    expect(given.timers.map(({ ms }) => ms)).toEqual([1000, 500]);
    expect(given.stopped).toEqual([1]);
    expect(fired).toEqual([1000]);
  });
});
