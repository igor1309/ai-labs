import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import { HomePage } from "../src/HomePage.tsx";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localPairsProgress, localProgress, localSortingProgress } from "../src/localProgress.ts";
import { NO_PAIRS } from "../src/pairs/progress.ts";
import { careRecord } from "./careApp.tsx";
import { openMenu, outsideMenu } from "./menus.ts";
import { pairsRecord } from "./pairsApp.tsx";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyPairs,
  emptyProgress,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  lightDevice,
  loadedPictures,
  manualPictures,
  manualOrientation,
  memoryStorage,
  seededRandom,
  symbolOf,
  type MemoryStorage
} from "./support.ts";

function openHomePage(progress = emptyProgress(), pictures = loadedPictures(), care = emptyCare(), sorting = emptySorting(), pairs = emptyPairs()) {
  render(<App dinosaurs={SHIPPED_DINOSAURS} catalogue={SHIPPED_CATALOGUE} bodyPicture={fakeBodyPicture} random={seededRandom(7)} orientation={manualOrientation("landscape")} progress={progress} {...englishDevice()} {...lightDevice()} {...care} {...sorting} {...pairs} {...pictures} />);
  return { user: userEvent.setup(), card: screen.getByRole("button", { name: "COMPARE" }) };
}

const withStorage = (storage: MemoryStorage) => localProgress(() => storage);

const withSorting = (storage: MemoryStorage) => ({ ...emptySorting(), sortingProgress: localSortingProgress(() => storage) });

// A stored record in the section 5 format of docs/mvp-infrastructure.md.
const record = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore, roundsPlayed: 3 } } });

// The same record, for the sorting game.
const sortingRecord = (bestScore: number | null) =>
  JSON.stringify({ schemaVersion: 1, games: { "sort-dinosaurs": { bestScore, roundsPlayed: 2 } } });

const nothing = () => {};

// The home page alone, its SORT card's taps counted in `taps`.
function renderHomePage(taps: number[]) {
  render(
    <HomePage
      language="en"
      onLanguage={nothing}
      theme="light"
      onTheme={nothing}
      faceOff={{ left: fakeBodyPicture("tyrannosaurus"), right: fakeBodyPicture("brachiosaurus") }}
      best={undefined}
      catalogue={{ picture: fakeBodyPicture("stegosaurus"), count: SHIPPED_CATALOGUE.length }}
      care={{ picture: fakeBodyPicture("parasaurolophus"), best: undefined }}
      sort={{ picture: fakeBodyPicture("triceratops"), best: undefined }}
      pairs={{ picture: fakeBodyPicture("stegosaurus"), stars: undefined }}
      moreComing={fakeBodyPicture("triceratops")}
      onCompareDinosaurs={nothing}
      onCatalogue={nothing}
      onCare={nothing}
      onSort={() => taps.push(1)}
      onPairs={nothing}
    />
  );
  return { user: userEvent.setup(), card: screen.getByRole("button", { name: "SORT" }) };
}

// The name of every symbol an element shows, in order.
const symbolsOf = (element: Element) =>
  [...element.querySelectorAll("svg.lucide")].map((svg) => [...svg.classList].find((name) => name.startsWith("lucide-"))?.slice("lucide-".length));

const pairsTile = () => screen.getByRole("button", { name: "FIND THE PAIR" });

// jsdom lays nothing out, so the width of each title in every language
// is given here in ems of its bold face, rounded up: Lexend's for the
// Latin words, and the iPad's own face for the Cyrillic ones, which
// Lexend has no letters for. A title missing here fails the test that
// reads it.
const TITLE_EMS: Record<string, number> = {
  COMPARE: 5.1,
  СРАВНИ: 4.1,
  "ALL DINOSAURS": 8.6,
  ВСЕ: 2.1,
  CARE: 2.8,
  ПОЗАБОТЬСЯ: 6.9,
  SORT: 2.9,
  РАЗЛОЖИ: 5.2,
  // FIND THE PAIR's title may wrap, so each line it may take is here.
  "FIND THE PAIR": 8.1,
  "FIND THE": 5.2,
  "THE PAIR": 5.1,
  FIND: 2.8,
  THE: 2.1,
  PAIR: 2.7,
  "НАЙДИ ПАРУ": 6.6,
  НАЙДИ: 3.7,
  ПАРУ: 2.7,
  "MORE COMING": 7.9,
  "СКОРО ЕЩЁ": 6.0
};

// The words each title on the home page shows.
const TITLE_TEXTS: Record<string, "quizCard" | "catalogueTile" | "care" | "sort" | "moreComing"> = {
  "quiz-card-title": "quizCard",
  "catalogue-tile-title": "catalogueTile",
  "care-tile-title": "care",
  "sort-tile-title": "sort",
  "more-coming-title": "moreComing"
};

const px = (value: string) => Number.parseFloat(value) || 0;

// jsdom keeps a gap as it is written, unexpanded.
const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");

const sidesOf = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);

// The tiles' row of the home page, beside COMPARE.
const tilesRow = () => {
  const row = document.querySelector(".games-tiles");
  if (!row) throw new Error("No tiles beside COMPARE");
  return row;
};

// The widths COMPARE and the tiles' row take on a page `width` wide: they
// grow from nothing by their shares of what the page's padding, the gap
// and their own sides leave.
function gamesWidths(width: number) {
  const home = document.querySelector(".home");
  const games = document.querySelector(".games");
  if (!home || !games) throw new Error("No games on the page");
  const parts = [...games.children].map((part) => ({ part, style: getComputedStyle(part) }));
  expect(parts.map(({ style }) => [style.flexBasis, style.minWidth])).toEqual(parts.map(() => ["0px", "0px"]));
  const free = width - sidesOf(getComputedStyle(home)) - columnGapOf(getComputedStyle(games)) * (parts.length - 1) - parts.reduce((sum, { style }) => sum + sidesOf(style), 0);
  const shares = parts.reduce((sum, { style }) => sum + Number(style.flexGrow), 0);
  return new Map(parts.map(({ part, style }) => [part, (free * Number(style.flexGrow)) / shares + sidesOf(style)]));
}

// The width of every column of tiles, as the row writes it.
function tileColumnWidth() {
  const columns = getComputedStyle(tilesRow()).gridAutoColumns;
  expect(columns).toMatch(/^[\d.]+px$/);
  return px(columns);
}

// The width a card has on a page `width` wide: COMPARE its share of the
// games, and a tile its column.
function cardWidth(card: Element, width: number) {
  const part = [...gamesWidths(width)].find(([part]) => part === card);
  return part ? part[1] : tileColumnWidth();
}

// The width a title has on a page `width` wide: its card's width, short
// of the sides of the card and the row, and of the row's other parts and
// the gaps between them.
function roomFor(title: Element, width: number) {
  const row = title.parentElement;
  const card = title.closest("button, .more-coming");
  if (!row || !card) throw new Error("A title outside the games");
  const others = [...row.children].filter((child) => child !== title);
  return (
    cardWidth(card, width) -
    sidesOf(getComputedStyle(card)) -
    sidesOf(getComputedStyle(row)) -
    // A symbol drawn straight into the row is as wide as it is drawn.
    others.reduce((sum, other) => sum + (px(getComputedStyle(other).width) || px(other.getAttribute("width") ?? "")), 0) -
    columnGapOf(getComputedStyle(row)) * others.length
  );
}

// The lines `words` wrap onto in `room` at `size`, a word at a time, or
// the line whose width in ems is missing here.
function linesOf(words: string, size: number, room: number): string[] | { missing: string } {
  const lines: string[] = [];
  for (const word of words.split(" ")) {
    const last = lines.at(-1);
    const joined = last === undefined ? word : `${last} ${word}`;
    const ems = TITLE_EMS[joined];
    if (ems === undefined) return { missing: joined };
    if (last !== undefined && ems * size <= room) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  const missing = lines.find((line) => TITLE_EMS[line] === undefined);
  return missing === undefined ? lines : { missing };
}

const brightness = (element: Element) => {
  const match = /brightness\(([\d.]+)\)/.exec(getComputedStyle(element).filter);
  return match?.[1] === undefined ? 1 : Number(match[1]);
};

describe("the home page", () => {
  it("offers the quiz as a card with the app's own Tyrannosaurus and Brachiosaurus facing off", () => {
    const { card } = openHomePage();

    expect(card.textContent).toBe("COMPARE");
    expect(symbolOf(card)).toBe("scale");
    const faceOff = within(card).getByRole("img", { name: "TWO DINOSAURS" });
    const pictures = [...faceOff.querySelectorAll("img")];
    expect(pictures.map((picture) => picture.getAttribute("src"))).toEqual([fakeBodyPicture("tyrannosaurus"), fakeBodyPicture("brachiosaurus")]);
  });

  it("stands the other games beside COMPARE in equal columns of two: ALL DINOSAURS over CARE, SORT over FIND THE PAIR, then MORE COMING", () => {
    const { card } = openHomePage();

    const games = card.parentElement;
    expect(games?.classList.contains("games")).toBe(true);
    const row = tilesRow();
    expect([...(games?.children ?? [])]).toEqual([card, row]);
    // COMPARE takes three sevenths of the width, the tiles the rest.
    expect([card, row].map((part) => getComputedStyle(part).flexGrow)).toEqual(["3", "4"]);
    const tiles = [...["ALL DINOSAURS", "CARE", "SORT", "FIND THE PAIR"].map((name) => screen.getByRole("button", { name })), document.querySelector(".more-coming")];
    expect([...row.children]).toEqual(tiles);
    // The tiles fill the row a column at a time, two to a column, every
    // column as wide as the others and its two tiles sharing its height.
    const style = getComputedStyle(row);
    expect([style.display, style.gridAutoFlow, style.gridTemplateRows]).toEqual(["grid", "column", "minmax(0, 1fr) minmax(0, 1fr)"]);
    expect(tileColumnWidth()).toBeGreaterThan(0);
    expect(tiles.map((tile) => getComputedStyle(tile ?? row).minHeight)).toEqual(tiles.map(() => "0px"));
  });

  it("shows the games still to come as a faded Triceratops's shape over a lock, with nothing to tap, brighten or press in", async () => {
    const { user } = openHomePage();

    const tile = document.querySelector(".more-coming");
    if (!tile) throw new Error("No MORE COMING tile");
    expect(tile.tagName).toBe("DIV");
    expect(tile.querySelector("button, a, [role=button]")).toBeNull();
    expect(tile.classList.contains("card")).toBe(false);
    expect(tile.textContent).toBe("MORE COMING");
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
    expect(screen.getByRole("button", { name: "COMPARE" })).toBe(tilesRow().previousElementSibling);
  });

  it.each([1024, 1180, 1366])("scrolls the tiles sideways beside a COMPARE that stays, with the next column peeking in, at %ipx wide", (width) => {
    const { card } = openHomePage();

    const row = tilesRow();
    const style = getComputedStyle(row);
    expect([style.overflowX, style.overflowY]).toEqual(["auto", "hidden"]);
    // COMPARE is outside the row, so it stays as the tiles scroll.
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

  it.each([1024, 1180, 1366])(
    "keeps the title of every game on one line in every language at %ipx wide, but FIND THE PAIR's on two at most beside its symbol, the tiles' at least 24px, MORE COMING's 20px and their counts at least 20px in the pictures' corners",
    (width) => {
      const careStorage = memoryStorage({ [PROGRESS_KEY]: careRecord({ bestScore: 7, visitsFinished: 1, friends: [] }) });
      openHomePage(
        withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })),
        loadedPictures(),
        { ...emptyCare(), careProgress: localCareProgress(() => careStorage) },
        withSorting(memoryStorage({ [PROGRESS_KEY]: sortingRecord(10) })),
        { ...emptyPairs(), pairsProgress: localPairsProgress(() => memoryStorage({ [PROGRESS_KEY]: pairsRecord({ ...NO_PAIRS, stars: 3 }) })) }
      );

      const titles = [...document.querySelectorAll(Object.keys(TITLE_TEXTS).map((name) => `.${name}`).join(", "))];
      expect(titles.map((title) => [title.textContent, getComputedStyle(title).whiteSpace])).toEqual([
        ["COMPARE", "nowrap"],
        ["ALL DINOSAURS", "nowrap"],
        ["CARE", "nowrap"],
        ["SORT", "nowrap"],
        ["MORE COMING", "nowrap"]
      ]);
      const overflowing = titles.flatMap((title) => {
        const style = getComputedStyle(title);
        const room = roomFor(title, width);
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

      const tiles = ["ALL DINOSAURS", "CARE", "SORT", "FIND THE PAIR"].map((name) => screen.getByRole("button", { name }));
      expect(tiles.map((tile) => px(getComputedStyle(tile.querySelector('[class$="-tile-title"]') ?? tile).fontSize) >= 24)).toEqual([true, true, true, true]);
      expect(px(getComputedStyle(document.querySelector(".more-coming-title") ?? document.body).fontSize)).toBeGreaterThanOrEqual(20);
      const counts = tiles.map((tile) => tile.querySelector(".catalogue-tile-count, .care-tile-best, .sort-tile-best, .pairs-tile-stars"));
      expect(counts.map((count) => [count?.textContent, count?.parentElement === count?.closest("button"), getComputedStyle(count ?? document.body).position])).toEqual([
        [String(SHIPPED_CATALOGUE.length), true, "absolute"],
        ["7", true, "absolute"],
        ["10", true, "absolute"],
        ["3", true, "absolute"]
      ]);
      expect(counts.map((count) => px(getComputedStyle(count ?? document.body).fontSize) >= 20)).toEqual([true, true, true, true]);
      expect(tiles.map((tile) => getComputedStyle(tile).position)).toEqual(["relative", "relative", "relative", "relative"]);

      const title = pairsTile().querySelector(".pairs-tile-title");
      if (!title) throw new Error("No FIND THE PAIR title");
      expect([getComputedStyle(title).whiteSpace, title.previousElementSibling?.className]).toEqual(["normal", "pairs-tile-symbol"]);
      const size = px(getComputedStyle(title).fontSize);
      expect(size).toBeGreaterThanOrEqual(24);
      const room = roomFor(title, width);
      expect(LANGUAGES.map((language) => linesOf(TEXTS[language].pairs, size, room)).filter((lines) => !Array.isArray(lines) || lines.length > 2 || lines.some((line) => (TITLE_EMS[line] ?? 0) * size > room))).toEqual([]);
    }
  );

  it("offers find the pair as a tile under SORT: two cards of a Stegosaurus and a face-down card, its symbol beside its title", () => {
    openHomePage();

    const tile = pairsTile();
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

  it("shows the best score in the quiz card's corner, over the face-off, beside a trophy", () => {
    const { card } = openHomePage(withStorage(memoryStorage({ [PROGRESS_KEY]: record(7) })));

    const best = card.querySelector(".quiz-card-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "7"]);
    expect(best?.parentElement).toBe(card);
    expect(card.querySelector(".quiz-card-footer")?.contains(best)).toBe(false);
    const [cardStyle, style] = [getComputedStyle(card), getComputedStyle(best ?? card)];
    expect([cardStyle.position, style.position]).toEqual(["relative", "absolute"]);
    expect([style.top, style.right]).toEqual(["24px", "24px"]);
  });

  it.each([
    ["no round finished yet", memoryStorage()],
    ["no best kept", memoryStorage({ [PROGRESS_KEY]: record(null) })],
    ["storage that cannot be read", memoryStorage({ [PROGRESS_KEY]: record(7) }, { read: false })]
  ])("shows no best score on the quiz card with %s", (_, storage) => {
    const { card } = openHomePage(withStorage(storage));

    expect(card.querySelector(".quiz-card-best")).toBeNull();
    expect(symbolsOf(card)).toEqual(["scale"]);
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
    openHomePage(emptyProgress(), loadedPictures(), emptyCare(), withSorting(memoryStorage({ [PROGRESS_KEY]: sortingRecord(4) })));

    const sort = screen.getByRole("button", { name: "SORT" });
    const best = sort.querySelector(".sort-tile-best");
    expect(best && [symbolOf(best), best.textContent]).toEqual(["trophy", "4"]);
    expect(best?.parentElement).toBe(sort);
    expect(sort.querySelector(".sort-tile-row")?.contains(best)).toBe(false);
    const [cardStyle, style] = [getComputedStyle(sort), getComputedStyle(best ?? sort)];
    expect([cardStyle.position, style.position, style.top, style.right]).toEqual(["relative", "absolute", "12px", "12px"]);
    expect(screen.getByRole("button", { name: "COMPARE" }).querySelector(".quiz-card-best")).toBeNull();
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
    expect(parseFloat(style.fontSize)).toBeLessThan(parseFloat(getComputedStyle(within(card).getByText("COMPARE")).fontSize) / 2);
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

  it("brightens the quiz card under a pointer", async () => {
    const { user, card } = openHomePage();
    expect(brightness(card)).toBe(1);

    await user.hover(card);
    expect(brightness(card)).toBeGreaterThan(1);

    await user.unhover(card);
    expect(brightness(card)).toBe(1);
  });

  it("shows the card pressed before the round opens", async () => {
    const { user, card } = openHomePage();

    await user.pointer({ keys: "[TouchA>]", target: card });

    expect(getComputedStyle(card).transform).toMatch(/^scale\(0\.\d+\)$/);
    expect(screen.queryByLabelText("PROGRESS")).toBeNull();

    await user.pointer({ keys: "[/TouchA]", target: card });

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
  });

  it("starts a round of 10 questions on a tap", async () => {
    const { user, card } = openHomePage();

    await user.click(card);

    expect(screen.getByLabelText("PROGRESS").textContent).toBe("1/10");
    expect(within(screen.getByRole("group", { name: "DINOSAURS" })).getAllByRole("button")).toHaveLength(2);
  });
});

describe("the first question of a round", () => {
  const progressShown = () => screen.queryByLabelText("PROGRESS")?.textContent;
  const picturesShown = () =>
    within(screen.getByRole("group", { name: "DINOSAURS" }))
      .getAllByRole("img")
      .map((picture) => picture.getAttribute("src"));

  it("waits for its pictures, with the home page on screen until both have loaded", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);

    await user.click(card);

    const asked = pictures.loading();
    expect(asked).toHaveLength(2);
    expect(pictures.timers()).toEqual([1000]);
    act(() => pictures.finish(asked[0] ?? ""));
    expect(progressShown()).toBeUndefined();
    expect(screen.getByRole("button", { name: "COMPARE" })).toBeDefined();

    act(() => pictures.finish(asked[1] ?? ""));

    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
    expect(pictures.timers()).toEqual([]);
  });

  it("starts after a second when its pictures are slow, and not again when they arrive", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);
    await user.click(card);
    const asked = pictures.loading();

    act(() => pictures.fire(1000));

    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
    const first = document.body.innerHTML;
    act(() => asked.forEach(pictures.finish));
    expect(document.body.innerHTML).toBe(first);
  });

  it("starts one round on a quick double tap while its pictures load", async () => {
    const pictures = manualPictures();
    const { user, card } = openHomePage(emptyProgress(), pictures);

    await user.dblClick(card);

    const asked = pictures.loading();
    expect(asked).toHaveLength(2);
    expect(pictures.timers()).toEqual([1000]);
    act(() => asked.forEach(pictures.finish));
    expect(progressShown()).toBe("1/10");
    expect(picturesShown()).toEqual(asked);
  });
});
