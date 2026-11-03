import { THEMES } from "../src/theme.ts";
import { emptyLabyrinth, largestSize } from "./support.ts";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { HOME_TILE_PICTURES, PAIRS_PICTURE } from "../src/homeTilePictures.ts";
import { HomePage, type HomeGame } from "../src/HomePage.tsx";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localDigProgress, localLabyrinthProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { careRecord } from "./careApp.tsx";
import { HOME_GAMES, badgeOf, renderHomePageFeaturing } from "./homePage.tsx";
import { openMenu, outsideMenu } from "./menus.ts";
import { pairsRecord } from "./pairsApp.tsx";
import { keptSkeletons } from "./skeletonsApp.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  SHIPPED_DIG,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuredCard,
  featuring,
  homeTile,
  shortHomeName,
  fakeSkeletonPicture,
  lightDevice,
  countedStarts,
  loadShownPictures,
  loadedPictures,
  manualPictures,
  manualViewport,
  memoryStorage,
  pageAtRest,
  seededRandom,
  symbolOf,
  tilesRow,
  type MemoryStorage,
  unsetAgeLevel
} from "./support.ts";
import { withPictures } from "./pictures.tsx";

// The home page, its large card COMPARE's unless `featured` names
// another game.
function openHomePage(
  progress = emptyProgress(),
  pictures = loadedPictures(),
  care = emptyCare(),
  sorting = emptySorting(),
  pairs = emptyPairs(),
  skeletons = emptySkeletons(),
  dig = emptyDig(),
  featured: HomeGame = "compare",
  labyrinth = emptyLabyrinth()
) {
  render(<App {...labyrinth} {...featuring(featured)} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} portraitLayouts={{}} viewport={manualViewport("landscape")} progress={progress} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...care} {...sorting} {...pairs} {...skeletons} {...dig} {...pageAtRest()} {...pictures} />);
  return { user: userEvent.setup({ delay: null }), card: featuredCard() };
}

// The home page with COMPARE's tile in the row, the large card CARE's.
function openWithCompareTile(progress = emptyProgress()) {
  const home = openHomePage(progress, loadedPictures(), emptyCare(), emptySorting(), emptyPairs(), emptySkeletons(), emptyDig(), "care");
  return { ...home, tile: homeTile("COMPARE") };
}

const withStorage = (storage: MemoryStorage) => localProgress(() => storage);

const withSorting = (storage: MemoryStorage) => ({ ...emptySorting(), sortingProgress: localSortingProgress(() => storage) });

const withSkeletons = (storage: MemoryStorage) => ({ ...emptySkeletons(), skeletonProgress: localSkeletonProgress(() => storage) });

// A stored record in the section 5 format of docs/mvp-infrastructure.md:
// the quiz's Explorer best, the level a new install plays.
const record = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, explorerBest: bestScore, paleontologistBest: null, roundsPlayed: 3 } } });

// The sorting game’s Explorer best, the level a new install plays.
const sortingRecord = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "sort-dinosaurs": { bestScore, explorerBest: bestScore, paleontologistBest: null, roundsPlayed: 2 } } });

const nothing = () => {};

// The home page alone, its SORT card's taps counted in `taps`.
function renderHomePage(taps: number[]) {
  render(
    <HomePage
      motion={() => () => {}}
      tilesPerLayer={6}

      language="en"
      onLanguage={nothing}
      theme="light"
      onTheme={nothing}
      ageLevel="explorer"
      onAgeLevel={nothing}
      startTimer={() => nothing}
      newGames={[]}
      version="v1.2.3"
      featured="compare"
      faceOff={{ left: fakeBodyPicture("tyrannosaurus"), right: fakeBodyPicture("brachiosaurus") }}
      best={undefined}
      catalogue={{ picture: fakeBodyPicture("stegosaurus"), count: SHIPPED_CATALOGUE.length }}
      care={{ picture: fakeBodyPicture("parasaurolophus"), best: undefined }}
      sort={{ picture: fakeBodyPicture("triceratops"), best: undefined }}
      pairs={{ picture: fakeBodyPicture("stegosaurus"), stars: undefined }}
      skeletons={{ picture: fakeSkeletonPicture("triceratops", "skeleton"), best: undefined }}
      dig={{ picture: fakeBodyPicture("stegosaurus"), dugUp: undefined }}
      labyrinth={{ picture: fakeBodyPicture("triceratops"), stars: undefined }}
      moreComing={fakeBodyPicture("triceratops")}
      onCompareDinosaurs={nothing}
      onCatalogue={nothing}
      onCare={nothing}
      onSort={() => taps.push(1)}
      onPairs={nothing}
      onSkeletons={nothing}
      onMuseum={nothing}
      onDig={nothing}
      sandWritingPicture="/sand.webp"
      onSandWriting={nothing}
      onLabyrinth={nothing}
    />,
    withPictures
  );
  return { user: userEvent.setup({ delay: null }), card: homeTile("SORT") };
}

// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

const pairsTile = () => homeTile("FIND THE PAIR");

const skeletonsTile = () => homeTile("SKELETONS");

const px = (value: string) => Number.parseFloat(value) || 0;

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

describe("the home page", () => {
  it("offers the quiz as the first tile, with the app's own Tyrannosaurus and Brachiosaurus facing off", () => {
    const { tile } = openWithCompareTile();

    expect(tile).toBe(tilesRow().querySelector(".tiles-grid")?.firstElementChild);
    expect(tile.textContent).toBe("COMPARE");
    expect(symbolsOf(tile)).toEqual(["scale"]);
    const faceOff = within(tile).getByRole("img", { name: "TWO DINOSAURS" });
    const pictures = [...faceOff.querySelectorAll("img")];
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([fakeBodyPicture("tyrannosaurus"), fakeBodyPicture("brachiosaurus")]);
  });

  it("stands every other game in order beneath the sky, with SOON last", () => {
    const { card } = openHomePage();
    expect(card.closest(".home-sky")?.nextElementSibling).toBe(tilesRow());
    const tiles = [...["ANCIENT REPTILES", "FIND THE PAIR", "SKELETONS", "DIG", "SORT", "CARE", "SAND WRITING", "LABYRINTH"].map(homeTile), document.querySelector(".more-coming")];
    expect([...tilesRow().querySelectorAll(".tiles-grid > *")]).toEqual(tiles);
  });

  it("only scrolls on a swipe that starts on a tile: no game opens and no tile is left pressed", () => {
    openHomePage();
    const sort = screen.getByRole("button", { name: "SORT" });

    // The browser scrolls vertically only if nothing from the tile up
    // forbids it.
    const panning: string[] = [];
    for (let element: Element | null = sort; element; element = element.parentElement) panning.push(getComputedStyle(element).touchAction || "auto");
    expect(panning.filter((action) => !["auto", "manipulation"].includes(action) && !action.split(" ").includes("pan-y"))).toEqual([]);
    expect(getComputedStyle(tilesRow()).overflowX).not.toBe("auto");

    // A finger that pans the row gets a pointercancel and no click.
    fireEvent.pointerDown(sort, { pointerType: "touch" });
    expect(sort.dataset.pressed).toBe("true");
    fireEvent.pointerCancel(sort, { pointerType: "touch" });

    expect(sort.dataset.pressed).toBeUndefined();
    expect(featuredCard()).toBeDefined();
  });

  it("stands the tiles at their start again on coming home from a game", async () => {
    const { user } = openHomePage();
    const row = tilesRow();

    await user.click(pairsTile());
    await user.click(await screen.findByRole("button", { name: "HOME" }));

    // The row is drawn anew, so it is scrolled to its start.
    await screen.findByRole("button", { name: "PAIRS" });
    expect(document.querySelectorAll(".games-tiles")).toHaveLength(1);
    expect(tilesRow()).not.toBe(row);
    expect(row.isConnected).toBe(false);
  });

  it("shows the games still to come as a faded Brachiosaurus's shape over a lock, with nothing to tap, brighten or press in", async () => {
    const { user } = openHomePage();

    const tile = document.querySelector(".more-coming");
    if (!tile) throw new Error("No MORE COMING tile");
    expect(tile.tagName).toBe("DIV");
    expect(tile.querySelector("button, a, [role=button]")).toBeNull();
    expect(tile.classList.contains("card")).toBe(false);
    expect(tile.textContent).toBe("SOON");
    expect(TEXTS.ru.moreComing).toBe("СКОРО ЕЩЁ");
    expect(symbolsOf(tile)).toEqual(["lock"]);
    const picture = tile.querySelector("img");
    expect(picture?.getAttribute("src")).toBe(fakeBodyPicture("brachiosaurus"));
    expect(brightness(picture ?? tile)).toBe(0);
    expect(Number(getComputedStyle(picture ?? tile).opacity)).toBeLessThan(0.5);

    await user.hover(tile);
    expect(brightness(tile)).toBe(1);
    await user.pointer({ keys: "[TouchA>]", target: tile });
    expect(getComputedStyle(tile).transform).toBe("none");
    await user.pointer({ keys: "[/TouchA]", target: tile });
    expect(document.querySelector(".home-sky")?.nextElementSibling).toBe(tilesRow());
  });

  it("lays the tiles in the page below the sky", () => {
    openHomePage();
    expect(getComputedStyle(tilesRow()).overflowX).not.toBe("auto");
    expect(tilesRow().contains(featuredCard())).toBe(false);
  });

  // Tile geometry and title fit require a browser with real fonts.
  it("offers find the pair as a tile under ANCIENT REPTILES, before SKELETONS: a matched pair of Triceratops cards, its symbol beside its title", () => {
    openHomePage();

    const tile = pairsTile();
    // The row fills two tiles to a column: the second tile is the first
    // column's lower one, COMPARE's tile left out for the large card.
    expect([...tilesRow().querySelector(".tiles-grid")!.children].indexOf(tile)).toBe(1);
    expect(tile.nextElementSibling).toBe(skeletonsTile());
    expect(tile.textContent).toBe("PAIRS");
    expect(symbolsOf(tile)).toEqual(["copy"]);
    expect([...tile.querySelectorAll("img")].map((picture) => picture.getAttribute("src"))).toEqual([PAIRS_PICTURE]);
    expect(tile.querySelector(".pairs-tile-stars")).toBeNull();
  });

  it("offers sand writing as a tile of a Parasaurolophus traced in sand, its pencil symbol beside its title", () => {
    openHomePage();
    const tile = homeTile("SAND WRITING");
    expect(tile.textContent).toBe("DRAW");
    expect(symbolsOf(tile)).toEqual(["pencil"]);
    expect(tile.querySelector("img")?.getAttribute("src")).toBe(HOME_TILE_PICTURES.sandWriting);
  });

  it("brightens find the pair's tile under a pointer, and presses it in", async () => {
    const { user } = openHomePage();
    const tile = pairsTile();

    await user.hover(tile);
    expect(brightness(tile)).toBeGreaterThan(1);
    await user.pointer({ keys: "[TouchA>]", target: tile });
    expect(getComputedStyle(tile).transform).toMatch(/^scale\(0\.\d+\)$/);
    await user.pointer({ keys: "[/TouchA]", target: tile });

    expect(screen.getByRole("button", { name: "PLAY" })).toBeDefined();
  });

  it("offers the skeleton game as a SKELETONS tile before DIG: the Brachiosaurus's skeleton, a bone beside its title, and no best before a skeleton is built", () => {
    openHomePage();

    const tile = skeletonsTile();
    expect(tile.textContent).toBe("BONES");
    expect(TEXTS.ru.skeletons).toBe("СКЕЛЕТЫ");
    expect(symbolsOf(tile)).toEqual(["bone"]);
    expect([...tile.querySelectorAll("img")].map((picture) => picture.getAttribute("src"))).toEqual([fakeSkeletonPicture("brachiosaurus", "skeleton")]);
    const title = tile.querySelector(".skeletons-tile-title");
    expect(title?.previousElementSibling?.contains(tile.querySelector("svg.lucide-bone"))).toBe(true);
    expect(tile.nextElementSibling).toBe(homeTile("DIG"));
    expect(tile.querySelector(".skeletons-tile-best")).toBeNull();
  });

  it("shows the best collection score in the SKELETONS tile's picture's corner, beside a trophy", () => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), emptySorting(), emptyPairs(), withSkeletons(keptSkeletons({ earned: ["triceratops", "stegosaurus"], bestScore: 2, rebuilding: [] })));

    const tile = skeletonsTile();
    expect(tile.querySelector(".skeletons-tile-best")).toBeNull();
  });

  it.each([
    ["no skeleton built", keptSkeletons({ earned: [], bestScore: null, rebuilding: [] })],
    ["storage that cannot be read", memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "skeleton-assembly": { earned: ["triceratops"], bestScore: 1, rebuilding: [] } } }) }, { read: false })],
    ["only the quiz's best kept", memoryStorage({ [PROGRESS_KEY]: record(7) })]
  ])("shows no best score on the SKELETONS tile with %s", (_, storage) => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), emptySorting(), emptyPairs(), withSkeletons(storage));

    expect(skeletonsTile().querySelector(".skeletons-tile-best")).toBeNull();
    expect(symbolsOf(skeletonsTile())).toEqual(["bone"]);
  });

  it("opens the skeleton game's choice of dinosaurs on SKELETONS, with MUSEUM beside a museum and HOME beside a house", async () => {
    const { user } = openHomePage();

    await user.click(skeletonsTile());

    expect(screen.getByRole("heading").textContent).toBe("BUILD A SKELETON");
    expect(within(screen.getByRole("group", { name: "ANIMALS" })).getAllByRole("button").map((choice) => choice.getAttribute("aria-label"))).toEqual([
      "TYRANNOSAURUS",
      "TRICERATOPS",
      "STEGOSAURUS",
      "BRACHIOSAURUS",
      "SPINOSAURUS"
    ]);
    expect([symbolOf(screen.getByRole("button", { name: "MUSEUM" })), symbolOf(screen.getByRole("button", { name: "HOME" }))]).toEqual(["landmark", "house"]);
  });

  it("brightens the SKELETONS tile under a pointer, and presses it in before the game opens", async () => {
    const { user } = openHomePage();
    const tile = skeletonsTile();

    await user.hover(tile);
    expect(brightness(tile)).toBeGreaterThan(1);
    await user.pointer({ keys: "[TouchA>]", target: tile });
    expect(getComputedStyle(tile).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(screen.queryByRole("heading", { name: "BUILD A SKELETON" })).toBeNull();
    await user.pointer({ keys: "[/TouchA]", target: tile });

    expect(screen.getByRole("heading", { name: "BUILD A SKELETON" })).toBeDefined();
  });

  it("omits a badge from COMPARE even with a saved best score", () => {
    const { tile } = openWithCompareTile(withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })));

    expect(tile.querySelector(".compare-tile-best")).toBeNull();
  });

  it.each([
    ["no round finished yet", memoryStorage()],
    ["no best kept", memoryStorage({ [PROGRESS_KEY]: record(null) })],
    ["storage that cannot be read", memoryStorage({ [PROGRESS_KEY]: record(7) }, { read: false })]
  ])("shows no best score on the COMPARE tile with %s", (_, storage) => {
    const { tile } = openWithCompareTile(withStorage(storage));

    expect(tile.querySelector(".compare-tile-best")).toBeNull();
    expect(symbolsOf(tile)).toEqual(["scale"]);
  });

  it("offers the sorting game as a SORT card with a Pachycephalosaurus card over its basket beside a symbol of shapes, and no best score before a board is finished", () => {
    openHomePage();

    const sort = screen.getByRole("button", { name: "SORT" });
    expect(sort.textContent).toBe("SORT");
    expect(symbolsOf(sort)).toEqual(["shapes"]);
    expect(sort.querySelector("img.sort-tile-picture")?.getAttribute("src")).toBe(HOME_TILE_PICTURES.sort);
    const title = sort.querySelector(".sort-tile-title");
    expect(title?.previousElementSibling?.contains(sort.querySelector("svg.lucide-shapes"))).toBe(true);
    expect(sort.querySelector(".sort-tile-best")).toBeNull();
  });

  it("omits a badge from SORT even with a saved best score", () => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), withSorting(memoryStorage({ [PROGRESS_KEY]: sortingRecord(4) })), emptyPairs(), emptySkeletons(), emptyDig(), "care");

    const sort = screen.getByRole("button", { name: "SORT" });
    expect(sort.querySelector(".sort-tile-best")).toBeNull();
  });

  it.each([
    ["no best kept", memoryStorage({ [PROGRESS_KEY]: sortingRecord(null) })],
    ["storage that cannot be read", memoryStorage({ [PROGRESS_KEY]: sortingRecord(4) }, { read: false })],
    ["only the quiz's best kept", memoryStorage({ [PROGRESS_KEY]: record(7) })]
  ])("shows no best score on the SORT card with %s", (_, storage) => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), withSorting(storage));

    const sort = screen.getByRole("button", { name: "SORT" });
    expect(sort.querySelector(".sort-tile-best")).toBeNull();
    expect(symbolsOf(sort)).toEqual(["shapes"]);
  });

  it("brightens the SORT card under a pointer", async () => {
    const { user, card } = renderHomePage([]);
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it("shows the SORT card pressed before the game is opened, and opens it as the press ends", async () => {
    const taps: number[] = [];
    const { user, card } = renderHomePage(taps);

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card.querySelector(".home-play") ?? card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(taps).toEqual([]);

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(taps).toEqual([1]);
    expect(getComputedStyle(card).transform).toBe("none");
  });

  it("opens the sorting game once for each tap on the SORT card", async () => {
    const taps: number[] = [];
    const { user, card } = renderHomePage(taps);

    await user.click(card);
    expect(taps).toEqual([1]);

    await user.click(card);
    expect(taps).toEqual([1, 1]);
  });

  it.each(THEMES)("keeps the app icon visible in %s mode", (theme) => {
    openHomePage();
    document.documentElement.dataset.theme = theme;
    try {
      expect(getComputedStyle(document.querySelector(".wordmark-mark")!).backgroundImage).toContain("app-icon-trex.png");
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });

  it("shows the RexLab wordmark, small, in the top-left corner", () => {
    const { card } = openHomePage();

    const wordmark = screen.getByText("RexLab").closest<HTMLElement>(".wordmark")!;
    const style = getComputedStyle(wordmark);
    expect(style.position).toBe("static");
    expect(wordmark.closest("header")).not.toBeNull();
    // The wordmark stays smaller than the hero; small tiles use 20px labels.
    expect(parseFloat(style.fontSize)).toBe(26);
    expect(parseFloat(style.fontSize)).toBeLessThan(largestSize(getComputedStyle(within(card).getByText("COMPARE")).fontSize));
  });

  it("opens one menu for parents at a time, and a tap outside it does not start a round", async () => {
    const { user } = openHomePage();

    await openMenu(user, "Language");
    await openMenu(user, "Theme");

    expect(screen.getAllByRole("menu").map((menu) => menu.getAttribute("aria-label"))).toEqual(["Theme"]);

    await user.click(outsideMenu());

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();
    expect(document.querySelector(".menu-backdrop")).toBeNull();
  });

  it("closes a menu for parents with Escape, back on its button, after the keys move through its choices", async () => {
    const { user } = openHomePage();

    const menu = await openMenu(user, "Theme");

    expect(document.activeElement?.textContent).toBe("System");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Light");
    await user.keyboard("{End}");
    expect(document.activeElement?.textContent).toBe("Dark");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("System");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement?.textContent).toBe("Dark");
    await user.keyboard("{Home}");
    expect(document.activeElement?.textContent).toBe("System");
    expect(menu.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  // The quiz's two doors: its tile, and the large card in its place
  // while the quiz is featured.
  const QUIZ_DOORS = [
    ["COMPARE tile", () => openWithCompareTile().tile],
    ["large COMPARE card", () => openHomePage().card]
  ] as const;

  it.each(QUIZ_DOORS)("brightens the %s under a pointer", async (_, door) => {
    const card = door();
    const user = userEvent.setup({ delay: null });
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it.each(QUIZ_DOORS)("shows the %s pressed before the round opens", async (_, door) => {
    const card = door();
    const user = userEvent.setup({ delay: null });

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card.querySelector(".home-play") ?? card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it.each(QUIZ_DOORS)("starts a round of 10 questions on a tap on the %s", async (_, door) => {
    await userEvent.setup({ delay: null }).click(door());

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
    expect(within(screen.getByRole("group", { name: "ANIMALS" })).getAllByRole("button")).toHaveLength(2);
  });
});

// The large card is given its game; each game, featured in turn, is
// shown through the home page's props, and opened through the app.
describe("the large card", () => {
  const sources = (element: Element) => [...element.querySelectorAll("img")].map((picture) => picture.getAttribute("src"));

  it.each(HOME_GAMES.flatMap(([game, key]) => [true, false].map((scored) => [game, key, scored] as const)))(
    "features %s with its full label, artwork and rewards, leaving the other tiles in order, scored: %s",
    async (game, key, scored) => {
      const name = TEXTS.en[key];
      const looks = (door: HTMLElement) => {
        const badge = badgeOf(door);
        return { picture: (door.querySelector(".home-today-art, .home-tile-pocket")?.firstElementChild ?? door.firstElementChild)?.outerHTML, sources: sources(door), symbols: symbolsOf(door), badge: badge && [symbolOf(badge), badge.textContent] };
      };
      // The game's tile, on a home page featuring another game.
      const other = HOME_GAMES.find(([shown]) => shown !== game)?.[0] ?? game;
      const elsewhere = renderHomePageFeaturing(other, { scored });
      const tile = looks(homeTile(name));
      elsewhere.unmount();

      const { user, opened } = renderHomePageFeaturing(game, { scored });

      const card = featuredCard();
      expect([card.dataset.game, card.getAttribute("aria-label"), card.querySelector(".featured-card-title")?.textContent]).toEqual([game, name, name]);
      expect(name).toBe(name.toLocaleUpperCase("en"));
      // The same picture, drawn the same way, and the same symbols; DRAW's
      // sky shows its marks in the sand in place of its tile's dinosaur.
      if (game === "sandWriting") expect(card.querySelector(".home-today-art > .sand-writing-tile-art")).not.toBeNull();
      else {
        expect(looks(card).picture).toEqual(tile.picture);
        expect(looks(card).sources).toEqual(tile.sources);
      }
      expect(tile.badge).toBeNull();
      // Sand writing has no score; the catalogue always has its count.
      expect(looks(card).badge !== null).toBe(game !== "sandWriting" && (scored || game === "catalogue"));
      expect(within(tilesRow()).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(
        HOME_GAMES.filter(([shown]) => shown !== game).map(([, shown]) => shortHomeName(TEXTS.en[shown]))
      );
      expect(screen.getAllByRole("button", { name })).toEqual([card]);

      await user.click(card);
      expect(opened).toEqual([game]);
    }
  );

  // Each game, featured, opened by a double tap on the large card and by
  // a tap on its tile: the screen it shows once its pictures have loaded.
  async function openedBy(featured: HomeGame, tap: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
    const pictures = manualPictures();
    const { container, unmount } = render(
      <App {...emptyLabyrinth()} {...featuring(featured)} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} portraitLayouts={{}} viewport={manualViewport("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...pageAtRest()} {...pictures} />
    );
    await tap(userEvent.setup({ delay: null }));
    for (let loading = pictures.loading(); loading.length > 0; loading = pictures.loading()) {
      act(() => loading.forEach(pictures.finish));
    }
    // React generates a fresh panel id per mount; compare the references
    // as well as the panel without depending on the generated value.
    for (const [index, panel] of [...container.querySelectorAll("[id]")].entries()) {
      const previous = panel.id;
      panel.id = `panel-${index}`;
      for (const attribute of ["aria-controls", "aria-describedby", "aria-labelledby"]) {
        for (const element of container.querySelectorAll(`[${attribute}]`)) {
          element.setAttribute(attribute, element.getAttribute(attribute)!.split(" ").map((id) => id === previous ? panel.id : id).join(" "));
        }
      }
    }
    const shown = container.innerHTML;
    unmount();
    return shown;
  }

  it.each(HOME_GAMES)("opens %s once on a double tap, as a tap on its tile does while another game is featured", async (game, key) => {
    const other = HOME_GAMES.find(([shown]) => shown !== game)?.[0] ?? game;
    const doubled = await openedBy(game, (user) => user.dblClick(featuredCard()));
    const once = await openedBy(other, (user) => user.click(homeTile(TEXTS.en[key])));

    expect(doubled).toBe(once);
    expect(once).not.toContain("games-tiles");
  });
});

describe("the first question of a round", () => {
  const progressShown = () => screen.queryByLabelText("PROGRESS")?.textContent;
  const cardPictures = () => within(screen.getByRole("group", { name: "ANIMALS" })).getAllByRole("img");
  const looks = () => cardPictures().map((picture) => [picture.dataset.picture, picture.getAttribute("src")]);

  // The home page's pictures are left loading too, as some of its
  // dinosaurs may be in the question.
  it("opens at once, its pictures shimmering until they load, then fading in", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);

    await user.click(card);

    expect(progressShown()).toBe("1/10");
    expect(looks()).toEqual([
      ["loading", null],
      ["loading", null]
    ]);
    // Each card's picture, by its dinosaur's name.
    const [left, right] = cardPictures().map((picture) => fakeBodyPicture(SHIPPED_DINOSAURS.find(({ name }) => name.en === picture.getAttribute("alt"))?.id ?? ""));
    act(() => pictures.finish(left ?? ""));
    expect(looks()).toEqual([
      ["appearing", left],
      ["loading", null]
    ]);
    act(() => pictures.finish(right ?? ""));
    expect(looks()).toEqual([
      ["appearing", left],
      ["appearing", right]
    ]);
  });

  it("starts one round on a quick double tap while its pictures load", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);
    loadShownPictures(pictures);

    await user.dblClick(card);

    expect(progressShown()).toBe("1/10");
    act(() => pictures.finishAll());
    expect(progressShown()).toBe("1/10");
  });

  // docs/features/compare-dinosaurs-start.feature: two activations far
  // apart, both before the first one's screen change is shown.
  it("starts one round, counted once, for two taps on the large card in one moment", () => {
    const { counted, startCounter } = countedStarts();
    render(<App {...emptyLabyrinth()} {...featuring()} startCounter={startCounter} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} portraitLayouts={{}} viewport={manualViewport("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...pageAtRest()} {...loadedPictures()} />);
    const card = featuredCard();

    act(() => {
      card.click();
      card.click();
    });

    expect([progressShown(), counted]).toEqual(["1/10", ["compare"]]);
  });
});

