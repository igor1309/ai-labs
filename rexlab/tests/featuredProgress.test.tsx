import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App, type AppProps } from "../src/App.tsx";
import { HOME_GAMES } from "../src/HomePage.tsx";
import { localLanguage } from "../src/localLanguage.ts";
import { PROGRESS_KEY, localCareProgress, localFeatured, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { localTheme } from "../src/localTheme.ts";
import { endWave, playBoard } from "./pairsApp.tsx";
import { sortByTrying } from "./sorting.tsx";
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
  homeTile,
  manualAppearance,
  manualOrientation,
  manualPictures,
  manualTimers,
  manualVisibility,
  memoryStorage,
  type ManualTimers,
  type MemoryStorage
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
function openApp<C extends Pick<AppProps, "loadPicture" | "startTimer"> = ManualTimers>(
  storage: MemoryStorage = memoryStorage({ [PROGRESS_KEY]: progressWith() }),
  { random = () => 0, clock = manualTimers() as unknown as C }: { random?: () => number; clock?: C } = {}
) {
  const featured = localFeatured(() => storage, HOME_GAMES);
  render(
    <App
      now={() => NOW}
      featuredStore={featured}
      startCounter={featured}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={random}
      orientation={manualOrientation("landscape")}
      pageVisibility={manualVisibility("visible")}
      progress={localProgress(() => storage)}
      deviceLanguage="en-GB"
      languageStore={localLanguage(() => storage)}
      appearance={manualAppearance("light")}
      themeStore={localTheme(() => storage)}
      visitors={SHIPPED_VISITORS}
      careProgress={localCareProgress(() => storage)}
      itemPicture={fakeItemPicture}
      sortables={SHIPPED_SORTABLES}
      sortingProgress={localSortingProgress(() => storage)}
      pals={SHIPPED_PALS}
      pairsProgress={localPairsProgress(() => storage)}
      skeletons={SHIPPED_SKELETONS}
      skeletonPicture={fakeSkeletonPicture}
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
  ["a quiz round starts from the home page", "compare", 1, ({ user }) => user.click(homeTile("COMPARE"))],
  [
    "a quiz round starts from the home page, then from PLAY AGAIN",
    "compare",
    2,
    async ({ user }) => {
      await user.click(homeTile("COMPARE"));
      await finishRound(user);
      await user.click(button("PLAY AGAIN"));
    }
  ],
  ["the dinosaur list opens from the home page", "catalogue", 1, ({ user }) => user.click(homeTile("ALL DINOSAURS"))],
  [
    "a care visit starts from NEW VISITOR",
    "care",
    1,
    async ({ user }) => {
      await user.click(homeTile("CARE"));
      await user.click(button("NEW VISITOR"));
    }
  ],
  [
    "a friend is called back",
    "care",
    1,
    async ({ user }) => {
      await user.click(homeTile("CARE"));
      await user.click(button("FRIENDS"));
      await user.click(within(screen.getByRole("group", { name: "FRIENDS" })).getByRole("button"));
    }
  ],
  ["a sorting round starts from its card", "sort", 1, ({ user }) => user.click(homeTile("SORT"))],
  [
    "a sorting round starts from its card, then from PLAY AGAIN",
    "sort",
    2,
    async ({ user }) => {
      await user.click(homeTile("SORT"));
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
      await user.click(homeTile("FIND THE PAIR"));
      await user.click(button("PLAY"));
    }
  ],
  [
    "a board is dealt from PLAY, then from PLAY AGAIN",
    "pairs",
    2,
    async ({ user, clock }) => {
      await user.click(homeTile("FIND THE PAIR"));
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
      await user.click(homeTile("SKELETONS"));
      await user.click(firstIn("DINOSAURS"));
    }
  ],
  [
    "a skeleton is rebuilt",
    "skeletons",
    1,
    async ({ user }) => {
      await user.click(homeTile("SKELETONS"));
      await user.click(button("MUSEUM"));
      await user.click(button("REBUILD"));
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

    await user.click(homeTile("CARE"));
    await user.click(button("NEW VISITOR"));
    await user.click(button("HOME"));

    expect(storedFeatured(storage).starts).toEqual({ care: 3 });
  });

  it("counts nothing on the care, find-the-pair and skeleton screens before a game, nor on a dinosaur's page and back", async () => {
    const { user, storage } = openApp();
    await user.click(homeTile("ALL DINOSAURS"));
    const opened = storedFeatured(storage);

    await user.click(firstIn("ALL DINOSAURS"));
    await user.click(button("ALL DINOSAURS"));
    await user.click(button("HOME"));
    for (const name of ["CARE", "FIND THE PAIR", "SKELETONS"]) {
      await user.click(homeTile(name));
      await user.click(button("HOME"));
    }

    expect(storedFeatured(storage)).toEqual(opened);
    expect(opened.starts).toEqual({ catalogue: 1 });
  });
});

describe("a browser that cannot keep progress", () => {
  // A draw of 0.1 falls to COMPARE only while every game has the same
  // weight: with COMPARE's 9 starts read, it would fall to ALL DINOSAURS.
  it("offers a featured game when it cannot read progress, every count at 0, and every tile opens its game", async () => {
    const { user, featured } = openApp(memoryStorage({ [PROGRESS_KEY]: progressWith({ compare: 9 }) }, { read: false }), { random: () => 0.1 });

    expect(featuredCard().dataset.game).toBe("compare");
    expect(featured.load()).toEqual({ starts: {}, featured: { day: "2026-10-18", game: "compare" } });
    for (const name of ["COMPARE", "ALL DINOSAURS", "CARE", "SORT", "FIND THE PAIR", "SKELETONS"]) {
      await user.click(homeTile(name));
      expect(document.querySelector(".games-tiles")).toBeNull();
      await user.click(button("HOME"));
    }
  });

  it("keeps the day's game and counts CARE's start for the visit when it cannot save", async () => {
    const raw = progressWith({ care: 1 });
    const { user, storage, featured } = openApp(memoryStorage({ [PROGRESS_KEY]: raw }, { save: false }));

    await user.click(homeTile("CARE"));
    await user.click(button("NEW VISITOR"));
    await user.click(button("HOME"));

    expect(featuredCard().dataset.game).toBe("skeletons");
    expect(featured.load()).toEqual({ starts: { care: 2 }, featured: TODAY });
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
    await begin(user);
    loadAll();

    expect(storedFeatured(storage).starts).toEqual({ [game]: 1 });
  });
});
