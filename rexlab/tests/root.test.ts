import { describe, expect, it } from "vitest";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { PROGRESS_KEY } from "../src/localProgress.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import { appProps } from "../src/root.ts";
import { browserDocument, mediaQueries, memoryStorage, pictureBrowser } from "./support.ts";

const PORTRAIT = "(orientation: portrait)";
const DARK = "(prefers-color-scheme: dark)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// A browser whose local and session storage the test reads apart.
function browser({
  local = memoryStorage(),
  language = "en-GB",
  portrait = false,
  dark = false,
  reduced = false,
  visibility = "visible" as DocumentVisibilityState
} = {}) {
  const media = mediaQueries({ [PORTRAIT]: portrait, [DARK]: dark, [REDUCED_MOTION]: reduced });
  const page = browserDocument(visibility);
  return {
    localStorage: local,
    sessionStorage: memoryStorage(),
    matchMedia: media.matchMedia,
    navigator: { language },
    document: page.document,
    media,
    page,
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

  it("keeps care progress beside the quiz's in local storage", () => {
    const given = browser({ local: memoryStorage({ [PROGRESS_KEY]: record(6, 3) }) });
    const props = appProps(given);

    props.careProgress.save({ bestScore: 7, visitsFinished: 3, friends: ["triceratops"] });

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 }, "dinosaur-care": { bestScore: 7, visitsFinished: 3, friends: ["triceratops"] } }
    });
    expect(appProps(given).careProgress.load()).toEqual({ bestScore: 7, visitsFinished: 3, friends: ["triceratops"] });
  });

  it("keeps the sorting game's progress beside the quiz's in local storage", () => {
    const given = browser({ local: memoryStorage({ [PROGRESS_KEY]: record(6, 3) }) });
    const props = appProps(given);

    props.sortingProgress.save({ bestScore: 5, roundsPlayed: 2 });

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 }, "sort-dinosaurs": { bestScore: 5, roundsPlayed: 2 } }
    });
    expect(appProps(given).sortingProgress.load()).toEqual({ bestScore: 5, roundsPlayed: 2 });
  });

  it("keeps the skeleton game's stars, best and stands awaiting rebuild beside the other games' progress in local storage", () => {
    const care = { bestScore: 7, visitsFinished: 3, friends: ["triceratops"] };
    const given = browser({
      local: memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 }, "dinosaur-care": care } }) })
    });
    const props = appProps(given);

    props.skeletonProgress.save({ bestScore: 2, earned: ["tyrannosaurus", "stegosaurus"], rebuilding: ["stegosaurus"] });

    expect(JSON.parse(given.localStorage.items.get(PROGRESS_KEY) ?? "")).toEqual({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 },
        "dinosaur-care": care,
        "skeleton-assembly": { bestScore: 2, earned: ["tyrannosaurus", "stegosaurus"], rebuilding: ["stegosaurus"] }
      }
    });
    const reopened = appProps(given);
    expect([reopened.skeletonProgress.load(), reopened.progress.load(), reopened.careProgress.load()]).toEqual([
      { bestScore: 2, earned: ["tyrannosaurus", "stegosaurus"], rebuilding: ["stegosaurus"] },
      { bestScore: 6, roundsPlayed: 3 },
      care
    ]);
  });

  it("lets every dinosaur of the shipped list visit, with its food type", () => {
    const { visitors, dinosaurs } = appProps(browser());

    expect(visitors.map(({ id }) => id)).toEqual(dinosaurs.map(({ id }) => id));
    expect(visitors.find(({ id }) => id === "tyrannosaurus")?.diet).toBe("meat");
  });

  it("finds each care picture among the shipped files", () => {
    const { itemPicture } = appProps(browser());

    expect(["plants", "meat", "water", "bath", "nest", "bowl"].map((name) => itemPicture(name).replace(/\?.*$/, ""))).toEqual(
      ["plants", "meat", "water", "bath", "nest", "bowl"].map((name) => `/src/assets/care/${name}.webp`)
    );
  });

  it("follows the reduced motion media query each time it asks", () => {
    const given = browser({ reduced: true });
    const { reducedMotion } = appProps(given);
    expect(reducedMotion()).toBe(true);

    given.media.change(REDUCED_MOTION, false);

    expect(reducedMotion()).toBe(false);
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

  it("follows the document's visibility", () => {
    const given = browser({ visibility: "hidden" });
    const { pageVisibility } = appProps(given);
    const seen: boolean[] = [];
    expect(pageVisibility.isHidden()).toBe(true);

    const unsubscribe = pageVisibility.subscribe(() => seen.push(pageVisibility.isHidden()));
    given.page.switchTo("visible");
    given.page.switchTo("hidden");
    unsubscribe();
    given.page.switchTo("visible");

    expect(seen).toEqual([false, true]);
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
