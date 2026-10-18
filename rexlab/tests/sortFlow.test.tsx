import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, MUSEUM_SETTLE } from "../src/App.tsx";
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
  loadedPictures,
  manualOrientation,
  manualPictures,
  memoryStorage,
  seededRandom,
  symbolOf,
  words,
  type ManualPictures,
  type MemoryStorage,
  homeTile
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
      {...lightDevice()}
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
  if (start === "result") {
    await app.user.click(button("SORT"));
    act(() => pictures.loading().forEach(pictures.finish));
    await finishShownBoard(app.user);
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

// Each screen the child may open from the home page while a board's
// pictures load, and whether it is on screen.
const ELSEWHERE = [
  ["CARE", () => screen.queryByRole("button", { name: "NEW VISITOR" }) !== null],
  ["ALL DINOSAURS", () => screen.queryByRole("group", { name: "ALL DINOSAURS" }) !== null],
  ["FIND THE PAIR", () => screen.queryByRole("heading", { name: "FIND THE PAIR" }) !== null],
  ["MUSEUM", () => screen.queryByRole("group", { name: "STANDS" }) !== null]
] as const;

// Each way a board's wait for its pictures ends.
const ENDS = [
  ["its pictures load", (pictures: ManualPictures, asked: readonly string[]) => asked.forEach(pictures.finish)],
  ["its second runs out", (pictures: ManualPictures) => pictures.fire(1000)]
] as const;

describe("a new board", () => {
  it.each(STARTS.flatMap((start) => TAPS.map((taps) => [...start, ...taps] as const)))(
    "waits on %s for its six pictures after %s is tapped %s, then starts one board with them",
    async (_, start, name, stillThere, __, tap) => {
      const pictures = manualPictures();
      const { user } = await openOn(start, pictures);

      await tap(user, button(name));

      const asked = pictures.loading();
      expect(asked).toHaveLength(6);
      expect(pictures.timers()).toEqual([1000]);
      act(() => asked.slice(0, 5).forEach(pictures.finish));
      expect([stillThere(), onBoard()]).toEqual([true, false]);

      act(() => pictures.finish(asked[5] ?? ""));

      expect(onBoard()).toBe(true);
      expect(picturesShown()).toEqual(asked);
      expect([pictures.loading(), pictures.timers()]).toEqual([[], []]);
    }
  );

  it.each(STARTS)("starts on %s after a second when its pictures are slow, and not again when they arrive", async (_, start, name) => {
    const pictures = manualPictures();
    const { user } = await openOn(start, pictures);
    await user.click(button(name));
    const asked = pictures.loading();

    act(() => pictures.fire(1000));

    expect(onBoard()).toBe(true);
    expect(picturesShown()).toEqual(asked);
    const first = document.body.innerHTML;
    act(() => asked.forEach(pictures.finish));
    expect(document.body.innerHTML).toBe(first);
  });

  it("is not shown when the child goes home while its pictures load, and SORT starts another at once", async () => {
    const pictures = manualPictures();
    const { user } = await openOn("result", pictures);
    await user.click(button("PLAY AGAIN"));
    const left = pictures.loading();
    await user.click(button("HOME"));

    await user.click(button("SORT"));

    const asked = pictures.loading().slice(left.length);
    expect(asked).toHaveLength(6);
    act(() => asked.forEach(pictures.finish));
    expect(picturesShown()).toEqual(asked);
    const shown = document.body.innerHTML;
    act(() => {
      left.forEach(pictures.finish);
      pictures.fire(1000);
    });
    expect(document.body.innerHTML).toBe(shown);
  });

  it.each(ELSEWHERE.flatMap(([name, there]) => ENDS.map(([end, ending]) => [name, end, there, ending] as const)))(
    "is not shown over %s, tapped while its pictures load, when %s, and SORT starts another later",
    async (name, _, there, ending) => {
      const pictures = manualPictures();
      const { user } = await openOn("home", pictures);
      await user.click(button("SORT"));
      const asked = pictures.loading();
      await user.click(button(name));

      act(() => ending(pictures, asked));

      expect([there(), onBoard()]).toEqual([true, false]);
      // The museum takes taps once it has settled.
      act(() => pictures.fire(MUSEUM_SETTLE));
      await user.click(button("HOME"));
      await user.click(button("SORT"));
      act(() => pictures.loading().forEach(pictures.finish));
      expect(onBoard()).toBe(true);
    }
  );

  it("is not shown when the child taps COMPARE while its pictures load, and the question opens once its own pictures do", async () => {
    const pictures = manualPictures();
    const { user } = await openOn("home", pictures);
    await user.click(button("SORT"));
    const asked = pictures.loading();
    await user.click(homeTile("COMPARE"));
    // The question may share a dinosaur with the board, whose picture then
    // loads with the board's; it still waits on one picture of its own.
    const question = pictures.loading().slice(asked.length);
    expect([question.length, question.some((url) => !asked.includes(url))]).toEqual([2, true]);

    act(() => asked.forEach(pictures.finish));

    expect([onHomePage(), onBoard()]).toEqual([true, false]);
    act(() => question.forEach(pictures.finish));
    expect([screen.getByRole("heading").textContent, onBoard()]).toEqual([expect.stringMatching(/^WHO IS (HEAVIER|TALLER)\?$/), false]);
  });

  it("is not shown on the home page when the child goes home while its pictures load", async () => {
    const pictures = manualPictures();
    const { user } = await openOn("result", pictures);
    await user.click(button("PLAY AGAIN"));
    await user.click(button("HOME"));

    act(() => pictures.loading().forEach(pictures.finish));

    expect([onHomePage(), onBoard()]).toEqual([true, false]);
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
