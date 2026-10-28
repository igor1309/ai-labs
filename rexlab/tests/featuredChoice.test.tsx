import { emptyLabyrinth } from "./support.ts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { calendarDay, chooseFeatured, weightsOf, type FeaturedHistory, type FeaturedStore, type Featuring } from "../src/featured.ts";
import { HOME_GAMES, type HomeGame } from "../src/HomePage.tsx";
import { HOME_GAMES as TILES } from "./homePage.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  countedStarts,
  englishDevice,
  fakeBodyPicture,
  featuredCard,
  featuredSpy,
  lightDevice,
  loadedPictures,
  manualViewport,
  pageAtRest,
  tilesRow,
  unsetAgeLevel
} from "./support.ts";

// The start counts of the feature's draw: COMPARE 9, ANCIENT REPTILES 4,
// FIND THE PAIR 3, SKELETONS 2, DIG 2, SAND WRITING 2, SORT 5, CARE 2 and LABYRINTH 2.
const STARTS: Record<HomeGame, number> = { compare: 9, catalogue: 4, pairs: 3, skeletons: 2, dig: 2, sandWriting: 2, sort: 5, care: 2, labyrinth: 2, picturePuzzle: 2 };

const TODAY = "2026-10-18";
const YESTERDAY = "2026-10-17";
const TOMORROW = "2026-10-19";

// A random source that gives `draw`, and how many times it was asked.
function drawing(draw: number) {
  const asked = { times: 0 };
  return {
    asked,
    random: () => {
      asked.times++;
      return draw;
    }
  };
}

const record = (starts: Record<string, number>, lastFeatured?: Featuring): FeaturedHistory => ({ timesStarted: new Map(Object.entries(starts)), lastFeatured });

// The game each draw from 0 up to 1, in steps of a thousandth, falls to.
function shares<Game extends string>(games: readonly Game[], starts: Record<string, number>, lastFeatured?: Featuring) {
  const count = new Map<Game, number>();
  for (let step = 0; step < 1000; step++) {
    const game = chooseFeatured(games, { store: featuredSpy(record(starts, lastFeatured)), random: () => step / 1000, today: TODAY });
    count.set(game, (count.get(game) ?? 0) + 1);
  }
  return Object.fromEntries(count);
}

describe("choosing the featured game", () => {
  it("gives the games started least a weight of 2 and every other game 1: CARE, SKELETONS, DIG, SAND WRITING and LABYRINTH 2 chances in 16 each", () => {
    const weights = weightsOf(HOME_GAMES.map((game) => STARTS[game]));

    expect(weights).toEqual([1, 1, 1, 2, 2, 1, 2, 2, 2, 2]);
    expect(shares(HOME_GAMES, STARTS)).toEqual({ compare: 63, catalogue: 62, pairs: 63, skeletons: 125, dig: 125, sort: 62, care: 125, sandWriting: 125, labyrinth: 125, picturePuzzle: 125 });
  });

  it.each([
    [0, "compare"], [1 / 16 - 0.001, "compare"], [1 / 16, "catalogue"], [2 / 16 - 0.001, "catalogue"],
    [2 / 16, "pairs"], [3 / 16 - 0.001, "pairs"], [3 / 16, "skeletons"], [5 / 16 - 0.001, "skeletons"],
    [5 / 16, "dig"], [7 / 16 - 0.001, "dig"], [7 / 16, "sort"], [8 / 16 - 0.001, "sort"],
    [8 / 16, "care"], [10 / 16 - 0.001, "care"], [10 / 16, "sandWriting"], [12 / 16 - 0.001, "sandWriting"], [12 / 16, "labyrinth"], [14 / 16 - 0.001, "labyrinth"], [14 / 16, "picturePuzzle"], [0.999, "picturePuzzle"]
  ] as const)("maps the draw %s to %s, in tile order", (draw, game) => {
    expect(chooseFeatured(HOME_GAMES, { store: featuredSpy(record(STARTS)), random: () => draw, today: TODAY })).toBe(game);
  });

  it.each([
    ["none started", [0, 0, 0, 0, 0, 0, 0], [2, 2, 2, 2, 2, 2, 2]],
    ["all started 5 times", [5, 5, 5, 5, 5, 5, 5], [2, 2, 2, 2, 2, 2, 2]],
    ["3, 0, 0, 7, 1, 4, 2", [3, 0, 0, 7, 1, 4, 2], [1, 2, 2, 1, 1, 1, 1]],
    ["1, 2, 3, 4, 5, 6, 7", [1, 2, 3, 4, 5, 6, 7], [2, 1, 1, 1, 1, 1, 1]]
  ])("lets ties share the lowest count: %s", (_name, counts, weights) => {
    expect(weightsOf(counts)).toEqual(weights);
  });

  it("counts a game missing from the start counts as never started", () => {
    expect(shares(HOME_GAMES, {})).toEqual(shares(HOME_GAMES, { compare: 0, catalogue: 0, care: 0, sort: 0, pairs: 0, skeletons: 0 }));
    expect(shares(HOME_GAMES, { compare: 1, catalogue: 1, care: 1, sort: 1, pairs: 1 })).toEqual(
      shares(HOME_GAMES, { compare: 1, catalogue: 1, care: 1, sort: 1, pairs: 1, skeletons: 0 })
    );
  });

  it("leaves the counts of games no longer offered out of the choice", () => {
    expect(shares(HOME_GAMES, { ...STARTS, gone: 0 })).toEqual(shares(HOME_GAMES, STARTS));
  });

  it("gives yesterday's featured game its ordinary weight", () => {
    expect(shares(HOME_GAMES, STARTS, { game: "care", on: YESTERDAY })).toEqual(shares(HOME_GAMES, STARTS));
  });

  it("always features the only game", () => {
    expect(shares(["compare"], {})).toEqual({ compare: 1000 });
    expect(shares(["compare"], { compare: 12 }, { game: "care", on: YESTERDAY })).toEqual({ compare: 1000 });
  });

  it("saves the game drawn with today's date", () => {
    const store = featuredSpy(record(STARTS));

    expect(chooseFeatured(HOME_GAMES, { store, random: () => 0.55, today: TODAY })).toBe("care");
    expect(store.history()).toEqual(record(STARTS, { game: "care", on: TODAY }));
  });

  it("keeps today's game, drawing nothing and saving nothing, when a new game has joined", () => {
    const saved: unknown[] = [];
    const store: FeaturedStore = { history: () => record({ compare: 1, catalogue: 1, care: 1, sort: 1, pairs: 1, skeletons: 1 }, { game: "care", on: TODAY }), feature: (featuring) => saved.push(featuring) };
    const { asked, random } = drawing(0.99);

    expect(chooseFeatured(HOME_GAMES, { store, random, today: TODAY })).toBe("care");
    expect(asked.times).toBe(0);
    expect(saved).toEqual([]);
  });

  it("gives new games, never started, a weight of 2 from the next day", () => {
    const starts: Record<string, number> = { compare: 1, catalogue: 1, care: 1, sort: 1, pairs: 1, skeletons: 1 };
    const games = HOME_GAMES;

    expect(weightsOf(games.map((game) => starts[game] ?? 0))).toEqual([1, 1, 1, 1, 2, 1, 1, 2, 2, 2]);
    expect(shares(games, starts, { game: "care", on: YESTERDAY })).toEqual({ compare: 72, catalogue: 71, pairs: 72, skeletons: 71, dig: 143, sort: 71, care: 72, sandWriting: 143, labyrinth: 143, picturePuzzle: 142 });
  });

  it.each([
    ["earlier", YESTERDAY],
    ["later", TOMORROW],
    ["long ago", "2025-01-02"]
  ])("chooses afresh for today, and saves it, when the saved game is dated %s", (_when, day) => {
    const store = featuredSpy(record(STARTS, { game: "skeletons", on: day }));

    expect(chooseFeatured(HOME_GAMES, { store, random: () => 0, today: TODAY })).toBe("compare");
    expect(store.history().lastFeatured).toEqual({ game: "compare", on: TODAY });
  });

  it("chooses afresh when today's saved game is no longer offered", () => {
    const store = featuredSpy(record(STARTS, { game: "fossils", on: TODAY }));

    expect(chooseFeatured(HOME_GAMES, { store, random: () => 0.25, today: TODAY })).toBe("skeletons");
    expect(store.history().lastFeatured).toEqual({ game: "skeletons", on: TODAY });
  });

  it("takes the games in their tiles' order on the home page", () => {
    expect(HOME_GAMES).toEqual([...TILES.map(([game]) => game), "picturePuzzle"]);
  });
});

describe("a calendar day", () => {
  it.each([
    [new Date(2026, 9, 18, 0, 0), TODAY],
    [new Date(2026, 9, 18, 23, 59, 59, 999), TODAY],
    [new Date(2026, 9, 19, 0, 0), TOMORROW],
    [new Date(2026, 0, 1, 12, 0), "2026-01-01"],
    [new Date(2025, 11, 31, 23, 59), "2025-12-31"]
  ])("of %s on the device's clock is %s", (time, day) => {
    expect(calendarDay(time)).toBe(day);
  });
});

// The app opened with `store` as the featured history, its clock reading
// whatever `clock.time` holds when asked and its random source giving
// `draw`.
function openApp(store: FeaturedStore, clock: { time: Date }, draw = 0) {
  return render(
    <App {...emptyLabyrinth()}
      now={() => clock.time}
      featuredStore={store}
      startCounter={countedStarts().startCounter}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={() => draw}
      portraitLayouts={{}}
      viewport={manualViewport("landscape")}
      progress={emptyProgress()}
      {...englishDevice()}
      {...lightDevice()} {...unsetAgeLevel()}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      {...pageAtRest()}
      {...loadedPictures()}
    />
  );
}

const featuredGame = () => featuredCard().dataset.game;

describe("the featured game in the app", () => {
  it("is drawn at start from the start counts with the random source", () => {
    const store = featuredSpy(record(STARTS));

    openApp(store, { time: new Date(2026, 9, 18, 9, 0) }, 0.65);

    expect(featuredGame()).toBe("care");
    expect(store.history().lastFeatured).toEqual({ game: "care", on: TODAY });
  });

  it("stays on a reload at 23:59 and is chosen for the new day on a reload at 00:00", () => {
    const store = featuredSpy(record(STARTS, { game: "skeletons", on: TODAY }));
    const clock = { time: new Date(2026, 9, 18, 23, 59) };

    openApp(store, clock, 0).unmount();
    openApp(store, clock, 0).unmount();
    expect(store.history().lastFeatured).toEqual({ game: "skeletons", on: TODAY });

    clock.time = new Date(2026, 9, 19, 0, 0);
    openApp(store, clock, 0);

    expect(featuredGame()).toBe("compare");
    expect(store.history().lastFeatured).toEqual({ game: "compare", on: TOMORROW });
  });

  it("never changes while the app is open, past midnight, until the app is opened again", async () => {
    const store = featuredSpy(record(STARTS, { game: "skeletons", on: TODAY }));
    const clock = { time: new Date(2026, 9, 18, 23, 59) };
    const view = openApp(store, clock, 0);
    const user = userEvent.setup({ delay: null });
    expect(featuredGame()).toBe("skeletons");

    clock.time = new Date(2026, 9, 19, 8, 0);
    await user.click(within(tilesRow()).getByRole("button", { name: "ANCIENT REPTILES" }));
    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(featuredGame()).toBe("skeletons");
    expect(store.history().lastFeatured).toEqual({ game: "skeletons", on: TODAY });

    view.unmount();
    openApp(store, clock, 0);

    expect(featuredGame()).toBe("compare");
    expect(store.history().lastFeatured).toEqual({ game: "compare", on: TOMORROW });
  });
});
