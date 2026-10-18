import { act, cleanup, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANGUAGE_KEY } from "../src/localLanguage.ts";
import { localCareProgress, localPairsProgress, localProgress, localSortingProgress, PROGRESS_KEY } from "../src/localProgress.ts";
import { THEME_KEY } from "../src/localTheme.ts";
import type { PairsSaved } from "../src/pairsGame.tsx";
import {
  choices,
  finishLoading,
  fit,
  fitAll,
  fittedPieces,
  keptSkeletons,
  layOutPuzzle,
  openSkeletonsApp,
  reveal,
  revealNow,
  savedSkeletons,
  skeletonOf,
  trayPieces,
  type SkeletonsAppOptions
} from "./skeletonsApp.tsx";
import { memoryStorage, type MemoryStorage, homeTile } from "./support.ts";

// skeleton-assembly-progress.feature

type Opened = ReturnType<typeof openSkeletonsApp>;

const button = (name: string) => screen.getByRole("button", { name });

const starsChip = () => screen.getByLabelText("STARS").textContent;
const bestScore = () => screen.queryByLabelText("BEST SCORE")?.textContent;

// What each stand of the museum shows, in the hall's order: its name, its
// state, whether it has a star, and the words of its button.
const stands = () =>
  within(screen.getByRole("group", { name: "STANDS" }))
    .getAllByRole("region")
    .map((stand) => [stand.getAttribute("aria-label"), stand.getAttribute("data-state"), within(stand).queryByRole("img", { name: "STAR" }) !== null, within(stand).getByRole("button").textContent]);

const BUILT = (name: string) => [name, "built", true, "REBUILD"];
const REBUILDING = (name: string) => [name, "rebuilding", true, "CONTINUE"];
const EMPTY = (name: string) => [name, "empty", false, "BUILD"];

const stand = (name: string) => within(screen.getByRole("group", { name: "STANDS" })).getByRole("region", { name });

// The puzzle the button `start` starts, its pictures loaded and its board
// laid out.
async function startPuzzle({ user, pictures }: Opened, start: HTMLElement) {
  await user.click(start);
  act(() => finishLoading(pictures));
  layOutPuzzle();
}

// The skeleton of `id` chosen from the choice of dinosaurs and built, to
// its reveal.
async function build(opened: Opened, id: string) {
  const skeleton = skeletonOf(id);
  await startPuzzle(opened, button(skeleton.name.en.toUpperCase()));
  fitAll(skeleton);
  revealNow(opened.pictures, id);
}

// The skeleton of `id` built from the choice of dinosaurs, then the
// choice again.
async function buildThenChoose(opened: Opened, id: string) {
  await build(opened, id);
  await opened.user.click(button("BUILD ANOTHER"));
}

// The app closed and opened again on the same storage, on its choice of
// dinosaurs.
function reopen(storage: MemoryStorage, options: SkeletonsAppOptions = {}) {
  cleanup();
  return openSkeletonsApp({ ...options, storage });
}

async function visitMuseum({ user }: Opened) {
  await user.click(button("MUSEUM"));
}

const QUIZ = { bestScore: 7, roundsPlayed: 3 };
const CARE = { bestScore: 6, visitsFinished: 2, friends: ["triceratops"] };
const SORTING = { bestScore: 9, roundsPlayed: 4 };
// Find the pair's entry as stored, and as the game reads it.
const PAIRS = { stars: 5, level: 2, boardsOnLevel: 1, best: { 1: 6 }, found: ["stegosaurus"] };
const PAIRS_SAVED: PairsSaved = { progress: { stars: 5, climbLevel: 2, boardsOnClimbLevel: 1, best: { 1: 6 }, found: ["stegosaurus"] }, levelChoice: undefined };

// Storage holding every other game's progress, a language and a theme,
// and the skeleton game's own entry when there is one.
const withOthers = (skeletons?: unknown) =>
  memoryStorage({
    [PROGRESS_KEY]: JSON.stringify({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": QUIZ,
        "dinosaur-care": CARE,
        "sort-dinosaurs": SORTING,
        "find-the-pair": PAIRS,
        ...(skeletons === undefined ? {} : { "skeleton-assembly": skeletons })
      }
    }),
    [LANGUAGE_KEY]: "en",
    [THEME_KEY]: "dark"
  });

// Every other game's progress and the settings, as they are read.
const others = (storage: MemoryStorage) => [
  localProgress(() => storage).load(),
  localCareProgress(() => storage).load(),
  localSortingProgress(() => storage).load(),
  localPairsProgress(() => storage).load(),
  storage.items.get(LANGUAGE_KEY),
  storage.items.get(THEME_KEY)
];

const OTHERS = [QUIZ, CARE, SORTING, PAIRS_SAVED, "en", "dark"];

describe("keeping the collection", () => {
  it("keeps the stars and the skeletons on their stands once the app is closed and reopened", async () => {
    const storage = memoryStorage();
    const opened = openSkeletonsApp({ storage });
    await buildThenChoose(opened, "tyrannosaurus");
    await buildThenChoose(opened, "triceratops");

    await visitMuseum(reopen(storage));

    expect([starsChip(), bestScore()]).toEqual(["2/3", "2/3"]);
    expect(stands()).toEqual([BUILT("TYRANNOSAURUS"), BUILT("TRICERATOPS"), EMPTY("STEGOSAURUS")]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus", "triceratops"], bestScore: 2, rebuilding: [] });
  });

  it.each<[string, (opened: Opened, storage: MemoryStorage) => Promise<Opened>]>([
    [
      "taps HOME, without being asked to confirm",
      async (opened) => {
        await opened.user.click(button("HOME"));
        expect([screen.queryAllByRole("dialog"), screen.queryAllByRole("alertdialog"), homeTile("COMPARE")]).toEqual([[], [], expect.anything()]);
        await opened.user.click(button("SKELETONS"));
        return opened;
      }
    ],
    ["reloads the app", async (_, storage) => reopen(storage)]
  ])("earns nothing for an unfinished first build when the child %s", async (_, leave) => {
    const triceratops = skeletonOf("triceratops");
    const storage = keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });
    const opened = openSkeletonsApp({ storage });
    await startPuzzle(opened, button("TRICERATOPS"));
    for (const piece of ["skull", "spine", "legs"] as const) fit(triceratops, piece);

    const back = await leave(opened, storage);

    expect(screen.getByRole("heading").textContent).toBe("BUILD A SKELETON");
    expect(choices().map((choice) => within(choice).queryByRole("img", { name: "STAR" }) !== null)).toEqual([true, false, false]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });
    await visitMuseum(back);
    expect([starsChip(), bestScore()]).toEqual(["1/3", "1/3"]);
    expect(stands()).toEqual([BUILT("TYRANNOSAURUS"), EMPTY("TRICERATOPS"), EMPTY("STEGOSAURUS")]);
    await startPuzzle(back, within(stand("TRICERATOPS")).getByRole("button"));
    expect([fittedPieces(), trayPieces()]).toEqual([[], ["SKULL", "SPINE", "LEGS", "TAIL"]]);
  });

  it("keeps an unfinished rebuild as an earned stand awaiting its skeleton, its fitted bones not, and stands the skeleton back without another star", async () => {
    const triceratops = skeletonOf("triceratops");
    const storage = keptSkeletons({ earned: ["triceratops"], bestScore: 1, rebuilding: [] });
    const opened = openSkeletonsApp({ storage });
    await visitMuseum(opened);
    await startPuzzle(opened, within(stand("TRICERATOPS")).getByRole("button", { name: "REBUILD" }));
    fit(triceratops, "skull");
    fit(triceratops, "tail");

    const back = reopen(storage);
    await visitMuseum(back);

    expect(stands()).toEqual([EMPTY("TYRANNOSAURUS"), REBUILDING("TRICERATOPS"), EMPTY("STEGOSAURUS")]);
    expect(stand("TRICERATOPS").querySelector(".skeleton-exhibit-picture")?.classList.contains("skeleton-silhouette")).toBe(true);
    expect([starsChip(), bestScore()]).toEqual(["1/3", "1/3"]);
    await startPuzzle(back, within(stand("TRICERATOPS")).getByRole("button", { name: "CONTINUE" }));
    expect([screen.getByRole("heading").textContent, fittedPieces(), trayPieces()]).toEqual(["TRICERATOPS", [], ["SKULL", "SPINE", "LEGS", "TAIL"]]);

    fitAll(triceratops);
    revealNow(back.pictures, "triceratops");

    expect(within(reveal() ?? document.body).getByRole("img", { name: "STAR" }).hasAttribute("data-new")).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    await back.user.click(within(screen.getByRole("navigation")).getByRole("button", { name: "MUSEUM" }));
    expect(stands()).toEqual([EMPTY("TYRANNOSAURUS"), BUILT("TRICERATOPS"), EMPTY("STEGOSAURUS")]);
    expect(savedSkeletons(storage)).toEqual({ earned: ["triceratops"], bestScore: 1, rebuilding: [] });
  });

  it("leaves the other games' progress, the language and the theme as they were, and their saves leave the skeletons' alone", async () => {
    const storage = withOthers();
    const opened = openSkeletonsApp({ storage });
    await build(opened, "stegosaurus");
    await opened.user.click(within(screen.getByRole("navigation")).getByRole("button", { name: "MUSEUM" }));
    await startPuzzle(opened, within(stand("STEGOSAURUS")).getByRole("button", { name: "REBUILD" }));

    reopen(storage);

    expect(others(storage)).toEqual(OTHERS);
    const saved = { earned: ["stegosaurus"], bestScore: 1, rebuilding: ["stegosaurus"] };
    expect(savedSkeletons(storage)).toEqual(saved);
    localProgress(() => storage).save({ bestScore: 10, roundsPlayed: 4 });
    localCareProgress(() => storage).save({ ...CARE, visitsFinished: 3 });
    localSortingProgress(() => storage).save({ bestScore: 10, roundsPlayed: 5 });
    localPairsProgress(() => storage).save({ ...PAIRS_SAVED, progress: { ...PAIRS_SAVED.progress, stars: 6 } });
    expect(savedSkeletons(storage)).toEqual(saved);
  });

  it.each<[string, MemoryStorage, boolean]>([
    ["absent", withOthers(), true],
    ["malformed", withOthers({ earned: "tyrannosaurus", bestScore: "3", rebuilding: {} }), true],
    [
      "from an unknown schema version",
      memoryStorage({
        [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 2, games: { "compare-dinosaurs": QUIZ, "skeleton-assembly": { earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] } } })
      }),
      false
    ]
  ])("starts an empty museum when the skeleton progress stored is %s, and saves the first skeleton readably", async (_, storage, othersReadable) => {
    const opened = openSkeletonsApp({ storage });
    expect(bestScore()).toBeUndefined();
    await visitMuseum(opened);
    expect([starsChip(), bestScore()]).toEqual(["0/3", undefined]);
    expect(stands()).toEqual([EMPTY("TYRANNOSAURUS"), EMPTY("TRICERATOPS"), EMPTY("STEGOSAURUS")]);
    await opened.user.click(button("BUILD ANOTHER"));

    await build(opened, "tyrannosaurus");

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe("FIRST BEST SCORE");
    expect(savedSkeletons(storage)).toEqual({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });
    if (othersReadable) expect(others(storage).slice(0, 4)).toEqual(OTHERS.slice(0, 4));
    reopen(storage);
    expect(bestScore()).toBe("1/3");
  });

  it("gives a dinosaur saved twice one stand and one star, and one with no skeleton none, counting only the different dinosaurs with a skeleton", async () => {
    const storage = keptSkeletons({ earned: ["tyrannosaurus", "allosaurus", "tyrannosaurus"], bestScore: 3, rebuilding: ["allosaurus"] });

    await visitMuseum(openSkeletonsApp({ storage }));

    expect(stands()).toEqual([BUILT("TYRANNOSAURUS"), EMPTY("TRICERATOPS"), EMPTY("STEGOSAURUS")]);
    expect(screen.getAllByRole("img", { name: "STAR" })).toHaveLength(1);
    expect([starsChip(), bestScore()]).toEqual(["1/3", "1/3"]);
  });

  it("still plays when stored progress cannot be read: the reveal and its star, the stand built while the app is open, and no best or celebration", async () => {
    const storage = memoryStorage({}, { read: false });
    const opened = openSkeletonsApp({ storage });

    await build(opened, "triceratops");

    expect([within(reveal() ?? document.body).getByRole("img", { name: "STAR" }).hasAttribute("data-new"), starsChip(), bestScore(), screen.queryByRole("status")]).toEqual([
      true,
      "1/3",
      undefined,
      null
    ]);
    await opened.user.click(within(screen.getByRole("navigation")).getByRole("button", { name: "MUSEUM" }));
    expect([stands()[1], starsChip(), bestScore()]).toEqual([BUILT("TRICERATOPS"), "1/3", undefined]);
    await opened.user.click(button("BUILD ANOTHER"));
    expect(within(choices()[1] ?? document.body).getByRole("img", { name: "STAR" })).toBeDefined();
    expect(storage.items.size).toBe(0);
  });

  it("keeps the progress for the session when it cannot be saved, celebrated against the best read, and only what was saved after a reload", async () => {
    const before = keptSkeletons({ earned: ["tyrannosaurus"], bestScore: 1, rebuilding: [] });
    const storage = memoryStorage(Object.fromEntries(before.items), { save: false });
    const opened = openSkeletonsApp({ storage });

    await build(opened, "stegosaurus");

    expect([screen.getByRole("status").getAttribute("aria-label"), bestScore()]).toEqual(["NEW BEST SCORE", "BEST12/3"]);
    await opened.user.click(within(screen.getByRole("navigation")).getByRole("button", { name: "MUSEUM" }));
    expect(stands()).toEqual([BUILT("TYRANNOSAURUS"), EMPTY("TRICERATOPS"), BUILT("STEGOSAURUS")]);
    for (const name of ["TYRANNOSAURUS", "STEGOSAURUS"]) {
      const skeleton = skeletonOf(name.toLowerCase());
      await startPuzzle(opened, within(stand(name)).getByRole("button", { name: "REBUILD" }));
      fitAll(skeleton);
      revealNow(opened.pictures, skeleton.id);
      expect([within(reveal() ?? document.body).getByRole("img", { name: "STAR" }).hasAttribute("data-new"), starsChip(), screen.queryByRole("status")]).toEqual([false, "2/3", null]);
      await opened.user.click(within(screen.getByRole("navigation")).getByRole("button", { name: "MUSEUM" }));
    }
    expect([stands(), starsChip(), bestScore()]).toEqual([[BUILT("TYRANNOSAURUS"), EMPTY("TRICERATOPS"), BUILT("STEGOSAURUS")], "2/3", "2/3"]);

    await visitMuseum(reopen(storage));

    expect([stands(), starsChip(), bestScore()]).toEqual([[BUILT("TYRANNOSAURUS"), EMPTY("TRICERATOPS"), EMPTY("STEGOSAURUS")], "1/3", "1/3"]);
  });
});
