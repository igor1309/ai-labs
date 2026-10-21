import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { HomePage, type HomeGame } from "../src/HomePage.tsx";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { careRecord } from "./careApp.tsx";
import { HOME_GAMES, badgeOf, renderHomePageFeaturing } from "./homePage.tsx";
import { TILE_COUNTS, TITLE_EMS, TITLE_TEXTS, columnGapOf, gamesWidths, linesOf, roomFor, sidesOf, tileTitles, widthOf } from "./homeTitles.ts";
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
  fakeSkeletonPicture,
  lightDevice,
  countedStarts,
  loadShownPictures,
  loadedPictures,
  manualPictures,
  manualViewport,
  memoryStorage,
  seededRandom,
  symbolOf,
  tilesRow,
  type MemoryStorage,
  unsetAgeLevel
} from "./support.ts";
import { withPictures } from "./pictures.tsx";
import { openWindow, windowsAnd } from "./windowSizes.ts";

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
  featured: HomeGame = "compare"
) {
  render(<App {...featuring(featured)} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} portraitLayouts={{}} viewport={manualViewport("landscape")} progress={progress} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...care} {...sorting} {...pairs} {...skeletons} {...dig} {...pictures} />);
  return { user: userEvent.setup(), card: featuredCard() };
}

// The home page with COMPARE's tile in the row, the large card CARE's.
function openWithCompareTile(progress = emptyProgress()) {
  const home = openHomePage(progress, loadedPictures(), emptyCare(), emptySorting(), emptyPairs(), emptySkeletons(), emptyDig(), "care");
  return { ...home, tile: homeTile("COMPARE") };
}

const withStorage = (storage: MemoryStorage) => localProgress(() => storage);

const withSorting = (storage: MemoryStorage) => ({ ...emptySorting(), sortingProgress: localSortingProgress(() => storage) });

const withSkeletons = (storage: MemoryStorage) => ({ ...emptySkeletons(), skeletonProgress: localSkeletonProgress(() => storage) });

// A stored record in the section 5 format of docs/mvp-infrastructure.md.
const record = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed: 3 } } });

// The sorting game’s Explorer best, the level a new install plays.
const sortingRecord = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "sort-dinosaurs": { bestScore, explorerBest: bestScore, paleontologistBest: null, roundsPlayed: 2 } } });

const nothing = () => {};

// The home page alone, its SORT card's taps counted in `taps`.
function renderHomePage(taps: number[]) {
  render(
    <HomePage
      language="en"
      onLanguage={nothing}
      theme="light"
      onTheme={nothing}
      ageLevel="explorer"
      onAgeLevel={nothing}
      startTimer={() => nothing}
      viewport={manualViewport("landscape")}
      upright={false}
      featured="compare"
      faceOff={{ left: fakeBodyPicture("tyrannosaurus"), right: fakeBodyPicture("brachiosaurus") }}
      best={undefined}
      catalogue={{ picture: fakeBodyPicture("stegosaurus"), count: SHIPPED_CATALOGUE.length }}
      care={{ picture: fakeBodyPicture("parasaurolophus"), best: undefined }}
      sort={{ picture: fakeBodyPicture("triceratops"), best: undefined }}
      pairs={{ picture: fakeBodyPicture("stegosaurus"), stars: undefined }}
      skeletons={{ picture: fakeSkeletonPicture("triceratops", "skeleton"), best: undefined }}
      dig={{ picture: fakeBodyPicture("stegosaurus"), dugUp: undefined }}
      moreComing={fakeBodyPicture("triceratops")}
      onCompareDinosaurs={nothing}
      onCatalogue={nothing}
      onCare={nothing}
      onSort={() => taps.push(1)}
      onPairs={nothing}
      onSkeletons={nothing}
      onMuseum={nothing}
      onDig={nothing}
    />,
    withPictures
  );
  return { user: userEvent.setup(), card: homeTile("SORT") };
}

// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

const pairsTile = () => screen.getByRole("button", { name: "FIND THE PAIR" });

const skeletonsTile = () => screen.getByRole("button", { name: "SKELETONS" });

const px = (value: string) => Number.parseFloat(value) || 0;

// The width of every column of tiles, as the row writes it.
function tileColumnWidth() {
  const columns = getComputedStyle(tilesRow()).gridAutoColumns;
  expect(columns).toMatch(/^[\d.]+px$/);
  return px(columns);
}

// The width a card has on a page `width` wide: the large card its share
// of the games, and a tile its column.
function cardWidth(card: Element, width: number) {
  const part = [...gamesWidths(width)].find(([part]) => part === card);
  return part ? part[1] : tileColumnWidth();
}

// The windows the home page's budgets keep: the shared ones, and more
// iPads'.
const HOME_WINDOWS = windowsAnd([1180, 820], [1366, 1024]);

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

describe("the home page", () => {
  it("offers the quiz as the first tile, with the app's own Tyrannosaurus and Brachiosaurus facing off", () => {
    const { tile } = openWithCompareTile();

    expect(tile).toBe(tilesRow().firstElementChild);
    expect(tile.textContent).toBe("COMPARE");
    expect(symbolsOf(tile)).toEqual(["scale"]);
    const faceOff = within(tile).getByRole("img", { name: "TWO DINOSAURS" });
    const pictures = [...faceOff.querySelectorAll("img")];
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([fakeBodyPicture("tyrannosaurus"), fakeBodyPicture("brachiosaurus")]);
  });

  it("stands every other game in equal columns of two beside the large card: ANCIENT REPTILES over FIND THE PAIR, SKELETONS over DIG, SORT over CARE, then MORE COMING, last", () => {
    const { card } = openHomePage();

    const games = card.parentElement;
    expect(games?.classList.contains("games")).toBe(true);
    const row = tilesRow();
    expect([...(games?.children ?? [])]).toEqual([card, row]);
    // The large card takes three sevenths of the width, the tiles the rest.
    expect([card, row].map((part) => getComputedStyle(part).flexGrow)).toEqual(["3", "4"]);
    const tiles = [...["ANCIENT REPTILES", "FIND THE PAIR", "SKELETONS", "DIG", "SORT", "CARE"].map(homeTile), document.querySelector(".more-coming")];
    expect([...row.children]).toEqual(tiles);
    // The tiles fill the row a column at a time, two to a column, every
    // column as wide as the others and its two tiles sharing its height,
    // MORE COMING among them.
    const style = getComputedStyle(row);
    expect([style.display, style.gridAutoFlow, style.gridTemplateRows]).toEqual(["grid", "column", "minmax(0, 1fr) minmax(0, 1fr)"]);
    expect(tileColumnWidth()).toBeGreaterThan(0);
    expect(tiles.map((tile) => getComputedStyle(tile ?? row).minHeight)).toEqual(tiles.map(() => "0px"));
    expect(tiles.map((tile) => getComputedStyle(tile ?? row).gridRow || "auto")).toEqual(tiles.map(() => "auto"));
  });

  it("only scrolls on a swipe that starts on a tile: no game opens and no tile is left pressed", () => {
    openHomePage();
    const sort = screen.getByRole("button", { name: "SORT" });

    // The browser pans the row sideways only if nothing from the tile up
    // forbids it.
    const panning: string[] = [];
    for (let element: Element | null = sort; element; element = element.parentElement) panning.push(getComputedStyle(element).touchAction || "auto");
    expect(panning.filter((action) => !["auto", "manipulation"].includes(action) && !action.split(" ").includes("pan-x"))).toEqual([]);
    expect(getComputedStyle(tilesRow()).overflowX).toBe("auto");

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
    await screen.findByRole("button", { name: "FIND THE PAIR" });
    expect(document.querySelectorAll(".games-tiles")).toHaveLength(1);
    expect(tilesRow()).not.toBe(row);
    expect(row.isConnected).toBe(false);
  });

  it("shows the games still to come as a faded Triceratops's shape over a lock, with nothing to tap, brighten or press in", async () => {
    const { user } = openHomePage();

    const tile = document.querySelector(".more-coming");
    if (!tile) throw new Error("No MORE COMING tile");
    expect(tile.tagName).toBe("DIV");
    expect(tile.querySelector("button, a, [role=button]")).toBeNull();
    expect(tile.classList.contains("card")).toBe(false);
    expect(tile.textContent).toBe("MORE COMING");
    expect(TEXTS.ru.moreComing).toBe("СКОРО ЕЩЁ");
    expect(symbolsOf(tile)).toEqual(["lock"]);
    const picture = tile.querySelector("img");
    expect(picture?.getAttribute("src")).toBe(fakeBodyPicture("triceratops"));
    expect(brightness(picture ?? tile)).toBe(0);
    expect(Number(getComputedStyle(picture ?? tile).opacity)).toBeLessThan(0.5);

    await user.hover(tile);
    expect(brightness(tile)).toBe(1);
    await user.pointer({ keys: "[TouchA>]", target: tile });
    expect(getComputedStyle(tile).transform).toBe("none");
    await user.pointer({ keys: "[/TouchA]", target: tile });
    expect(featuredCard()).toBe(tilesRow().previousElementSibling);
  });

  it.each(HOME_WINDOWS)("scrolls the tiles sideways beside a large card that stays, with the next column peeking in, in a %i by %i window", (width, height) => {
    openWindow(width, height);
    const { card } = openHomePage();

    const row = tilesRow();
    const style = getComputedStyle(row);
    expect([style.overflowX, style.overflowY]).toEqual(["auto", "hidden"]);
    // The large card is outside the row, so it stays as the tiles scroll.
    expect(row.contains(card)).toBe(false);
    const shown = (gamesWidths(width).get(row) ?? 0) - sidesOf(style);
    const column = tileColumnWidth();
    const gap = columnGapOf(style);
    const columns = Math.ceil(row.children.length / 2);
    // The columns do not all fit, and the first one that does not shows
    // at least 24px of itself at the edge.
    expect(columns * column + (columns - 1) * gap).toBeGreaterThan(shown);
    const whole = Math.floor((shown + gap) / (column + gap));
    expect(whole).toBeGreaterThanOrEqual(1);
    expect(shown - whole * (column + gap)).toBeGreaterThanOrEqual(24);
  });

  // Each tile, with its title and count; the large card featuring
  // COMPARE, then CARE, so every tile is on the page once.
  const TILE_TITLES: Array<[HomeGame, string, string]> = [
    ["compare", "COMPARE", "7"],
    ["catalogue", "ANCIENT REPTILES", String(SHIPPED_CATALOGUE.length)],
    ["pairs", "FIND THE PAIR", "120"],
    ["skeletons", "SKELETONS", "3"],
    ["dig", "DIG", "7"],
    ["sort", "SORT", "6"],
    ["care", "CARE", "8"]
  ];

  it.each(HOME_WINDOWS.flatMap(([width, height]) => (["compare", "care"] as const).map((featured) => [width, height, featured] as const)))(
    "keeps the title of every game on one line in every language in a %i by %i window, featuring %s, but FIND THE PAIR's on two at most beside its symbol, the tiles' at least 24px, MORE COMING's 20px and their counts at least 20px in the pictures' corners",
    (width, height, featured) => {
      openWindow(width, height);
      const careStorage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 8, visitsFinished: 1, friends: [] }) });
      openHomePage(
        withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })),
        loadedPictures(),
        { ...emptyCare(), careProgress: localCareProgress(() => careStorage) },
        withSorting(memoryStorage({ [PROGRESS_KEY]: sortingRecord(6) })),
        { ...emptyPairs(), pairsProgress: localPairsProgress(() => memoryStorage({ [PROGRESS_KEY]: pairsRecord({ stars: 120, level: 1, boardsOnLevel: 0, best: {}, found: [] }) })) },
        withSkeletons(keptSkeletons({ earned: ["tyrannosaurus", "triceratops", "stegosaurus"], bestScore: 3, rebuilding: [] })),
        { ...emptyDig(), digProgress: localDigProgress(() => memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { dig: { dug: SHIPPED_DIG.slice(0, 7).map(({ id }) => id), badges: [] } } }) })) },
        featured
      );
      const shown = TILE_TITLES.filter(([game]) => game !== featured);

      const titles = tileTitles();
      expect(titles.map((title) => [title.textContent, getComputedStyle(title).whiteSpace])).toEqual(
        [...shown.map(([, title]) => title).filter((title) => title !== "FIND THE PAIR"), "MORE COMING"].map((title) => [title, "nowrap"])
      );
      const overflowing = titles.flatMap((title) => {
        const style = getComputedStyle(title);
        const room = roomFor(title, (card) => cardWidth(card, width));
        const key = TITLE_TEXTS[title.className];
        // A size worked out by the browser, such as one from the tile's
        // width, cannot be read here, so a title's size is in pixels.
        if (!/^[\d.]+px$/.test(style.fontSize)) return [`${title.textContent}: a size of ${style.fontSize}`];
        return LANGUAGES.map((language) => (key ? TEXTS[language][key] : "")).flatMap((words) => {
          const ems = TITLE_EMS[words];
          if (ems === undefined) return [`${words}: no width in ems`];
          const needed = ems * px(style.fontSize) + px(style.letterSpacing) * words.length;
          return needed > room ? [`${words}: ${needed.toFixed(1)}px in ${room.toFixed(1)}px`] : [];
        });
      });
      expect(overflowing).toEqual([]);

      const tiles = shown.map(([, title]) => homeTile(title));
      expect(tiles.map((tile) => px(getComputedStyle(tile.querySelector('[class$="-tile-title"]') ?? tile).fontSize) >= 24)).toEqual(tiles.map(() => true));
      expect(px(getComputedStyle(document.querySelector(".more-coming-title") ?? document.body).fontSize)).toBeGreaterThanOrEqual(20);
      const counts = tiles.map((tile) => tile.querySelector(TILE_COUNTS));
      expect(counts.map((count) => [count?.textContent, count?.parentElement === count?.closest("button"), getComputedStyle(count ?? document.body).position])).toEqual(
        shown.map(([, , count]) => [count, true, "absolute"])
      );
      expect(counts.map((count) => px(getComputedStyle(count ?? document.body).fontSize) >= 20)).toEqual(tiles.map(() => true));
      expect(tiles.map((tile) => getComputedStyle(tile).position)).toEqual(tiles.map(() => "relative"));

      const title = pairsTile().querySelector(".pairs-tile-title");
      if (!title) throw new Error("No FIND THE PAIR title");
      expect([getComputedStyle(title).whiteSpace, title.previousElementSibling?.className]).toEqual(["normal", "pairs-tile-symbol"]);
      const size = px(getComputedStyle(title).fontSize);
      expect(size).toBeGreaterThanOrEqual(24);
      const room = roomFor(title, (card) => cardWidth(card, width));
      const spacing = px(getComputedStyle(title).letterSpacing);
      expect(
        LANGUAGES.map((language) => linesOf(TEXTS[language].pairs, size, spacing, room)).filter(
          (lines) => !Array.isArray(lines) || lines.length > 2 || lines.some((line) => widthOf(line, size, spacing) > room)
        )
      ).toEqual([]);
    }
  );

  it("offers find the pair as a tile under ANCIENT REPTILES, before SKELETONS: two cards of a Stegosaurus and a face-down card, its symbol beside its title", () => {
    openHomePage();

    const tile = pairsTile();
    // The row fills two tiles to a column: the second tile is the first
    // column's lower one, COMPARE's tile left out for the large card.
    expect([...tilesRow().children].indexOf(tile)).toBe(1);
    expect(tile.nextElementSibling).toBe(skeletonsTile());
    expect(tile.textContent).toBe("FIND THE PAIR");
    expect(symbolsOf(tile)).toEqual(["footprints", "copy"]);
    expect([...tile.querySelectorAll("img")].map((picture) => picture.getAttribute("src"))).toEqual([fakeBodyPicture("stegosaurus"), fakeBodyPicture("stegosaurus")]);
    expect(tile.querySelector(".pairs-tile-stars")).toBeNull();
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

  it("offers the skeleton game as a SKELETONS tile before DIG: the Triceratops's skeleton, a bone beside its title, and no best before a skeleton is built", () => {
    openHomePage();

    const tile = skeletonsTile();
    expect(tile.textContent).toBe("SKELETONS");
    expect(TEXTS.ru.skeletons).toBe("СКЕЛЕТЫ");
    expect(symbolsOf(tile)).toEqual(["bone"]);
    expect([...tile.querySelectorAll("img")].map((picture) => picture.getAttribute("src"))).toEqual([fakeSkeletonPicture("triceratops", "skeleton")]);
    const title = tile.querySelector(".skeletons-tile-title");
    expect(title?.previousElementSibling?.contains(tile.querySelector("svg.lucide-bone"))).toBe(true);
    expect(tile.nextElementSibling).toBe(homeTile("DIG"));
    expect(tile.querySelector(".skeletons-tile-best")).toBeNull();
  });

  it("shows the best collection score in the SKELETONS tile's picture's corner, beside a trophy", () => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), emptySorting(), emptyPairs(), withSkeletons(keptSkeletons({ earned: ["triceratops", "stegosaurus"], bestScore: 2, rebuilding: [] })));

    const tile = skeletonsTile();
    const best = tile.querySelector(".skeletons-tile-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "2"]);
    expect(best?.parentElement).toBe(tile);
    expect(tile.querySelector(".skeletons-tile-row")?.contains(best)).toBe(false);
    const [tileStyle, style] = [getComputedStyle(tile), getComputedStyle(best ?? tile)];
    expect([tileStyle.position, style.position, style.top, style.right]).toEqual(["relative", "absolute", "12px", "12px"]);
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

  it("shows the best score in the COMPARE tile's corner, over the face-off, beside a trophy", () => {
    const { tile } = openWithCompareTile(withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })));

    const best = tile.querySelector(".compare-tile-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "7"]);
    expect(best?.parentElement).toBe(tile);
    expect(tile.querySelector(".compare-tile-row")?.contains(best)).toBe(false);
    const [tileStyle, style] = [getComputedStyle(tile), getComputedStyle(best ?? tile)];
    expect([tileStyle.position, style.position, style.top, style.right]).toEqual(["relative", "absolute", "12px", "12px"]);
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

  it("offers the sorting game as a SORT card with a Triceratops beside a symbol of shapes, and no best score before a board is finished", () => {
    openHomePage();

    const sort = screen.getByRole("button", { name: "SORT" });
    expect(sort.textContent).toBe("SORT");
    expect(symbolsOf(sort)).toEqual(["shapes"]);
    expect(sort.querySelector("img")?.getAttribute("src")).toBe(fakeBodyPicture("triceratops"));
    const title = sort.querySelector(".sort-tile-title");
    expect(title?.previousElementSibling?.contains(sort.querySelector("svg.lucide-shapes"))).toBe(true);
    expect(sort.querySelector(".sort-tile-best")).toBeNull();
  });

  it("shows the sorting game's best score in the SORT card's picture's corner, beside a trophy", () => {
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), withSorting(memoryStorage({ [PROGRESS_KEY]: sortingRecord(4) })), emptyPairs(), emptySkeletons(), emptyDig(), "care");

    const sort = screen.getByRole("button", { name: "SORT" });
    const best = sort.querySelector(".sort-tile-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "4"]);
    expect(best?.parentElement).toBe(sort);
    expect(sort.querySelector(".sort-tile-row")?.contains(best)).toBe(false);
    const [cardStyle, style] = [getComputedStyle(sort), getComputedStyle(best ?? sort)];
    expect([cardStyle.position, style.position, style.top, style.right]).toEqual(["relative", "absolute", "12px", "12px"]);
    expect(homeTile("COMPARE").querySelector(".compare-tile-best")).toBeNull();
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

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
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

  it("shows the RexLab wordmark, small, in the top-left corner", () => {
    const { card } = openHomePage();

    const wordmark = screen.getByText("RexLab");
    const style = getComputedStyle(wordmark);
    expect(style.position).toBe("fixed");
    expect(style.top).toMatch(/^[\d.]+(px|rem)$/);
    expect(style.left).toMatch(/^[\d.]+(px|rem)$/);
    // Smaller than every game's name, the tiles' and the large card's: the
    // large card's name is sized down to fit DINOSAURS at 1024 px, so half
    // of it is no longer the measure of small.
    const names = [within(card).getByText("COMPARE"), ...within(tilesRow()).getAllByRole("button").map((tile) => tile.querySelector("[class$='-tile-title']"))];
    for (const name of names) {
      if (!(name instanceof HTMLElement)) throw new Error("A game has no name");
      expect(parseFloat(style.fontSize)).toBeLessThan(parseFloat(getComputedStyle(name).fontSize));
    }
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
    const user = userEvent.setup();
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it.each(QUIZ_DOORS)("shows the %s pressed before the round opens", async (_, door) => {
    const card = door();
    const user = userEvent.setup();

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it.each(QUIZ_DOORS)("starts a round of 10 questions on a tap on the %s", async (_, door) => {
    await userEvent.setup().click(door());

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
    expect(within(screen.getByRole("group", { name: "ANIMALS" })).getAllByRole("button")).toHaveLength(2);
  });
});

// The large card is given its game; each game, featured in turn, is
// shown through the home page's props, and opened through the app.
describe("the large card", () => {
  const sources = (element: Element) => [...element.querySelectorAll("img")].map((picture) => picture.getAttribute("src"));

  it.each(HOME_GAMES.flatMap(([game, key]) => [true, false].map((scored) => [game, key, scored] as const)))(
    "features %s in its tile's place, with the picture, symbol and badge its tile has when another game is featured, its name in capitals, and the other tiles in their order, scored: %s",
    async (game, key, scored) => {
      const name = TEXTS.en[key];
      const looks = (door: HTMLElement) => {
        const badge = badgeOf(door);
        return { picture: door.firstElementChild?.outerHTML, sources: sources(door), symbols: symbolsOf(door), badge: badge && [symbolOf(badge), badge.textContent] };
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
      // The same picture, drawn the same way, and the same symbols.
      expect(looks(card)).toEqual(tile);
      // The catalogue's count is always there; every other badge only once
      // there is a score.
      expect(tile.badge !== null).toBe(scored || game === "catalogue");
      expect(within(tilesRow()).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(
        HOME_GAMES.filter(([shown]) => shown !== game).map(([, shown]) => TEXTS.en[shown])
      );
      expect(screen.getAllByRole("button", { name })).toEqual([card]);

      await user.click(card);
      expect(opened).toEqual([game]);
    }
  );

  it.each(HOME_WINDOWS)(
    "fits every game's name on two lines at most in every language in a %i by %i window, in pixels larger than every tile's name",
    (width, height) => {
      openWindow(width, height);
      const overflowing = HOME_GAMES.flatMap(([game, key]) => {
        const { unmount } = renderHomePageFeaturing(game);
        const title = featuredCard().querySelector(".featured-card-title");
        if (!title) throw new Error("No name on the large card");
        const style = getComputedStyle(title);
        const size = px(style.fontSize);
        const spacing = px(style.letterSpacing);
        const room = roomFor(title, (card) => cardWidth(card, width));
        const tiles = [...tilesRow().querySelectorAll('[class$="-tile-title"]')].map((other) => px(getComputedStyle(other).fontSize));
        const found = [
          // A size worked out by the browser cannot be read here.
          ...(/^[\d.]+px$/.test(style.fontSize) ? [] : [`${game}: a size of ${style.fontSize}`]),
          ...(style.whiteSpace === "nowrap" ? [`${game}: kept on one line`] : []),
          ...(tiles.length > 0 && tiles.every((other) => size > other) ? [] : [`${game}: no larger than its tile's name`]),
          ...LANGUAGES.flatMap((language) => {
            const lines = linesOf(TEXTS[language][key], size, spacing, room);
            if (!Array.isArray(lines)) return [`${lines.missing}: no width in ems`];
            const wide = lines.filter((line) => widthOf(line, size, spacing) > room);
            return lines.length > 2 || wide.length > 0 ? [`${TEXTS[language][key]}: ${lines.join(" / ")} in ${room.toFixed(1)}px`] : [];
          })
        ];
        unmount();
        return found;
      });
      expect(overflowing).toEqual([]);
    }
  );

  // Each game, featured, opened by a double tap on the large card and by
  // a tap on its tile: what pictures it asks for and the screen it shows
  // once they have loaded.
  async function openedBy(featured: HomeGame, tap: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
    const pictures = manualPictures();
    const { container, unmount } = render(
      <App {...featuring(featured)} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} portraitLayouts={{}} viewport={manualViewport("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...pictures} />
    );
    await tap(userEvent.setup());
    const asked: string[] = [];
    for (let loading = pictures.loading(); loading.length > 0; loading = pictures.loading()) {
      asked.push(...loading);
      act(() => loading.forEach(pictures.finish));
    }
    const shown = container.innerHTML;
    unmount();
    return { asked, shown };
  }

  it.each(HOME_GAMES)("opens %s once on a double tap, as a tap on its tile does while another game is featured", async (game, key) => {
    const other = HOME_GAMES.find(([shown]) => shown !== game)?.[0] ?? game;
    const doubled = await openedBy(game, (user) => user.dblClick(featuredCard()));
    const once = await openedBy(other, (user) => user.click(homeTile(TEXTS.en[key])));

    // The home page's pictures load in the order its tiles stand.
    expect({ ...doubled, asked: [...doubled.asked].sort() }).toEqual({ ...once, asked: [...once.asked].sort() });
    expect(once.shown).not.toContain("games-tiles");
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
    render(<App {...featuring()} startCounter={startCounter} dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} portraitLayouts={{}} viewport={manualViewport("landscape")} progress={emptyProgress()} {...englishDevice()} {...lightDevice()} {...unsetAgeLevel()} {...emptyCare()} {...emptySorting()} {...emptyPairs()} {...emptySkeletons()} {...emptyDig()} {...loadedPictures()} />);
    const card = featuredCard();

    act(() => {
      card.click();
      card.click();
    });

    expect([progressShown(), counted]).toEqual(["1/10", ["compare"]]);
  });
});

