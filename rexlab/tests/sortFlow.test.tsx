import { AGE_LEVELS, type AgeLevel } from "../src/ageLevel.ts";
import { AGE_LEVEL_KEY, localAgeLevel } from "../src/localAgeLevel.ts";
import { TEXTS } from "../src/language/texts.ts";
import { chooseFrom } from "./menus.ts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, type AgeLevelStore } from "../src/App.tsx";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { PROGRESS_KEY, localProgress, localSortingProgress } from "../src/localProgress.ts";
import type { HomeGame } from "../src/HomePage.tsx";
import { NO_SORTING, type Random } from "../src/sorting/index.ts";
import { basketsShown, sortingRecord, sortByTrying, storedRecord, tray } from "./sorting.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_SORTABLES,
  emptyCare,
  emptyPairs,
  englishDevice,
  emptySkeletons,
  fakeBodyPicture,
  featuredCard,
  homeTile,
  featuring,
  lightDevice,
  loadShownPictures,
  loadedPictures,
  manualOrientation,
  manualPictures,
  memoryStorage,
  seededRandom,
  symbolOf,
  words,
  type ManualPictures,
  type MemoryStorage
} from "./support.ts";

// The app on its home page, the sorting game's progress kept in
// `storage`.
function openApp({
  storage = memoryStorage(),
  random = seededRandom(11),
  pictures = loadedPictures(),
  featured = "compare",
  ageLevelStore = { load: () => ({ level: "hatchling", revision: null }), save: () => {} }
}: {
  storage?: MemoryStorage;
  random?: Random;
  pictures?: ReturnType<typeof loadedPictures>;
  featured?: HomeGame;
  ageLevelStore?: AgeLevelStore;
} = {}) {
  const view = render(
    <App
      {...featuring(featured)}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={random}
      orientation={manualOrientation("landscape")}
      progress={localProgress(() => storage)}
      {...englishDevice()}
      {...lightDevice()}
      ageLevelStore={ageLevelStore}
      {...emptyCare()}
      {...emptyPairs()}
      {...emptySkeletons()}
      sortables={SHIPPED_SORTABLES}
      sortingProgress={localSortingProgress(() => storage)}
      {...pictures}
    />
  );
  return { user: userEvent.setup(), unmount: view.unmount };
}

const button = (name: string) => screen.getByRole("button", { name });
const onHomePage = () => screen.queryByRole("button", { name: "SORT" }) !== null;
const onBoard = () => screen.queryByRole("heading", { name: "SORT THE DINOSAURS" }) !== null;
const onResult = () => screen.queryByRole("button", { name: "PLAY AGAIN" }) !== null;
const picturesShown = () =>
  within(tray())
    .getAllByRole("img")
    .map((picture) => picture.getAttribute("src"));

// Sorts the board on screen and sees its result.
async function finishShownBoard(user: UserEvent) {
  await sortByTrying(user);
  await user.click(button("SEE RESULT"));
}

describe("the sorting game from the home page", () => {
  it("starts a board on SORT: the prompt, two baskets and six dinosaurs, each with its own picture and name, and HOME away from them", async () => {
    const { user } = openApp();

    await user.click(button("SORT"));

    expect(onHomePage()).toBe(false);
    expect(words(screen.getByRole("heading"))).toBe("SORT THE DINOSAURS");
    expect(basketsShown()).toHaveLength(2);
    const cards = within(tray()).getAllByRole("button");
    expect(cards).toHaveLength(6);
    const ids = cards.map((card) => SHIPPED_SORTABLES.find(({ name }) => name.en === card.getAttribute("aria-label"))?.id);
    expect(new Set(ids).size).toBe(6);
    expect(picturesShown()).toEqual(ids.map((id) => fakeBodyPicture(id ?? "")));
    expect(cards.map((card) => words(card))).toEqual(cards.map((card) => card.getAttribute("aria-label")?.toUpperCase()));
    const home = button("HOME");
    expect([symbolOf(home), tray().contains(home)]).toEqual(["house", false]);
  });

  it("plays a board to its result, keeps its score, and goes home to a SORT card showing it as the best", async () => {
    const storage = memoryStorage();
    const { user } = openApp({ storage });
    await user.click(button("SORT"));

    await finishShownBoard(user);

    const score = screen.getByLabelText("SCORE").textContent ?? "";
    const [right, total] = score.split("/");
    expect(total).toBe("6");
    expect(storedRecord(storage)?.games["sort-dinosaurs"]).toEqual({ explorerBest: null, paleontologistBest: null, bestScore: Number(right), roundsPlayed: 1 });

    await user.click(button("HOME"));

    expect(onHomePage()).toBe(true);
    expect(button("SORT").querySelector(".sort-tile-best")?.textContent).toBe(right);
  });

  it("goes home from a board left early, recording nothing", async () => {
    const storage = memoryStorage();
    const { user } = openApp({ storage });
    await user.click(button("SORT"));
    const [first] = within(tray()).getAllByRole("button");
    if (first) await user.click(first);
    await user.click(document.querySelector<HTMLElement>(".basket") ?? document.body);

    await user.click(button("HOME"));

    expect(onHomePage()).toBe(true);
    expect(storage.items.has(PROGRESS_KEY)).toBe(false);
    expect(button("SORT").querySelector(".sort-tile-best")).toBeNull();
  });

  it("starts a new board on PLAY AGAIN, with no card sorted yet", async () => {
    const { user } = openApp();
    await user.click(button("SORT"));
    await finishShownBoard(user);

    await user.click(button("PLAY AGAIN"));

    expect(onBoard()).toBe(true);
    expect(within(tray()).getAllByRole("button")).toHaveLength(6);
    expect(document.querySelectorAll(".sorted-card")).toHaveLength(0);
    expect(screen.queryByLabelText("SCORE")).toBeNull();
  });
});

// Opens the app on the screen a new board is started from: the home page,
// or the sorting game's result, reached with every picture loaded.
async function openOn(start: "home" | "result", pictures: ManualPictures, featured?: HomeGame) {
  const app = openApp({ pictures, ...(featured && { featured }) });
  loadShownPictures(pictures);
  if (start === "result") {
    await app.user.click(button("SORT"));
    act(() => pictures.loading().forEach(pictures.finish));
    await finishShownBoard(app.user);
    loadShownPictures(pictures);
  }
  return app;
}

// Each screen a round starts from, the button that starts it, and the
// game featured on the home page meanwhile.
const STARTS = [
  ["the home page", "home", "SORT", () => button("SORT"), undefined],
  ["the home page", "home", "its featured card", () => featuredCard(), "sort"],
  ["the result", "result", "PLAY AGAIN", () => button("PLAY AGAIN"), undefined]
] as const;

const TAPS = [
  ["once", (user: UserEvent, element: HTMLElement) => user.click(element)],
  ["twice quickly", (user: UserEvent, element: HTMLElement) => user.dblClick(element)]
] as const;

// Each card's picture on the tray, as its place looks.
const looksShown = () => within(tray()).getAllByRole("img").map((picture) => picture.dataset.picture);

describe("a new board", () => {
  it.each(STARTS.flatMap((start) => TAPS.map((taps) => [...start, ...taps] as const)))(
    "starts at once on %s after %s is tapped %s, one board, its six cards named over their pictures' shimmer, then fading them in",
    async (_, start, __, control, featured, ___, tap) => {
      const pictures = manualPictures();
      const { user } = await openOn(start, pictures, featured);

      await tap(user, control());

      // A picture loaded before shows at once, and only the rest shimmer.
      const cards = within(tray()).getAllByRole("button");
      const urls = cards.map((card) => fakeBodyPicture(SHIPPED_SORTABLES.find(({ name }) => name.en === card.getAttribute("aria-label"))?.id ?? ""));
      const asked = pictures.loading();
      const loading = urls.map((url) => asked.includes(url));
      expect([onBoard(), cards.map((card) => card.getAttribute("aria-pressed")), looksShown()]).toEqual([true, Array<string>(6).fill("false"), loading.map((still) => (still ? "loading" : "shown"))]);
      expect(cards.map((card) => words(card))).toEqual(cards.map((card) => card.getAttribute("aria-label")?.toUpperCase()));
      act(() => asked.forEach(pictures.finish));
      expect([looksShown(), picturesShown()]).toEqual([loading.map((still) => (still ? "appearing" : "shown")), urls]);
    }
  );

  it("is sorted to its result while its pictures load, each sorted card's place shimmering too", async () => {
    const pictures = manualPictures();
    const { user } = await openOn("home", pictures);
    await user.click(button("SORT"));

    await sortByTrying(user);

    expect([...document.querySelectorAll<HTMLElement>(".sorted-picture")].map((picture) => picture.dataset.picture)).toEqual(Array<string>(6).fill("loading"));
    await user.click(button("SEE RESULT"));
    expect(onResult()).toBe(true);
  });

  it("shows each card's failure look once its pictures are still loading after 8 seconds, named, and sorted all the same, each sorted card shimmering for 8 seconds of its own", async () => {
    const pictures = manualPictures();
    const { user } = await openOn("home", pictures);
    await user.click(button("SORT"));

    act(() => pictures.fire(PICTURE_LIMIT));

    expect(looksShown()).toEqual(Array<string>(6).fill("failed"));
    const cards = within(tray()).getAllByRole("button");
    expect(cards.map((card) => words(card))).toEqual(cards.map((card) => card.getAttribute("aria-label")?.toUpperCase()));
    await sortByTrying(user);
    // Each sorted card is a place of its own, with 8 seconds of its own.
    const sortedLooks = () => [...document.querySelectorAll<HTMLElement>(".sorted-picture")].map((picture) => picture.dataset.picture);
    expect(sortedLooks()).toEqual(Array<string>(6).fill("loading"));
    act(() => pictures.fire(PICTURE_LIMIT));
    expect(sortedLooks()).toEqual(Array<string>(6).fill("failed"));
    await user.click(button("SEE RESULT"));
    expect(onResult()).toBe(true);
  });
});

// A random source that always gives `value`: left to itself, it would
// pick the same property for every board.
const always = (value: number): Random => () => value;

// One for each property a board may sort by first.
const VALUES = [0, 0.2, 0.4, 0.6, 0.8];

const NEXT_BOARDS: ReadonlyArray<readonly [string, (user: UserEvent) => Promise<void>]> = [
  [
    "PLAY AGAIN after a finished board",
    async (user) => {
      await finishShownBoard(user);
      await user.click(button("PLAY AGAIN"));
    }
  ],
  [
    "SORT after a finished board",
    async (user) => {
      await finishShownBoard(user);
      await user.click(button("HOME"));
      await user.click(button("SORT"));
    }
  ],
  [
    "SORT after a board left early",
    async (user) => {
      await user.click(button("HOME"));
      await user.click(button("SORT"));
    }
  ]
];

describe("rounds", () => {
  it.each(NEXT_BOARDS.flatMap(([path, next]) => VALUES.map((value) => [path, value, next] as const)))(
    "vary on %s: a random source always at %s sorts the second board by another property",
    async (_, value, next) => {
      const { user } = openApp({ random: always(value) });
      await user.click(button("SORT"));
      const first = basketsShown();

      await next(user);

      expect(onBoard()).toBe(true);
      expect(basketsShown()).not.toEqual(first);
    }
  );

  it.each(VALUES)("may sort by the property of the last board once the app is reloaded, with a random source always at %s", async (value) => {
    const storage = memoryStorage();
    const before = openApp({ storage, random: always(value) });
    await before.user.click(button("SORT"));
    const last = basketsShown();
    before.unmount();

    const { user } = openApp({ storage, random: always(value) });
    await user.click(button("SORT"));

    expect(basketsShown()).toEqual(last);
  });
});

const LEVEL_CARDS = { hatchling: 6, explorer: 8, paleontologist: 10 } as const;
const switchButton = (level: AgeLevel) => within(screen.getByRole("group", { name: TEXTS.en.ageLevelSwitch })).getByRole("button", { name: TEXTS.en.ageLevels[level].name });
const shownBest = () => screen.queryByLabelText("BEST SCORE")?.querySelector(".best-score-value")?.textContent;
const celebrations = () => screen.queryAllByRole("status").map((status) => status.getAttribute("aria-label"));
const recordAt = (level: AgeLevel, entry: unknown = NO_SORTING) => memoryStorage({
  [AGE_LEVEL_KEY]: JSON.stringify({ level, revision: "parent-pick" }),
  [PROGRESS_KEY]: sortingRecord(entry)
});
const openStored = (storage: MemoryStorage) => openApp({ storage, ageLevelStore: localAgeLevel(() => storage), random: () => 0, featured: "sort" });

// Sorts the screen's actual cards, using the shipped facts and the named
// baskets, with exactly `right` first drops correct.
async function finishWith(user: UserEvent, right: number) {
  const baskets = [...document.querySelectorAll<HTMLElement>(".basket")];
  const cards = within(tray()).getAllByRole("button");
  for (const [at, card] of cards.entries()) {
    const dinosaur = SHIPPED_SORTABLES.find(({ name }) => name.en === card.getAttribute("aria-label"));
    if (!dinosaur) throw new Error("No shipped dinosaur for the shown card");
    const facts = {
      "TWO LEGS": dinosaur.legs === 2, "FOUR LEGS": dinosaur.legs === 4, "TWO OR FOUR": dinosaur.legs === "either",
      "PLANTS": dinosaur.diet === "plants", "MEAT": dinosaur.diet === "meat", "BOTH": dinosaur.diet === "both",
      "BIG": dinosaur.size === "big", "SMALL": dinosaur.size === "small",
      "HORNS": dinosaur.horns === true, "NO HORNS": dinosaur.horns === false,
      "FEATHERS": dinosaur.feathers === true, "NO FEATHERS": dinosaur.feathers === false, "NOT KNOWN YET": dinosaur.feathers === "unknown"
    };
    const correct = baskets.find((basket) => facts[basket.getAttribute("aria-label") as keyof typeof facts]);
    const wrong = baskets.find((basket) => basket !== correct);
    if (!correct || !wrong) throw new Error("No correct and wrong basket for the card");
    if (at >= right) {
      await user.click(card);
      await user.click(wrong);
    }
    await user.click(card);
    await user.click(correct);
  }
  await user.click(button("SEE RESULT"));
}

describe("the sorting levels across the app", () => {
  it.each(AGE_LEVELS.flatMap((level) => (["tile", "featured"] as const).map((entry) => [level, entry] as const)))(
    "starts %s from the %s at the age level and marks it on the result switch",
    async (level, entry) => {
      const { user } = openStored(recordAt(level));
      await user.click(entry === "tile" ? homeTile("SORT") : featuredCard());
      expect(within(tray()).getAllByRole("button")).toHaveLength(LEVEL_CARDS[level]);
      expect(document.querySelectorAll(".step")).toHaveLength(LEVEL_CARDS[level]);
      await finishShownBoard(user);
      expect(switchButton(level).getAttribute("aria-pressed")).toBe("true");
    }
  );

  it.each([
    ["hatchling", 6, 6, "NEW BEST SCORE", { bestScore: 6, explorerBest: 6, paleontologistBest: null }],
    ["explorer", 8, 5, undefined, { bestScore: 5, explorerBest: 6, paleontologistBest: null }],
    ["paleontologist", 10, 7, "FIRST BEST SCORE", { bestScore: 5, explorerBest: 6, paleontologistBest: 7 }]
  ] as const)("scores %s's %i cards, celebrates its own best, and keeps other levels and games", async (level, total, right, celebration, bests) => {
    const entry = { bestScore: 5, explorerBest: 6, paleontologistBest: null, roundsPlayed: 3 };
    const storage = recordAt(level, entry);
    storage.items.set(PROGRESS_KEY, sortingRecord(entry, { "compare-dinosaurs": { bestScore: 9, roundsPlayed: 2 } }));
    const { user } = openStored(storage);
    await user.click(homeTile("SORT"));
    await finishWith(user, right);
    expect(screen.getByLabelText("SCORE").textContent).toBe(`${right}/${total}`);
    expect([document.querySelectorAll(".result-stars .star").length, document.querySelectorAll(".result-stars .star-won").length]).toEqual([total, right]);
    expect(celebrations()).toEqual(celebration ? [celebration] : []);
    expect(shownBest()).toBe(String(level === "hatchling" ? bests.bestScore : level === "explorer" ? bests.explorerBest : bests.paleontologistBest));
    expect(storedRecord(storage)?.games).toEqual({ "sort-dinosaurs": { ...bests, roundsPlayed: 4 }, "compare-dinosaurs": { bestScore: 9, roundsPlayed: 2 } });
  });

  it.each(["hatchling", "paleontologist"] as const)("keeps the finished result while choosing %s, then uses that choice on PLAY AGAIN, home and reopen", async (chosen) => {
    const storage = recordAt("explorer", { ...NO_SORTING, explorerBest: 7 });
    const app = openStored(storage);
    await app.user.click(homeTile("SORT"));
    await finishWith(app.user, 5);
    const result = screen.getByRole("main");
    await app.user.click(switchButton(chosen));
    expect(screen.getByRole("main")).toBe(result);
    expect(screen.getByLabelText("SCORE").textContent).toBe("5/8");
    expect(shownBest()).toBe("7");
    expect(onBoard()).toBe(false);
    expect(storedRecord(storage)?.games["sort-dinosaurs"]).toEqual({ ...NO_SORTING, explorerBest: 7, roundsPlayed: 1, levelChoice: { level: chosen, revision: "parent-pick" } });
    await app.user.click(button("PLAY AGAIN"));
    expect(within(tray()).getAllByRole("button")).toHaveLength(LEVEL_CARDS[chosen]);
    await app.user.click(button("HOME"));
    await app.user.click(homeTile("SORT"));
    expect(within(tray()).getAllByRole("button")).toHaveLength(LEVEL_CARDS[chosen]);
    app.unmount();
    const reopened = openStored(storage);
    await reopened.user.click(featuredCard());
    expect(within(tray()).getAllByRole("button")).toHaveLength(LEVEL_CARDS[chosen]);
  });

  it.each([undefined, "hatchling"] as const)("holds an unsavable choice for the visit over a saved choice of %s, then reloads the stored level", async (saved) => {
    const entry = { ...NO_SORTING, ...(saved && { levelChoice: { level: saved, revision: "parent-pick" } }) };
    const original = recordAt("explorer", entry);
    const storage = memoryStorage(Object.fromEntries(original.items), { save: false });
    const before = storage.items.get(PROGRESS_KEY);
    const app = openStored(storage);
    await app.user.click(homeTile("SORT"));
    await finishShownBoard(app.user);
    await app.user.click(switchButton("paleontologist"));
    await app.user.click(button("HOME"));
    await app.user.click(homeTile("SORT"));
    expect(within(tray()).getAllByRole("button")).toHaveLength(10);
    expect(storage.items.get(PROGRESS_KEY)).toBe(before);
    app.unmount();
    const reopened = openStored(storage);
    await reopened.user.click(homeTile("SORT"));
    expect(within(tray()).getAllByRole("button")).toHaveLength(saved ? 6 : 8);
  });

  it("holds a choice even when progress cannot be read, without comparing or overwriting it", async () => {
    const storage = memoryStorage({}, { read: false });
    const { user } = openStored(storage);
    await user.click(homeTile("SORT"));
    await finishWith(user, 5);
    await user.click(switchButton("paleontologist"));
    await user.click(button("PLAY AGAIN"));
    expect(within(tray()).getAllByRole("button")).toHaveLength(10);
    await finishWith(user, 7);
    expect([shownBest(), celebrations(), storage.items.size]).toEqual([undefined, [], 0]);
  });

  it("drops the child's choice when a parent changes the age level, including a change back", async () => {
    const storage = recordAt("explorer", { ...NO_SORTING, levelChoice: { level: "hatchling", revision: "parent-pick" } });
    const { user } = openStored(storage);
    await user.click(homeTile("SORT"));
    expect(within(tray()).getAllByRole("button")).toHaveLength(6);
    await user.click(button("HOME"));
    await chooseFrom(user, TEXTS.en.ageLevelMenu, `${TEXTS.en.ageLevels.paleontologist.name} ${TEXTS.en.ageLevels.paleontologist.age}`);
    await user.click(homeTile("SORT"));
    expect(within(tray()).getAllByRole("button")).toHaveLength(10);
    await user.click(button("HOME"));
    await chooseFrom(user, TEXTS.en.ageLevelMenu, `${TEXTS.en.ageLevels.explorer.name} ${TEXTS.en.ageLevels.explorer.age}`);
    await user.click(featuredCard());
    expect(within(tray()).getAllByRole("button")).toHaveLength(8);
  });

  it.each(AGE_LEVELS)("shows %s's best on both home cards when it is the setting or the child's choice", async (level) => {
    const bests = { bestScore: 5, explorerBest: 7, paleontologistBest: 9, roundsPlayed: 3 };
    for (const byChoice of [false, true]) {
      const storage = recordAt(byChoice ? "explorer" : level, { ...bests, ...(byChoice && { levelChoice: { level, revision: "parent-pick" } }) });
      const { unmount } = openStored(storage);
      const best = String({ hatchling: 5, explorer: 7, paleontologist: 9 }[level]);
      expect(homeTile("SORT").querySelector(".sort-tile-best")?.textContent).toBe(best);
      expect(featuredCard().querySelector(".featured-card-badge")?.textContent).toContain(best);
      unmount();
    }
  });

  it("counts finished rounds across levels while retaining all three bests", async () => {
    const storage = recordAt("hatchling");
    const { user } = openStored(storage);
    await user.click(homeTile("SORT"));
    for (const [at, level] of AGE_LEVELS.entries()) {
      if (at > 0) {
        await user.click(switchButton(level));
        await user.click(button("PLAY AGAIN"));
      }
      await finishWith(user, at + 1);
      expect(celebrations()).toEqual(["FIRST BEST SCORE"]);
      expect(localSortingProgress(() => storage).load()?.progress.roundsPlayed).toBe(at + 1);
    }
    expect(localSortingProgress(() => storage).load()).toEqual({
      progress: { bestScore: 1, explorerBest: 2, paleontologistBest: 3, roundsPlayed: 3 },
      levelChoice: { level: "paleontologist", revision: "parent-pick" }
    });
  });

  it("reads a pre-level best as Hatchling's, retains its rounds, and starts at the age level without a choice", async () => {
    const storage = recordAt("hatchling", { bestScore: 5, roundsPlayed: 3 });
    const { user } = openStored(storage);
    await user.click(homeTile("SORT"));
    await finishWith(user, 5);
    expect(celebrations()).toEqual([]);
    expect(shownBest()).toBe("5");
    expect(storedRecord(storage)?.games["sort-dinosaurs"]).toEqual({ ...NO_SORTING, bestScore: 5, roundsPlayed: 4 });
  });
});
