import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { HOME_GAMES } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localCareProgress, localFeatured, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import { MENU_EXIT } from "../src/ParentMenu.tsx";
import { badgeOf } from "./homePage.tsx";
import { openMenu, outsideMenu } from "./menus.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  SHIPPED_SKELETONS,
  SHIPPED_SORTABLES,
  SHIPPED_VISITORS,
  fakeBodyPicture,
  fakeItemPicture,
  fakeSkeletonPicture,
  featuredCard,
  manualAppearance,
  manualOrientation,
  manualTimers,
  manualVisibility,
  memoryStorage,
  seededRandom,
  tilesRow,
  unreadVersion,
  type MemoryStorage
} from "./support.ts";

// age-level.feature

const LABELS: Record<Language, string> = { en: "Age level", ru: "Возрастной уровень" };

const NAMES = { hatchling: "HATCHLING", explorer: "EXPLORER", paleontologist: "PALEONTOLOGIST" } as const;

type Level = keyof typeof NAMES;

const PICTURES: Record<Level, string> = { hatchling: "🥚", explorer: "🦖", paleontologist: "🦴" };

// The day the app is opened on, with the large card's game already
// chosen for it.
const TODAY = new Date(2026, 9, 18, 9, 30);

// The app as a browser composes it, every store on the one `storage`, so
// closing and reopening it reads back all it kept.
function openApp({ storage = memoryStorage(), language = "en" }: { storage?: MemoryStorage; language?: Language } = {}) {
  const local = () => storage;
  const featured = localFeatured(local, HOME_GAMES);
  const timers = manualTimers();
  const view = render(
    <App
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(23)}
      orientation={manualOrientation("landscape")}
      pageVisibility={manualVisibility("visible")}
      progress={localProgress(local)}
      deviceLanguage={language === "ru" ? "ru-RU" : "en-GB"}
      languageStore={localLanguage(local)}
      nameVersion={unreadVersion}
      appearance={manualAppearance("light")}
      themeStore={localTheme(local)}
      ageLevelStore={localAgeLevel(local)}
      visitors={SHIPPED_VISITORS}
      careProgress={localCareProgress(local)}
      itemPicture={fakeItemPicture}
      reducedMotion={() => false}
      sortables={SHIPPED_SORTABLES}
      sortingProgress={localSortingProgress(local)}
      pals={SHIPPED_PALS}
      pairsProgress={localPairsProgress(local)}
      skeletons={SHIPPED_SKELETONS}
      skeletonPicture={fakeSkeletonPicture}
      skeletonProgress={localSkeletonProgress(local)}
      now={() => TODAY}
      featuredStore={featured}
      startCounter={featured}
      {...timers}
    />
  );
  return { user: userEvent.setup(), timers, unmount: view.unmount };
}

const levelButton = (language: Language = "en") => screen.getByRole("button", { name: LABELS[language] });

const pictureOn = (element: Element) => element.querySelector(".parent-menu-picture")?.textContent;

// Each choice in the age level menu: its picture, name and age, and
// whether it is checked and shows a ✓.
const levelsIn = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole("menuitemradio")
    .map((choice) => ({
      picture: pictureOn(choice),
      name: choice.querySelector(".parent-menu-name")?.textContent,
      age: choice.querySelector(".parent-menu-note")?.textContent,
      ticked: choice.getAttribute("aria-checked") === "true" && choice.querySelector("svg.lucide-check") !== null
    }));

const tickedIn = (menu: HTMLElement) => levelsIn(menu).filter(({ ticked }) => ticked).map(({ name }) => name);

// Chooses the level named `name` in the age level menu.
async function chooseLevel(user: UserEvent, name: string, language: Language = "en") {
  const menu = await openMenu(user, LABELS[language]);
  const choice = within(menu)
    .getAllByRole("menuitemradio")
    .find((each) => each.querySelector(".parent-menu-name")?.textContent === name);
  if (!choice) throw new Error(`No ${name} in the age level menu`);
  await user.click(choice);
}

// What each tile's badge and the large card's badge read, in order.
const badgesOnHome = () => [...tilesRow().children, featuredCard()].map((card) => badgeOf(card)?.textContent ?? null);

const saved = (level: Level) => JSON.stringify({ level, revision: `picked-${level}` });

describe("the age level menu", () => {
  it.each([
    ["en", "Language", "Theme", [["🥚", "HATCHLING", "about 4"], ["🦖", "EXPLORER", "about 5"], ["🦴", "PALEONTOLOGIST", "6 and up"]]],
    ["ru", "Язык", "Тема", [["🥚", "ДЕТЁНЫШ", "около 4 лет"], ["🦖", "ИССЛЕДОВАТЕЛЬ", "около 5 лет"], ["🦴", "ПАЛЕОНТОЛОГ", "6 лет и старше"]]]
  ] as const)("is for parents, after the theme menu, and lists each level's picture, name and age, in %s", async (language, languageMenu, themeMenu, levels) => {
    const storage = memoryStorage({ [AGE_LEVEL_KEY]: saved("explorer") });
    const { user, timers } = openApp({ storage, language });

    const button = levelButton(language);
    expect(pictureOn(button)).toBe("🦖");
    const group = button.closest(".parent-menus");
    expect(group).not.toBeNull();
    expect([...(group?.querySelectorAll(".parent-menu-button") ?? [])].map((each) => each.getAttribute("aria-label"))).toEqual([
      languageMenu,
      themeMenu,
      LABELS[language]
    ]);

    const menu = await openMenu(user, LABELS[language]);

    expect(levelsIn(menu)).toEqual(levels.map(([picture, name, age]) => ({ picture, name, age, ticked: name === levels[1][1] })));

    await user.click(outsideMenu());
    act(() => timers.fire(MENU_EXIT));

    expect(document.querySelector(".parent-menu-list")).toBeNull();
    expect(pictureOn(levelButton(language))).toBe("🦖");
    expect(storage.items.get(AGE_LEVEL_KEY)).toBe(saved("explorer"));
  });

  it.each([
    ["the app has never been opened on this iPad", memoryStorage()],
    [
      "the games have saved progress, but no age level is saved",
      memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 } } }) })
    ],
    ["the saved age level is not one of the three levels", memoryStorage({ [AGE_LEVEL_KEY]: JSON.stringify({ level: "toddler", revision: "r1" }) })],
    ["the browser's storage cannot be read", memoryStorage({ [AGE_LEVEL_KEY]: saved("paleontologist") }, { read: false })]
  ])("starts at Explorer when %s", async (_, storage) => {
    const { user } = openApp({ storage });

    expect(pictureOn(levelButton())).toBe("🦖");
    expect(tickedIn(await openMenu(user, LABELS.en))).toEqual(["EXPLORER"]);
  });
});

describe("a chosen level", () => {
  it.each([
    ["explorer", "hatchling"],
    ["explorer", "paleontologist"],
    ["hatchling", "explorer"]
  ] as const)("from %s to %s closes the menu, shows on the button and is remembered", async (from, to) => {
    const storage = memoryStorage({ [AGE_LEVEL_KEY]: saved(from) });
    const { user, unmount } = openApp({ storage });

    await chooseLevel(user, NAMES[to]);

    expect(screen.queryByRole("menu")).toBeNull();
    expect(pictureOn(levelButton())).toBe(PICTURES[to]);
    unmount();
    const reopened = openApp({ storage });
    expect(pictureOn(levelButton())).toBe(PICTURES[to]);
    expect(tickedIn(await openMenu(reopened.user, LABELS.en))).toEqual([NAMES[to]]);
  });

  it.each([
    ["no age level is saved", {}, "🦖"],
    ["Paleontologist is saved", { [AGE_LEVEL_KEY]: saved("paleontologist") }, "🦴"]
  ])("still applies until the app closes when it cannot be saved and %s", async (_, items, reopened) => {
    const storage = memoryStorage(items, { save: false });
    const { user, unmount } = openApp({ storage });

    await chooseLevel(user, NAMES.hatchling);

    expect(pictureOn(levelButton())).toBe("🥚");
    unmount();
    openApp({ storage });
    expect(pictureOn(levelButton())).toBe(reopened);
  });

  it.each([
    ["deleted", (storage: MemoryStorage) => storage.items.delete(PROGRESS_KEY)],
    ["there, but not readable", (storage: MemoryStorage) => storage.items.set(PROGRESS_KEY, "{schemaVersion")]
  ])("outlives the games' progress when it is %s", async (_, lose) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 6, roundsPlayed: 3 } } }) });
    const { user, unmount } = openApp({ storage });
    await chooseLevel(user, NAMES.paleontologist);
    unmount();

    lose(storage);
    const { user: again } = openApp({ storage });

    expect(pictureOn(levelButton())).toBe("🦴");
    expect(tickedIn(await openMenu(again, LABELS.en))).toEqual(["PALEONTOLOGIST"]);
  });

  it("changes no saved score, star, collection, start count or featured game", async () => {
    const games = {
      "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 },
      "dinosaur-care": { bestScore: 6, visitsFinished: 2, friends: ["triceratops"] },
      "sort-dinosaurs": { bestScore: 5, roundsPlayed: 2 },
      "find-the-pair": { stars: 40, level: 2, boardsOnLevel: 1, best: {}, found: ["stegosaurus"] },
      "skeleton-assembly": { bestScore: 2, earned: ["triceratops", "stegosaurus"], rebuilding: [] },
      "home-featured": { starts: { compare: 4, care: 2, sort: 1 }, featured: { day: "2026-10-18", game: "care" } }
    };
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games }) });
    const { user } = openApp({ storage });
    const badges = badgesOnHome();
    const featured = featuredCard().getAttribute("data-game");
    const kept = new Map(storage.items);

    for (const level of ["hatchling", "paleontologist", "explorer", "hatchling"] as const) await chooseLevel(user, NAMES[level]);

    expect(pictureOn(levelButton())).toBe("🥚");
    expect(badges).toEqual(["7", String(SHIPPED_CATALOGUE.length), "6", "5", "40", "2", null, "6"]);
    expect([badgesOnHome(), featuredCard().getAttribute("data-game")]).toEqual([badges, featured]);
    expect(featured).toBe("care");
    expect([...storage.items].filter(([key]) => key !== AGE_LEVEL_KEY)).toEqual([...kept].filter(([key]) => key !== AGE_LEVEL_KEY));
    expect(JSON.parse(storage.items.get(PROGRESS_KEY) ?? "").games).toEqual(games);
  });
});
