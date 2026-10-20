import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, type AppProps } from "../src/App.tsx";
import { HOME_GAMES, type HomeGame } from "../src/HomePage.tsx";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localCareProgress, localFeatured, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import { endWave, playBoard } from "./pairsApp.tsx";
import { sortByTrying } from "./sorting.tsx";
import { filterTaps, tapAt } from "./taps.ts";
import {
  emptyDig,
  unreadVersion,
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_PALS,
  SHIPPED_SKELETONS,
  SHIPPED_SORTABLES,
  SHIPPED_VISITORS,
  countedStarts,
  fakeBodyPicture,
  fakeItemPicture,
  fakeSkeletonPicture,
  featuredCard,
  gameDoor,
  manualAppearance,
  manualViewport,
  loadShownPictures,
  manualPictures,
  manualTimers,
  manualVisibility,
  memoryStorage,
  type ManualTimers,
  type MemoryStorage,
  unsetAgeLevel,
  type PictureClock
} from "./support.ts";

// home-featured-progress.feature

const NOW = new Date(2026, 9, 18, 9, 30);
const TODAY = { day: "2026-10-18", game: "skeletons" };

// Stored progress: today's game already chosen, the starts given, and the
// games' entries given.
const progressWith = (starts: Record<string, number> = {}, games: Record<string, unknown> = {}) =>
  JSON.stringify({ schemaVersion: 1, games: { ...games, "home-featured": { starts, featured: TODAY } } });

// The app as a browser opens it: progress, start counts and the featured
// game all kept in `storage`. Unless `clock` is given, pictures load the
// moment they are asked for and timers fire only when the test says.
function openApp<C extends PictureClock = ManualTimers>(
  storage: MemoryStorage = memoryStorage({ [PROGRESS_KEY]: progressWith() }),
  { random = () => 0, clock = manualTimers() as unknown as C, startCounter }: { random?: () => number; clock?: C; startCounter?: AppProps["startCounter"] } = {}
) {
  const featured = localFeatured(() => storage, HOME_GAMES);
  render(
    <App
      now={() => NOW}
      featuredStore={featured}
      startCounter={startCounter ?? featured}
      nameVersion={unreadVersion}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={random}
      portraitLayouts={{}}
      viewport={manualViewport("landscape")}
      pageVisibility={manualVisibility("visible")}
      progress={localProgress(() => storage)}
      deviceLanguage="en-GB"
      languageStore={localLanguage(() => storage)}
      appearance={manualAppearance("light")}
      themeStore={localTheme(() => storage)}
      {...unsetAgeLevel()}
      visitors={SHIPPED_VISITORS}
      careProgress={localCareProgress(() => storage)}
      itemPicture={fakeItemPicture}
      sortables={SHIPPED_SORTABLES}
      sortingProgress={localSortingProgress(() => storage)}
      pals={SHIPPED_PALS}
      pairsProgress={localPairsProgress(() => storage)}
      skeletons={SHIPPED_SKELETONS}
      skeletonPicture={fakeSkeletonPicture}
      {...emptyDig()}
      skeletonProgress={localSkeletonProgress(() => storage)}
      reducedMotion={() => false}
      {...clock}
    />
  );
  return { user: userEvent.setup(), clock, storage, featured };
}

type Opened = ReturnType<typeof openApp<ManualTimers>>;

// The featured record as stored now.
const storedFeatured = (storage: MemoryStorage) => JSON.parse(storage.items.get(PROGRESS_KEY) ?? "null")?.games?.["home-featured"];

const button = (name: string) => screen.getByRole("button", { name });

// The first button in the group named `name`.
function firstIn(name: string): HTMLElement {
  const [first] = within(screen.getByRole("group", { name })).getAllByRole("button");
  if (!first) throw new Error(`No button in ${name}`);
  return first;
}

// Answers every question of a round with its first card and sees the
// result.
async function finishRound(user: UserEvent) {
  for (let number = 1; number <= 10; number++) {
    await user.click(firstIn("DINOSAURS"));
    await user.click(button(number < 10 ? "NEXT" : "SEE RESULT"));
  }
}

// Each way to start a game, the game, and the starts it counts on the
// way: one from the home page and one more from PLAY AGAIN.
const STARTS: Array<[action: string, game: string, starts: number, act: (opened: Opened) => Promise<void>]> = [
  ["a quiz round starts from the home page", "compare", 1, ({ user }) => user.click(gameDoor("COMPARE"))],
  [
    "a quiz round starts from the home page, then from PLAY AGAIN",
    "compare",
    2,
    async ({ user }) => {
      await user.click(gameDoor("COMPARE"));
      await finishRound(user);
      await user.click(button("PLAY AGAIN"));
    }
  ],
  ["the dinosaur list opens from the home page", "catalogue", 1, ({ user }) => user.click(gameDoor("ALL DINOSAURS"))],
  [
    "a care visit starts from NEW VISITOR",
    "care",
    1,
    async ({ user }) => {
      await user.click(gameDoor("CARE"));
      await user.click(button("NEW VISITOR"));
    }
  ],
  [
    "a friend is called back",
    "care",
    1,
    async ({ user }) => {
      await user.click(gameDoor("CARE"));
      await user.click(button("FRIENDS"));
      await user.click(within(screen.getByRole("group", { name: "FRIENDS" })).getByRole("button"));
    }
  ],
  ["a sorting round starts from its card", "sort", 1, ({ user }) => user.click(gameDoor("SORT"))],
  [
    "a sorting round starts from its card, then from PLAY AGAIN",
    "sort",
    2,
    async ({ user }) => {
      await user.click(gameDoor("SORT"));
      await sortByTrying(user);
      await user.click(button("SEE RESULT"));
      await user.click(button("PLAY AGAIN"));
    }
  ],
  [
    "a board is dealt from PLAY",
    "pairs",
    1,
    async ({ user }) => {
      await user.click(gameDoor("FIND THE PAIR"));
      await user.click(button("PLAY"));
    }
  ],
  [
    "a board is dealt from PLAY, then from PLAY AGAIN",
    "pairs",
    2,
    async ({ user, clock }) => {
      await user.click(gameDoor("FIND THE PAIR"));
      await user.click(button("PLAY"));
      await playBoard(user, clock);
      endWave(clock);
      await user.click(button("PLAY AGAIN"));
    }
  ],
  [
    "a skeleton puzzle starts",
    "skeletons",
    1,
    async ({ user }) => {
      await user.click(gameDoor("SKELETONS"));
      await user.click(firstIn("DINOSAURS"));
    }
  ],
  [
    "a skeleton is rebuilt",
    "skeletons",
    1,
    async ({ user }) => {
      await user.click(gameDoor("SKELETONS"));
      await user.click(button("MUSEUM"));
      await user.click(button("REBUILD"));
    }
  ],
  [
    "a skeleton is built from an empty stand in the museum opened on the home page",
    "skeletons",
    1,
    async ({ user, clock }) => {
      await user.click(button("MUSEUM"));
      await user.click(within(screen.getByRole("region", { name: "STEGOSAURUS" })).getByRole("button", { name: "BUILD" }));
    }
  ]
];

// A friend to call back and a skeleton to rebuild, apart from the starts.
const PLAYED = {
  "dinosaur-care": { bestScore: 6, visitsFinished: 1, friends: ["triceratops"] },
  "skeleton-assembly": { bestScore: 1, earned: [SHIPPED_SKELETONS[0]?.id], rebuilding: [] }
};

describe("starting a game", () => {
  it.each(STARTS)("counts a start of its game, and no other's, each time %s", async (_action, game, starts, start) => {
    const each = Object.fromEntries(HOME_GAMES.map((home) => [home, 2]));
    const opened = openApp(memoryStorage({ [PROGRESS_KEY]: progressWith(each, PLAYED) }));

    await start(opened);

    expect(storedFeatured(opened.storage)).toEqual({ starts: { ...each, [game]: 2 + starts }, featured: TODAY });
  });

  it("counts the start of a care visit left unfinished", async () => {
    const { user, storage } = openApp(memoryStorage({ [PROGRESS_KEY]: progressWith({ care: 2 }) }));

    await user.click(gameDoor("CARE"));
    await user.click(button("NEW VISITOR"));
    await user.click(button("HOME"));

    expect(storedFeatured(storage).starts).toEqual({ care: 3 });
  });

  it("counts nothing on the care, find-the-pair and skeleton screens before a game, nor in the museum opened on the home page, nor on a dinosaur's page and back", async () => {
    const { user, storage, clock } = openApp();
    await user.click(gameDoor("ALL DINOSAURS"));
    const opened = storedFeatured(storage);

    await user.click(firstIn("ALL DINOSAURS"));
    await user.click(button("ALL DINOSAURS"));
    await user.click(button("HOME"));
    for (const name of ["CARE", "FIND THE PAIR", "SKELETONS"]) {
      await user.click(gameDoor(name));
      await user.click(button("HOME"));
    }
    await user.click(button("MUSEUM"));
    await user.click(button("HOME"));

    expect(featuredCard()).toBeDefined();
    expect(storedFeatured(storage)).toEqual(opened);
    expect(opened.starts).toEqual({ catalogue: 1 });
  });
});

// A game whose start counts, the buttons on the way to its start, and
// the button that starts it.
type Start = [start: string, game: HomeGame, way: Array<() => HTMLElement>, begin: () => HTMLElement];

// Each game whose start shows at once, its pictures loading, the buttons
// on the way to its start, and the button that starts it.
const AT_ONCE: Start[] = [
  ["a care visit", "care", [() => gameDoor("CARE")], () => button("NEW VISITOR")],
  ["a friend called back", "care", [() => gameDoor("CARE"), () => button("FRIENDS")], () => within(screen.getByRole("group", { name: "FRIENDS" })).getByRole("button")],
  ["a board", "pairs", [() => gameDoor("FIND THE PAIR")], () => button("PLAY")],
  ["a sorting round", "sort", [], () => gameDoor("SORT")],
  ["a skeleton puzzle", "skeletons", [() => gameDoor("SKELETONS")], () => firstIn("DINOSAURS")],
  ["a skeleton rebuilt", "skeletons", [() => gameDoor("SKELETONS"), () => button("MUSEUM")], () => button("REBUILD")],
  ["a sorting round over a board left unfinished", "sort", [() => gameDoor("SORT"), () => button("HOME")], () => gameDoor("SORT")]
];

describe("a start that does not wait for its pictures", () => {
  it.each(AT_ONCE)("counts one start of %s, its game %s, at once for two taps in one moment, and none more as they arrive", async (_start, game, way, begin) => {
    const pictures = manualPictures();
    const { counted, startCounter } = countedStarts();
    const { user } = openApp(memoryStorage({ [PROGRESS_KEY]: progressWith({}, PLAYED) }), { clock: pictures, startCounter });
    loadShownPictures(pictures);
    for (const step of way) await user.click(step());
    const before = counted.length;
    const starting = begin();

    act(() => {
      starting.click();
      starting.click();
    });

    expect(counted.slice(before)).toEqual([game]);
    act(() => pictures.finishAll());
    expect(counted.slice(before)).toEqual([game]);
  });
});

// Each way a sorting round starts, the game featured meanwhile, the steps
// on the way and the button that starts it.
const SORT_STARTS: Array<[start: string, featured: HomeGame, way: (user: UserEvent) => Promise<void>, begin: () => HTMLElement]> = [
  ["SORT", "compare", async () => {}, () => gameDoor("SORT")],
  ["the featured card", "sort", async () => {}, () => featuredCard()],
  [
    "PLAY AGAIN",
    "compare",
    async (user) => {
      await user.click(gameDoor("SORT"));
      await sortByTrying(user);
      await user.click(button("SEE RESULT"));
    },
    () => button("PLAY AGAIN")
  ]
];

describe("a sorting round started twice before React renders", () => {
  it.each(SORT_STARTS)("starts one fresh round from %s, counted once", async (_, game, way, begin) => {
    const pictures = manualPictures();
    const { counted, startCounter } = countedStarts();
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "home-featured": { starts: {}, featured: { ...TODAY, game } } } }) });
    const { user } = openApp(storage, { clock: pictures, startCounter });
    loadShownPictures(pictures);
    await way(user);
    const before = counted.length;
    const starting = begin();

    act(() => {
      starting.click();
      starting.click();
    });

    const cards = within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button");
    expect([counted.slice(before), cards.map((card) => card.getAttribute("aria-pressed"))]).toEqual([["sort"], Array<string>(8).fill("false")]);
  });
});

describe("a browser that cannot keep progress", () => {
  // A draw of 0.1 falls to COMPARE only while every game has the same
  // weight: with COMPARE's 9 starts read, it would fall to ALL DINOSAURS.
  it("offers a featured game when it cannot read progress, every count at 0, and every tile opens its game", async () => {
    const { user, featured } = openApp(memoryStorage({ [PROGRESS_KEY]: progressWith({ compare: 9 }) }, { read: false }), { random: () => 0.1 });

    expect(featuredCard().dataset.game).toBe("compare");
    expect(featured.history()).toEqual({ timesStarted: new Map(), lastFeatured: { game: "compare", on: "2026-10-18" } });
    for (const name of ["COMPARE", "ALL DINOSAURS", "CARE", "SORT", "FIND THE PAIR", "SKELETONS", "DIG"]) {
      await user.click(gameDoor(name));
      expect(document.querySelector(".games-tiles")).toBeNull();
      await user.click(button("HOME"));
    }
  });

  it("keeps the day's game and counts CARE's start for the visit when it cannot save", async () => {
    const raw = progressWith({ care: 1 });
    const { user, storage, featured } = openApp(memoryStorage({ [PROGRESS_KEY]: raw }, { save: false }));

    await user.click(gameDoor("CARE"));
    await user.click(button("NEW VISITOR"));
    await user.click(button("HOME"));

    expect(featuredCard().dataset.game).toBe("skeletons");
    expect(featured.history()).toEqual({ timesStarted: new Map([["care", 2]]), lastFeatured: { game: "skeletons", on: "2026-10-18" } });
    expect(storage.items.get(PROGRESS_KEY)).toBe(raw);
  });
});

// home-featured-card.feature: the large card, tapped twice while its
// game's pictures load, counts one start of its game as the child begins
// it.
describe("the featured card", () => {
  it.each([
    ["compare", async () => {}],
    ["catalogue", async () => {}],
    ["care", (user: UserEvent) => user.click(button("NEW VISITOR"))],
    ["sort", async () => {}],
    ["pairs", (user: UserEvent) => user.click(button("PLAY"))],
    ["skeletons", (user: UserEvent) => user.click(firstIn("DINOSAURS"))]
  ] as const)("counts one start of %s opened by a double tap", async (game, begin) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "home-featured": { starts: {}, featured: { ...TODAY, game } } } }) });
    const pictures = manualPictures();
    const { user } = openApp(storage, { clock: pictures });
    const loadAll = () => {
      for (let loading = pictures.loading(); loading.length > 0; loading = pictures.loading()) act(() => loading.forEach(pictures.finish));
    };

    await user.dblClick(featuredCard());
    loadAll();
    // A welcome or selection screen is not yet a start.
    if (game === "care" || game === "pairs" || game === "skeletons") expect(storedFeatured(storage)?.starts?.[game]).toBeUndefined();
    await begin(user);
    loadAll();

    expect(storedFeatured(storage).starts).toEqual({ [game]: 1 });
  });

  // In a browser the screen change commits after the transition, so a
  // second activation can land on the home page still shown: here both
  // land in one act, before React commits, with the double-tap filter in.
  // A key's click has no pointer's detail, and is never filtered.
  it.each([
    ["Enter twice on the large card", () => [featuredCard(), featuredCard()].forEach((each) => fireEvent.click(each, { detail: 0 }))],
    [
      "two taps on the large card, more than 100 CSS pixels apart",
      () => {
        tapAt(featuredCard(), 0, { x: 0 });
        tapAt(featuredCard(), 250, { x: 150 });
      }
    ]
  ])("counts one start of ALL DINOSAURS for %s landing before the list shows, and one more on the next visit", (_how, open) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "home-featured": { starts: {}, featured: { ...TODAY, game: "catalogue" } } } }) });
    openApp(storage);
    filterTaps();

    act(open);

    expect(document.querySelector(".games-tiles")).toBeNull();
    expect(storedFeatured(storage).starts).toEqual({ catalogue: 1 });

    tapAt(button("HOME"), 1000);
    tapAt(featuredCard(), 2000);

    expect(storedFeatured(storage).starts).toEqual({ catalogue: 2 });
  });
});
