import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { PICTURE_LIMIT } from "../src/Picture.tsx";
import { PROGRESS_KEY, localProgress, localSortingProgress } from "../src/localProgress.ts";
import type { Random } from "../src/sorting/index.ts";
import { basketsShown, sortByTrying, storedRecord, tray } from "./sorting.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_SORTABLES,
  emptyCare,
  emptyPairs,
  englishDevice,
  emptySkeletons,
  fakeBodyPicture,
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
  type MemoryStorage,
  unsetAgeLevel
} from "./support.ts";

// The app on its home page, the sorting game's progress kept in
// `storage`.
function openApp({
  storage = memoryStorage(),
  random = seededRandom(11),
  pictures = loadedPictures()
}: {
  storage?: MemoryStorage;
  random?: Random;
  pictures?: ReturnType<typeof loadedPictures>;
} = {}) {
  const view = render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={random}
      orientation={manualOrientation("landscape")}
      progress={localProgress(() => storage)}
      {...englishDevice()}
      {...lightDevice()} {...unsetAgeLevel()}
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
    expect(storedRecord(storage)?.games["sort-dinosaurs"]).toEqual({ bestScore: Number(right), roundsPlayed: 1 });

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
async function openOn(start: "home" | "result", pictures: ManualPictures) {
  const app = openApp({ pictures });
  loadShownPictures(pictures);
  if (start === "result") {
    await app.user.click(button("SORT"));
    act(() => pictures.loading().forEach(pictures.finish));
    await finishShownBoard(app.user);
    loadShownPictures(pictures);
  }
  return app;
}

const STARTS = [
  ["the home page", "home", "SORT", onHomePage],
  ["the result", "result", "PLAY AGAIN", onResult]
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
    async (_, start, name, __, ___, tap) => {
      const pictures = manualPictures();
      const { user } = await openOn(start, pictures);

      await tap(user, button(name));

      // A dinosaur of the board before has its picture loaded already.
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
