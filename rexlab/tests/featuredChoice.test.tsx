import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { calendarDay, chooseFeatured, weightsOf, type DayChoice, type FeaturedRecord, type FeaturedStore } from "../src/featured.ts";
import { HOME_GAMES, type HomeGame } from "../src/HomePage.tsx";
import { memoryFeatured } from "../src/memoryFeatured.ts";
import { HOME_GAMES as TILES } from "./homePage.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuredCard,
  lightDevice,
  loadedPictures,
  manualOrientation,
  tilesRow
} from "./support.ts";

// The start counts of the feature's draw: COMPARE 9, ALL DINOSAURS 4,
// CARE 2, SORT 5, FIND THE PAIR 3 and SKELETONS 2.
const STARTS: Record<HomeGame, number> = { compare: 9, catalogue: 4, care: 2, sort: 5, pairs: 3, skeletons: 2 };

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

const record = (starts: Record<string, number>, featured?: DayChoice): FeaturedRecord => ({ starts, featured });

// The game each draw from 0 up to 1, in steps of a thousandth, falls to.
function shares<Game extends string>(games: readonly Game[], starts: Record<string, number>, featured?: DayChoice) {
  const count = new Map<Game, number>();
  for (let step = 0; step < 1000; step++) {
    const game = chooseFeatured(games, { store: memoryFeatured(record(starts, featured)), random: () => step / 1000, today: TODAY });
    count.set(game, (count.get(game) ?? 0) + 1);
  }
  return Object.fromEntries(count);
}

describe("choosing the featured game", () => {
  it("gives the games started least a weight of 2 and every other game 1: CARE and SKELETONS 2 chances in 8 each", () => {
    const weights = weightsOf(HOME_GAMES.map((game) => STARTS[game]));

    expect(weights).toEqual([1, 1, 2, 1, 1, 2]);
    expect(shares(HOME_GAMES, STARTS)).toEqual({ compare: 125, catalogue: 125, care: 250, sort: 125, pairs: 125, skeletons: 250 });
  });

  it.each([
    [0, "compare"],
    [0.124, "compare"],
    [0.125, "catalogue"],
    [0.249, "catalogue"],
    [0.25, "care"],
    [0.499, "care"],
    [0.5, "sort"],
    [0.624, "sort"],
    [0.625, "pairs"],
    [0.749, "pairs"],
    [0.75, "skeletons"],
    [0.999, "skeletons"]
  ] as const)("maps the draw %s to %s, in tile order", (draw, game) => {
    expect(chooseFeatured(HOME_GAMES, { store: memoryFeatured(record(STARTS)), random: () => draw, today: TODAY })).toBe(game);
  });

  it.each([
    ["none started", [0, 0, 0, 0, 0, 0], [2, 2, 2, 2, 2, 2]],
    ["all started 5 times", [5, 5, 5, 5, 5, 5], [2, 2, 2, 2, 2, 2]],
    ["3, 0, 0, 7, 1, 4", [3, 0, 0, 7, 1, 4], [1, 2, 2, 1, 1, 1]],
    ["1, 2, 3, 4, 5, 6", [1, 2, 3, 4, 5, 6], [2, 1, 1, 1, 1, 1]]
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
    expect(shares(HOME_GAMES, STARTS, { day: YESTERDAY, game: "care" })).toEqual(shares(HOME_GAMES, STARTS));
  });

  it("always features the only game", () => {
    expect(shares(["compare"], {})).toEqual({ compare: 1000 });
    expect(shares(["compare"], { compare: 12 }, { day: YESTERDAY, game: "care" })).toEqual({ compare: 1000 });
  });

  it("saves the game drawn with today's date", () => {
    const store = memoryFeatured(record(STARTS));

    expect(chooseFeatured(HOME_GAMES, { store, random: () => 0.25, today: TODAY })).toBe("care");
    expect(store.load()).toEqual(record(STARTS, { day: TODAY, game: "care" }));
  });

  it("keeps today's game, drawing nothing and saving nothing, when a new game has joined", () => {
    const saved: unknown[] = [];
    const store: FeaturedStore = { load: () => record({ compare: 1, catalogue: 1, care: 1, sort: 1, pairs: 1, skeletons: 1 }, { day: TODAY, game: "care" }), saveFeatured: (choice) => saved.push(choice) };
    const { asked, random } = drawing(0.99);

    expect(chooseFeatured([...HOME_GAMES, "fossils"], { store, random, today: TODAY })).toBe("care");
    expect(asked.times).toBe(0);
    expect(saved).toEqual([]);
  });

  it("gives a new game, never started, a weight of 2 from the next day", () => {
    const starts: Record<string, number> = { compare: 1, catalogue: 1, care: 1, sort: 1, pairs: 1, skeletons: 1 };
    const games = [...HOME_GAMES, "fossils"];

    expect(weightsOf(games.map((game) => starts[game] ?? 0))).toEqual([1, 1, 1, 1, 1, 1, 2]);
    expect(shares(games, starts, { day: YESTERDAY, game: "care" })).toEqual({ compare: 125, catalogue: 125, care: 125, sort: 125, pairs: 125, skeletons: 125, fossils: 250 });
  });

  it.each([
    ["earlier", YESTERDAY],
    ["later", TOMORROW],
    ["long ago", "2025-01-02"]
  ])("chooses afresh for today, and saves it, when the saved game is dated %s", (_when, day) => {
    const store = memoryFeatured(record(STARTS, { day, game: "skeletons" }));

    expect(chooseFeatured(HOME_GAMES, { store, random: () => 0, today: TODAY })).toBe("compare");
    expect(store.load().featured).toEqual({ day: TODAY, game: "compare" });
  });

  it("chooses afresh when today's saved game is no longer offered", () => {
    const store = memoryFeatured(record(STARTS, { day: TODAY, game: "fossils" }));

    expect(chooseFeatured(HOME_GAMES, { store, random: () => 0.75, today: TODAY })).toBe("skeletons");
    expect(store.load().featured).toEqual({ day: TODAY, game: "skeletons" });
  });

  it("takes the games in their tiles' order on the home page", () => {
    expect(HOME_GAMES).toEqual(TILES.map(([game]) => game));
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

// The app opened with `store` as the featured record, its clock reading
// whatever `clock.time` holds when asked and its random source giving
// `draw`.
function openApp(store: FeaturedStore, clock: { time: Date }, draw = 0) {
  return render(
    <App
      now={() => clock.time}
      featuredStore={store}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={() => draw}
      orientation={manualOrientation("landscape")}
      progress={emptyProgress()}
      {...englishDevice()}
      {...lightDevice()}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...loadedPictures()}
    />
  );
}

const featuredGame = () => featuredCard().dataset.game;

describe("the featured game in the app", () => {
  it("is drawn at start from the start counts with the random source", () => {
    const store = memoryFeatured(record(STARTS));

    openApp(store, { time: new Date(2026, 9, 18, 9, 0) }, 0.25);

    expect(featuredGame()).toBe("care");
    expect(store.load().featured).toEqual({ day: TODAY, game: "care" });
  });

  it("stays on a reload at 23:59 and is chosen for the new day on a reload at 00:00", () => {
    const store = memoryFeatured(record(STARTS, { day: TODAY, game: "skeletons" }));
    const clock = { time: new Date(2026, 9, 18, 23, 59) };

    openApp(store, clock, 0).unmount();
    openApp(store, clock, 0).unmount();
    expect(store.load().featured).toEqual({ day: TODAY, game: "skeletons" });

    clock.time = new Date(2026, 9, 19, 0, 0);
    openApp(store, clock, 0);

    expect(featuredGame()).toBe("compare");
    expect(store.load().featured).toEqual({ day: TOMORROW, game: "compare" });
  });

  it("never changes while the app is open, past midnight, until the app is opened again", async () => {
    const store = memoryFeatured(record(STARTS, { day: TODAY, game: "skeletons" }));
    const clock = { time: new Date(2026, 9, 18, 23, 59) };
    const view = openApp(store, clock, 0);
    const user = userEvent.setup();
    expect(featuredGame()).toBe("skeletons");

    clock.time = new Date(2026, 9, 19, 8, 0);
    await user.click(within(tilesRow()).getByRole("button", { name: "ALL DINOSAURS" }));
    await user.click(screen.getByRole("button", { name: "HOME" }));

    expect(featuredGame()).toBe("skeletons");
    expect(store.load().featured).toEqual({ day: TODAY, game: "skeletons" });

    view.unmount();
    openApp(store, clock, 0);

    expect(featuredGame()).toBe("compare");
    expect(store.load().featured).toEqual({ day: TOMORROW, game: "compare" });
  });
});
