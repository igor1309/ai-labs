import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { MARKS_HEIGHT, MARKS_WIDTH } from "../src/SandWritingPicture.tsx";
import { topLine } from "./homeCorner.ts";
import { TILE_COUNTS, TITLE_EMS, gamesWidths, linesOf, roomFor, tileTitles, widthOf } from "./homeTitles.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { openMenu, outsideMenu } from "./menus.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DIG,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptySkeletons,
  emptySorting,
  englishDevice,
  fakeBodyPicture,
  featuredCard,
  featuring,
  layOutTilesRow,
  lightDevice,
  loadedPictures,
  manualViewport,
  memoryStorage,
  pageAtRest,
  seededRandom,
  swipeTiles,
  tilesRow,
  unsetAgeLevel,
  type ManualViewport,
  type MemoryStorage
} from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// home-portrait.feature, "The home page stands upright": each window,
// with the large card's height, the row's, every column's width, how much
// of the column after the last whole one shows, and whether the page
// scrolls.
const UPRIGHT = [
  [600, 800, 280, 360, 310, 210, true],
  [768, 950, 298, 360, 310, 44, false],
  [768, 1024, 363, 369, 310, 44, false],
  [744, 1060, 386, 382, 308, 24, false],
  [744, 1133, 433, 408, 308, 24, false],
  [834, 1194, 472, 430, 310, 110, false],
  [1032, 1376, 589, 495, 293, 25, false],
  [900, 1000, 348, 360, 310, 176, false],
  [712, 1000, 348, 360, 292, 24, false],
  [600, 1400, 604, 504, 310, 210, false],
  [1068, 1500, 688, 520, 305, 25, false],
  [1400, 1500, 688, 520, 310, 0, false]
] as const;

// An iPad mini upright, home-portrait.feature's "Safe areas stay clear
// upright": its rounded corners under the status bar, and its home
// indicator. An iPad upright has no inset at its sides.
const IPAD_MINI_UPRIGHT: SafeArea = { top: 24, right: 0, bottom: 20, left: 0 };

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const px = (value: string) => Number.parseFloat(value) || 0;

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

// The home page in a window `width` by `height`, its large card
// `featured`'s, in `language`, with the progress `storage` keeps, upright
// unless `viewport` stands otherwise, and with the static page's version
// footer outside the app.
function openUpright(
  width: number,
  height: number,
  { language = "en", featured = "compare", storage = memoryStorage(), viewport = manualViewport("portrait") }: { language?: Language; featured?: HomeGame; storage?: MemoryStorage; viewport?: ManualViewport } = {}
) {
  openWindow(width, height);
  const footer = Object.assign(document.createElement("footer"), { id: "version" });
  document.body.append(footer);
  onTestFinished(() => footer.remove());
  const progress = () => storage;
  render(
    <App
      {...featuring(featured)}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(7)}
      portraitLayouts={{ home: ["tall"] }}
      viewport={viewport}
      progress={localProgress(progress)}
      {...englishDevice()}
      deviceLanguage={DEVICES[language]}
      {...lightDevice()}
      {...unsetAgeLevel()}
      {...emptyCare()}
      careProgress={localCareProgress(progress)}
      {...emptySorting()}
      sortingProgress={localSortingProgress(progress)}
      {...emptyPairs()}
      pairsProgress={localPairsProgress(progress)}
      {...emptySkeletons()}
      skeletonProgress={localSkeletonProgress(progress)}
      {...emptyDig()}
      {...pageAtRest()}
      digProgress={localDigProgress(progress)}
      {...loadedPictures()}
    />
  );
  return { viewport, user: userEvent.setup() };
}

// The properties a sum reads or assumes, as the rules that match in a
// window of `size` set them, media queries' included: a rule that sets
// one to anything the sum does not model fails here.
function sized(element: Element, size: WindowSize, expected: Record<string, string>) {
  const at = styleAt(element, size);
  // jsdom writes a zero length as the stylesheet does, with or without
  // its unit.
  const set = (property: string) => (at.value(property) === "0" && expected[property]?.endsWith("px") ? "0px" : at.value(property));
  expect(Object.fromEntries(Object.keys(expected).map((property) => [property, set(property)]))).toEqual(expected);
}

// Nothing in the block's way: no margin, padding or border above or
// below.
const FLUSH = Object.fromEntries(["margin", "padding", "border"].flatMap((box) => ["top", "bottom"].map((side) => [`${box}-${side}${box === "border" ? "-width" : ""}`, "0px"])));

// Nothing beside it: no margin, padding or border to the left or right.
const FLUSH_SIDES = Object.fromEntries(["margin", "padding", "border"].flatMap((box) => ["left", "right"].map((side) => [`${box}-${side}${box === "border" ? "-width" : ""}`, "0px"])));

// Stretched across its column, as wide as the column's content: an
// automatic least width is none across a column.
const ACROSS = { width: "auto", "max-width": "none", "align-self": "auto", ...FLUSH_SIDES };

// The upright page as the browser lays it out from the stylesheet: a
// column of the greeting and the games, the games a column of the large
// card over the row, the large card growing into the height the rest
// leaves, from nothing to at least its least height, and as wide as the
// page's content. A size set any other way fails here, since this sum
// would not see it.
function uprightLayout(size: WindowSize) {
  const [width, height] = size;
  const home = part(".home");
  const greeting = part(".greeting");
  const games = part(".games");
  const card = featuredCard();
  const row = tilesRow();
  const [homeStyle, cardStyle, rowStyle] = [home, card, row].map((element) => getComputedStyle(element));
  if (!homeStyle || !cardStyle || !rowStyle) throw new Error("No style for the page");
  const inFlow = (child: Element) => getComputedStyle(child).position === "static" && getComputedStyle(child).display !== "contents";
  expect([...home.children].filter(inFlow)).toEqual([greeting, games]);
  expect([...home.querySelectorAll(".stratum")].map((band) => getComputedStyle(band).position)).toEqual(["absolute", "absolute", "absolute"]);
  expect([...games.children]).toEqual([card, row]);
  sized(home, size, {
    display: "flex",
    "flex-direction": "column",
    "align-items": "normal",
    "box-sizing": "border-box",
    width: "auto",
    "max-width": "none",
    "margin-left": "0px",
    "margin-right": "0px",
    height: "auto",
    "min-height": `${height}px`,
    "max-height": "none",
    "border-top-width": "0px",
    "border-bottom-width": "0px",
    "border-left-width": "0px",
    "border-right-width": "0px"
  });
  sized(greeting, size, { "flex-grow": "0", height: "auto", "min-height": "auto", "max-height": "none", ...FLUSH });
  sized(games, size, { display: "flex", "flex-direction": "column", "align-items": "normal", "flex-grow": "1", "flex-shrink": "0", "flex-basis": "auto", height: "auto", "min-height": "auto", "max-height": "none", "min-width": "auto", ...FLUSH, ...ACROSS });
  // The large card's padding is inside its height.
  sized(card, size, {
    "flex-grow": "1",
    "flex-shrink": "0",
    "flex-basis": "0px",
    "box-sizing": "border-box",
    height: "auto",
    "max-height": "none",
    "min-width": "0px",
    "margin-top": "0px",
    "margin-bottom": "0px",
    "border-top-width": "0px",
    "border-bottom-width": "0px",
    ...ACROSS
  });
  sized(row, size, { "flex-grow": "0", "flex-shrink": "0", "box-sizing": "content-box", "min-height": "auto", "max-height": "none", "border-top-width": "0px", "border-bottom-width": "0px" });
  // The row reaches past the games above and below by as much as its
  // own padding, which keeps the tiles' shadows.
  expect(px(rowStyle.marginTop) + px(rowStyle.paddingTop)).toBe(0);
  expect(px(rowStyle.marginBottom) + px(rowStyle.paddingBottom)).toBe(0);

  const top = px(homeStyle.paddingTop);
  const bottom = px(homeStyle.paddingBottom);
  const rowHeight = px(rowStyle.height);
  const rest = top + px(getComputedStyle(greeting).lineHeight) + styleAt(home, size).rowGap() + styleAt(games, size).rowGap() + rowHeight + bottom;
  const cardHeight = Math.max(px(cardStyle.minHeight), height - rest);
  // The row runs from the page's padding to its margin past the page's
  // other side.
  const rowStart = px(homeStyle.paddingLeft);
  const rowEnd = width - px(homeStyle.paddingRight) - px(rowStyle.marginRight);
  const shown = rowEnd - rowStart - px(rowStyle.paddingLeft) - px(rowStyle.paddingRight);
  const columnValue = styleAt(row, size).value("grid-auto-columns");
  expect(columnValue).toMatch(/^[\d.]+px$/);
  const column = px(columnValue);
  const gap = styleAt(row, size).columnGap();
  const columns = Math.ceil(row.children.length / 2);
  const whole = Math.floor((shown + gap) / (column + gap));
  return {
    card: { width: width - px(homeStyle.paddingLeft) - px(homeStyle.paddingRight), height: cardHeight },
    row: { height: rowHeight, start: rowStart, end: rowEnd, rows: rowStyle.gridTemplateRows, rowGap: styleAt(row, size).rowGap() },
    column,
    peek: whole >= columns ? 0 : shown - whole * (column + gap),
    page: rest + cardHeight,
    tilesEnd: bottom
  };
}

// Where a part fixed or placed against the page's edges stands, by its
// offsets and its own height.
const placed = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return { position: style.position, top: px(style.top), right: px(style.right), bottom: px(style.bottom), left: px(style.left), height: px(style.height) };
};

describe("the home page upright", () => {
  it.each(UPRIGHT)(
    "in a %i by %i window: the large card %i tall across the width, the row %i tall, columns %i wide with %i of the next showing, and the page scrolling: %s",
    (width, height, cardHeight, rowHeight, column, peek, scrolls) => {
      openUpright(width, height);
      const layout = uprightLayout([width, height]);

      expect(document.querySelector(".orientation-gate")?.hasAttribute("data-shown")).toBe(false);
      expect(Math.abs(layout.card.height - cardHeight)).toBeLessThanOrEqual(1);
      expect(layout.card.width).toBe(width - 112);
      expect([...featuredCard().querySelectorAll(".face-off-picture")].map((picture) => getComputedStyle(picture).objectFit)).toEqual(["contain", "contain"]);
      expect(Math.abs(layout.row.height - rowHeight)).toBeLessThanOrEqual(1);
      expect([layout.row.start, layout.row.end]).toEqual([56, width]);
      // Every tile is half of the row, less the gap between the two.
      expect([layout.row.rows, layout.row.rowGap]).toEqual(["minmax(0, 1fr) minmax(0, 1fr)", 28]);
      expect(
        [...tilesRow().children].slice(0, 2).map((tile) => within(tile as HTMLElement).queryByText(/ANCIENT REPTILES|FIND THE PAIR/)?.textContent)
      ).toEqual(["ANCIENT REPTILES", "FIND THE PAIR"]);
      expect(Math.abs(layout.column - column)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.peek - peek)).toBeLessThanOrEqual(1);
      expect(layout.page > height).toBe(scrolls);
    }
  );

  it.each(UPRIGHT.map(([width, height]) => [width, height] as const))(
    "in a %i by %i window stands RexLab and the corner on one line over the greeting, and the version footer over no tile, all scrolling with the page",
    (width, height) => {
      openUpright(width, height);
      const layout = uprightLayout([width, height]);
      const wordmark = placed(part(".wordmark"));
      const corner = placed(part(".home-corner"));
      const museum = placed(part(".home-museum"));
      const footer = placed(part("#version"));
      const greetingTop = px(getComputedStyle(part(".home")).paddingTop);

      expect([wordmark.position, corner.position, footer.position, getComputedStyle(document.body).position]).toEqual(["absolute", "absolute", "absolute", "relative"]);
      expect([getComputedStyle(part(".home-corner")).display, getComputedStyle(part(".home-corner")).alignItems]).toEqual(["flex", "center"]);
      // The corner is as tall as the museum, its tallest part.
      expect(wordmark.top + wordmark.height / 2).toBe(corner.top + museum.height / 2);
      expect(Math.max(wordmark.top + wordmark.height, corner.top + museum.height)).toBeLessThanOrEqual(greetingTop);
      // A line of the footer's small words is less than twice their size.
      expect(footer.bottom + 2 * px(getComputedStyle(part("#version")).fontSize)).toBeLessThanOrEqual(layout.tilesEnd);
    }
  );

  it("narrows its columns anew as the window is resized, and widens them back", () => {
    const { viewport } = openUpright(834, 1194);
    const column = () => uprightLayout([window.innerWidth, window.innerHeight]).column;
    expect(column()).toBe(310);

    openWindow(744, 1133);
    act(() => viewport.resize("tall", true));
    expect(column()).toBe(308);

    openWindow(1032, 1376);
    act(() => viewport.resize("tall", true));
    expect(column()).toBe(293);

    openWindow(834, 1194);
    act(() => viewport.resize("tall", true));
    expect(column()).toBe(310);
  });

  it("keeps clear of an iPad mini's safe areas at 744 by 1133, the large card shorter by them, the page still, and its background at the window's edges", () => {
    openUpright(744, 1133);
    const home = part(".home");
    const measure = () => {
      const style = getComputedStyle(home);
      return {
        layout: uprightLayout([744, 1133]),
        padding: { top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) },
        box: [style.margin, style.boxSizing, style.width, style.minHeight, style.position],
        wordmark: placed(part(".wordmark")),
        corner: placed(part(".home-corner")),
        footer: placed(part("#version"))
      };
    };
    const without = measure();
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(IPAD_MINI_UPRIGHT) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());

    const inset = measure();

    expect(inset.layout.card.height).toBe(without.layout.card.height - IPAD_MINI_UPRIGHT.top - IPAD_MINI_UPRIGHT.bottom);
    expect(inset.layout.page).toBe(1133);
    expect(inset.box).toEqual(without.box);
    // The large card, the greeting and the tiles keep inside the page's
    // padding, which adds each inset to its own.
    expect([inset.padding.top - without.padding.top, inset.padding.right - without.padding.right, inset.padding.bottom - without.padding.bottom, inset.padding.left - without.padding.left]).toEqual([
      IPAD_MINI_UPRIGHT.top,
      IPAD_MINI_UPRIGHT.right,
      IPAD_MINI_UPRIGHT.bottom,
      IPAD_MINI_UPRIGHT.left
    ]);
    expect([inset.layout.row.start, 744 - inset.layout.row.end]).toEqual([56 + IPAD_MINI_UPRIGHT.left, IPAD_MINI_UPRIGHT.right]);
    expect([inset.wordmark.top - without.wordmark.top, inset.corner.top - without.corner.top, inset.footer.bottom - without.footer.bottom]).toEqual([
      IPAD_MINI_UPRIGHT.top,
      IPAD_MINI_UPRIGHT.top,
      IPAD_MINI_UPRIGHT.bottom
    ]);
    expect([inset.layout.column, inset.layout.peek]).toEqual([without.layout.column, without.layout.peek]);
  });
});

// home-portrait.feature's "Every word fits the tightest tall windows": a
// best of 7 in COMPARE, 8 in CARE, 6 in SORT and 3 in SKELETONS, 120
// stars in FIND THE PAIR and 7 dinosaurs dug up in DIG.
const scored = () =>
  memoryStorage({
    [PROGRESS_KEY]: JSON.stringify({
      schemaVersion: 1,
      games: {
        "compare-dinosaurs": { bestScore: 7, explorerBest: 7, paleontologistBest: null, roundsPlayed: 3 },
        "dinosaur-care": { bestScore: 8, visitsFinished: 1, friends: [] },
        "sort-dinosaurs": { bestScore: 6, explorerBest: 6, paleontologistBest: null, roundsPlayed: 2 },
        "find-the-pair": { stars: 120, level: 1, boardsOnLevel: 0, best: {}, found: [] },
        "skeleton-assembly": { earned: ["tyrannosaurus", "triceratops", "stegosaurus"], bestScore: 3, rebuilding: [] },
        dig: { dug: SHIPPED_DIG.slice(0, 7).map(({ id }) => id), badges: [] }
      }
    })
  });

// Each tile's count, in the tiles' order.
const COUNTS: Record<HomeGame, string | undefined> = {
  compare: "7",
  catalogue: String(SHIPPED_CATALOGUE.length),
  pairs: "120",
  skeletons: "3",
  dig: "7",
  sandWriting: undefined,
  sort: "6",
  care: "8"
};

const TILE_ORDER: readonly HomeGame[] = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care", "sandWriting"];

// The outline's examples: the language, the window's width, 800 tall,
// and the game the large card features.
const TIGHTEST: ReadonlyArray<readonly [Language, number, HomeGame]> = [
  ["en", 600, "compare"],
  ["ru", 600, "catalogue"],
  ["ru", 600, "pairs"],
  ["ru", 677, "compare"],
  ["ru", 700, "compare"],
  ["ru", 677, "skeletons"],
  ["en", 600, "sandWriting"],
  ["ru", 600, "sandWriting"]
];

// The large card's name: its size and the lines it takes in a card
// `cardWidth` wide.
function featuredName(cardWidth: number) {
  const title = featuredCard().querySelector(".featured-card-title");
  if (!title?.textContent) throw new Error("No name on the large card");
  const style = getComputedStyle(title);
  const size = px(style.fontSize);
  const spacing = px(style.letterSpacing);
  const room = roomFor(title, () => cardWidth);
  const lines = linesOf(title.textContent, size, spacing, room);
  if (!Array.isArray(lines)) throw new Error(`${lines.missing}: no width in ems`);
  return { size, lines, wide: lines.filter((line) => widthOf(line, size, spacing) > room), wraps: style.whiteSpace !== "nowrap" };
}

describe("every word on the upright home page", () => {
  it.each(TIGHTEST)(
    "fits in %s in a %i by 800 window, featuring %s: the large card's name as at 1024 by 768 landscape, every title and count at its least, and the corner clear",
    (language, width, featured) => {
      const { viewport } = openUpright(1024, 768, { language, featured, storage: scored(), viewport: manualViewport("landscape") });
      const card = featuredCard();
      const landscape = featuredName(gamesWidths(1024).get(card) ?? Number.NaN);

      openWindow(width, 800);
      act(() => viewport.resize("tall", true));

      const home = getComputedStyle(part(".home"));
      const upright = featuredName(width - px(home.paddingLeft) - px(home.paddingRight));
      expect(upright.size).toBeGreaterThanOrEqual(landscape.size);
      expect(upright.lines.length).toBeLessThanOrEqual(landscape.lines.length);
      expect([upright.wide, upright.wraps]).toEqual([[], true]);
      const badge = card.querySelector<HTMLElement>(".featured-card-badge");
      if (featured === "sandWriting") expect(badge).toBeNull();
      else expect([badge?.parentElement, badge && getComputedStyle(badge).position, badge && getComputedStyle(badge).top, badge && getComputedStyle(badge).right]).toEqual([card, "absolute", "24px", "24px"]);

      const row = tilesRow();
      const column = styleAt(row, [width, 800]).px("grid-auto-columns");
      expect(column).toBeGreaterThan(0);
      const titles = tileTitles();
      const shown = TILE_ORDER.filter((game) => game !== featured);
      const words = (game: HomeGame) => TEXTS[language][game === "compare" ? "quizCard" : game === "catalogue" ? "catalogueTile" : game];
      // The two longer names may wrap, so they are read apart below.
      expect(titles.map((title) => title.textContent)).toEqual([...shown.filter((game) => game !== "pairs" && game !== "sandWriting").map(words), TEXTS[language].moreComing]);
      const overflowing = titles.flatMap((title) => {
        const style = getComputedStyle(title);
        const words = title.textContent ?? "";
        const least = title.className === "more-coming-title" ? 20 : 24;
        const needed = (TITLE_EMS[words] ?? Number.NaN) * px(style.fontSize) + px(style.letterSpacing) * words.length;
        const room = roomFor(title, () => column);
        return [
          ...(style.whiteSpace === "nowrap" ? [] : [`${words}: may wrap`]),
          ...(px(style.fontSize) >= least ? [] : [`${words}: ${style.fontSize}`]),
          ...(needed <= room ? [] : [`${words}: ${needed.toFixed(1)}px in ${room.toFixed(1)}px`])
        ];
      });
      expect(overflowing).toEqual([]);

      for (const title of row.querySelectorAll(".pairs-tile-title, .sand-writing-tile-title")) {
        const style = getComputedStyle(title);
        const size = px(style.fontSize);
        const spacing = px(style.letterSpacing);
        const room = roomFor(title, () => column);
        const lines = linesOf(title.textContent ?? "", size, spacing, room);
        expect(size).toBeGreaterThanOrEqual(24);
        expect(Array.isArray(lines) && lines.length <= 2 && lines.every((line) => widthOf(line, size, spacing) <= room)).toBe(true);
      }

      const counts = [...row.querySelectorAll<HTMLElement>(TILE_COUNTS)];
      expect(counts.map((count) => [count.textContent, count.parentElement === count.closest("button"), getComputedStyle(count).position, px(getComputedStyle(count).fontSize) >= 20])).toEqual(
        shown.filter((game) => COUNTS[game] !== undefined).map((game) => [COUNTS[game], true, "absolute", true])
      );

      const line = topLine(width, language);
      expect(line.museumWraps).toBe(false);
      expect(line.between).toBeGreaterThanOrEqual(line.cornerGap);
      expect(Math.max(line.cornerEnd, line.wordmarkEnd)).toBeLessThanOrEqual(line.greetingTop);
    }
  );
});

// The outline's narrowest and tallest windows, where the large card is
// tallest for its width or tallest of all.
const NARROWEST = Math.min(...UPRIGHT.map(([width]) => width));
const TALLEST = Math.max(...UPRIGHT.map(([, height]) => height));
const PICTURED = UPRIGHT.filter(([width, height]) => width === NARROWEST || height === TALLEST).flatMap(([width, height]) => TILE_ORDER.map((game) => [game, width, height] as const));

type Box = { left: number; top: number; right: number; bottom: number };

const percent = (value: string) => {
  const [, share] = /^(-?[\d.]+)%$/.exec(value) ?? [];
  if (share === undefined) throw new Error(`${value} is no share`);
  return Number(share) / 100;
};

// The footer's height in a card `cardWidth` wide: its padding, and the
// taller of the symbol and the lines the name takes.
function footerHeight(cardWidth: number, size: WindowSize) {
  const footer = part(".featured-card-footer");
  const title = part(".featured-card-title");
  const symbol = part(".featured-card-symbol");
  sized(footer, size, { display: "flex", "flex-direction": "row", "align-items": "center", "flex-grow": "0", height: "auto", "min-height": "auto", "max-height": "none", "margin-bottom": "0px", "border-top-width": "0px", "border-bottom-width": "0px" });
  sized(symbol, size, { "margin-top": "0px", "margin-bottom": "0px" });
  sized(title, size, { "margin-top": "0px", "margin-bottom": "0px", "padding-top": "0px", "padding-bottom": "0px" });
  const style = getComputedStyle(footer);
  const name = featuredName(cardWidth);
  const lineHeight = getComputedStyle(title).lineHeight;
  expect(lineHeight).toMatch(/^[\d.]+$/);
  return px(style.paddingTop) + Math.max(px(getComputedStyle(symbol).height), name.lines.length * Number(lineHeight) * name.size) + px(style.paddingBottom);
}

// The large card's picture as app.css lays it out in a window of `size`,
// on a card `card` big: the boxes it is drawn whole in, the room it
// leaves above and below its box, and where the footer under it ends.
// The card is a column of the picture and the footer inside its padding.
// The picture grows into the height they leave, or into as much of it as
// its shape keeps, and what it leaves goes to the margins set to auto, or
// under the footer where none is. One that covers its box is drawn whole
// only in a box of its shape. A size set any other way fails here, since
// these sums would not see it.
function featuredPicture(card: { width: number; height: number }, size: WindowSize) {
  const featured = featuredCard();
  const footer = part(".featured-card-footer");
  const inFlow = [...featured.children].filter((child) => getComputedStyle(child).position !== "absolute");
  const picture = inFlow[0];
  if (!(picture instanceof HTMLElement)) throw new Error("No picture on the large card");
  expect(inFlow).toEqual([picture, footer]);
  sized(featured, size, { display: "flex", "flex-direction": "column", "justify-content": "normal", "align-items": "normal", "box-sizing": "border-box", "border-top-width": "0px", "border-bottom-width": "0px", ...FLUSH_SIDES });
  const cardStyle = getComputedStyle(featured);
  const style = getComputedStyle(picture);
  // A margin above the picture, below it and above the footer: its
  // length, or the share it takes of what the picture leaves.
  const margins: [string, string, string] = [style.marginTop, style.marginBottom, getComputedStyle(footer).marginTop];
  expect(margins.filter((margin) => margin !== "auto" && !/^[\d.]+(px)?$/.test(margin))).toEqual([]);
  const footerTall = footerHeight(card.width, size);
  const room = {
    width: card.width,
    height: card.height - px(cardStyle.paddingTop) - px(cardStyle.paddingBottom) - footerTall - margins.reduce((sum, margin) => sum + px(margin), 0)
  };
  const grows = { "flex-grow": "1", "flex-shrink": "1", "flex-basis": "0px", "min-height": "0px", height: "auto" };
  const fit = style.objectFit;

  // The boxes, from the top of the picture's own box, and its height.
  const drawn = (): { boxes: Box[]; height: number } => {
    // A picture inside its padding, its shape kept within its box.
    if (picture instanceof HTMLImageElement && fit === "contain") {
      sized(picture, size, { ...grows, "max-height": "none", "box-sizing": "border-box", width: "100%", "max-width": "none", "align-self": "auto", "margin-left": "0px", "margin-right": "0px" });
      return { boxes: [{ left: px(style.paddingLeft), top: px(style.paddingTop), right: room.width - px(style.paddingRight), bottom: room.height - px(style.paddingBottom) }], height: room.height };
    }

    // A picture covering a box of its shape, centred across, no wider
    // than the card short of its margins, and no taller than its share of
    // that width, where it has one.
    if (picture instanceof HTMLImageElement && fit === "cover") {
      const shape = Number(picture.getAttribute("width")) / Number(picture.getAttribute("height"));
      sized(picture, size, { ...grows, width: "auto", "align-self": "center", "box-sizing": "content-box", "padding-top": "0px", "padding-bottom": "0px", "padding-left": "0px", "padding-right": "0px" });
      const [, across, down] = /^([\d.]+) \/ ([\d.]+)$/.exec(style.aspectRatio) ?? [];
      expect(Number(across) / Number(down)).toBe(shape);
      const sides = px(style.marginLeft);
      expect([style.marginLeft, styleAt(picture, size).value("max-width")]).toEqual([style.marginRight, `calc(100% - ${2 * sides}px)`]);
      const maxHeight = styleAt(picture, size).value("max-height");
      const [, tallShare, tallSides] = /^calc\(([\d.]+) \* \(100cqw - ([\d.]+)px\)\)$/.exec(maxHeight) ?? [];
      if (maxHeight !== "none" && (tallShare === undefined || tallSides === undefined)) throw new Error(`The large card's picture is at most ${maxHeight} tall`);
      // The card is the box the picture's cqw reads.
      if (tallShare !== undefined) sized(featured, size, { "container-type": "inline-size" });
      const height = Math.min(room.height, tallShare === undefined ? Number.POSITIVE_INFINITY : Number(tallShare) * (room.width - Number(tallSides)));
      const width = Math.min(height * shape, room.width - 2 * sides);
      expect(Math.abs(width - height * shape)).toBeLessThanOrEqual(1);
      return { boxes: [{ left: (room.width - width) / 2, top: 0, right: (room.width + width) / 2, bottom: height }], height };
    }

    // The face-off: two pictures at their shares of its room inside its
    // padding, at either end of it on its floor, each drawn inside its
    // share.
    if (picture.classList.contains("face-off")) {
      sized(picture, size, { ...grows, "max-height": "none", "box-sizing": "border-box", display: "flex", "align-items": "flex-end", "justify-content": "space-between" });
      const inside = { left: px(style.paddingLeft), top: px(style.paddingTop), right: room.width - px(style.paddingRight), bottom: room.height - px(style.paddingBottom) };
      const [first, second, ...more] = [...picture.children].map((fighter) => {
        sized(fighter, size, { "object-fit": "contain", "max-width": "none", "max-height": "none", "margin-top": "0px", "margin-bottom": "0px", ...FLUSH_SIDES });
        const fighterStyle = getComputedStyle(fighter);
        return { width: percent(fighterStyle.width) * (inside.right - inside.left), height: percent(fighterStyle.height) * (inside.bottom - inside.top) };
      });
      if (!first || !second || more.length > 0) throw new Error("The face-off is not of two pictures");
      expect(first.width + second.width).toBeLessThanOrEqual(inside.right - inside.left);
      const boxes = [
        { left: inside.left, top: inside.bottom - first.height, right: inside.left + first.width, bottom: inside.bottom },
        { left: inside.right - second.width, top: inside.bottom - second.height, right: inside.right, bottom: inside.bottom }
      ];
      return { boxes, height: room.height };
    }

    // Sand across the whole art inside its side margins, the marks at
    // their own size in its middle.
    if (picture.classList.contains("sand-writing-tile-art")) {
      sized(picture, size, { ...grows, position: "relative", overflow: "hidden", "margin-left": "20px", "margin-right": "20px" });
      const across = room.width - px(style.marginLeft) - px(style.marginRight);
      expect(MARKS_WIDTH).toBeLessThanOrEqual(across);
      expect(MARKS_HEIGHT).toBeLessThanOrEqual(room.height);
      return { boxes: [{ left: (room.width - MARKS_WIDTH) / 2, top: (room.height - MARKS_HEIGHT) / 2, right: (room.width + MARKS_WIDTH) / 2, bottom: (room.height + MARKS_HEIGHT) / 2 }], height: room.height };
    }

    // The pairs' cards, each of the card's shape and its share of the
    // art's height, or of its height and width, whichever is less, placed
    // from the art's middle by its own size and turned about its centre.
    sized(picture, size, { ...grows, "max-height": "none", position: "relative", padding: "0px", ...FLUSH_SIDES });
    const boxes = [...picture.children].map((element) => {
      sized(element, size, { position: "absolute", top: "50%", left: "50%", width: "auto", "aspect-ratio": "3 / 4", "box-sizing": "border-box", "max-height": "none", "max-width": "none", transform: "none", scale: "none", margin: "0px" });
      const turned = getComputedStyle(element);
      const tall = styleAt(element, size).value("height");
      const [, ofHeight, ofWidth] = /^min\(([\d.]+)cqh, ([\d.]+)cqw\)$/.exec(tall) ?? /^([\d.]+)%$/.exec(tall) ?? [];
      if (ofHeight === undefined) throw new Error(`The pairs' cards are ${tall} tall`);
      // The art is the box their cqh and cqw read, as their % reads it.
      if (ofWidth !== undefined) sized(picture, size, { "container-type": "size" });
      const height = Math.min((Number(ofHeight) / 100) * room.height, ofWidth === undefined ? Number.POSITIVE_INFINITY : (Number(ofWidth) / 100) * room.width);
      const width = (height * 3) / 4;
      const [x = "0%", y = "0%"] = turned.translate.split(" ");
      expect(turned.rotate).toMatch(/^none$|^-?[\d.]+deg$/);
      const turn = ((Number.parseFloat(turned.rotate) || 0) * Math.PI) / 180;
      const centre = { x: room.width / 2 + width / 2 + percent(x) * width, y: room.height / 2 + height / 2 + percent(y) * height };
      const across = (width * Math.abs(Math.cos(turn)) + height * Math.abs(Math.sin(turn))) / 2;
      const down = (width * Math.abs(Math.sin(turn)) + height * Math.abs(Math.cos(turn))) / 2;
      return { left: centre.x - across, top: centre.y - down, right: centre.x + across, bottom: centre.y + down };
    });
    return { boxes, height: room.height };
  };

  const { boxes, height } = drawn();
  const spare = room.height - height;
  const autos = margins.filter((margin) => margin === "auto").length;
  const share = (margin: string) => (margin === "auto" ? spare / autos : 0);
  const [above, below, overFooter] = margins.map((margin) => share(margin) + px(margin)) as [number, number, number];
  const top = px(cardStyle.paddingTop) + above;
  return {
    boxes: boxes.map((box) => ({ ...box, top: top + box.top, bottom: top + box.bottom })),
    // What the picture leaves, above its box and between it and the name.
    spare: { above: share(margins[0]), below: share(margins[1]) + share(margins[2]) },
    footerEnd: top + height + below + overFooter + footerTall
  };
}

describe("the large card's picture upright", () => {
  it.each(PICTURED)("shows %s's picture whole inside the large card in a %i by %i window, centred in the room it leaves, its name at the card's foot", (featured, width, height) => {
    openUpright(width, height, { featured });
    const layout = uprightLayout([width, height]);

    const picture = featuredPicture(layout.card, [width, height]);

    expect(picture.boxes.filter((box) => box.left < 0 || box.top < 0 || box.right > layout.card.width || box.bottom > layout.card.height)).toEqual([]);
    expect(Math.abs(picture.spare.above - picture.spare.below)).toBeLessThanOrEqual(1);
    expect(Math.abs(picture.footerEnd - layout.card.height)).toBeLessThanOrEqual(1);
    // The pairs' cards on their tile keep their share of its art's height.
    expect([...tilesRow().querySelectorAll(".pairs-tile-card")].map((card) => getComputedStyle(card).height)).toEqual(featured === "pairs" ? [] : ["84%", "84%", "84%"]);
  });
});

// jsdom lays nothing out, so the width of each choice's name in the
// language and theme menus is given here in ems of its face at the
// chosen one's weight, rounded up: Lexend's for English, and the iPad's
// own face for the Cyrillic names, which Lexend has no letters for. The
// age levels' are LEVEL_EMS.
const MENU_EMS: Record<string, number> = { ...LEVEL_EMS, English: 3.6, Русский: 3.9, Системная: 5.2, Светлая: 3.9, Тёмная: 3.5 };

const MENUS = { language: "languageMenu", theme: "themeMenu", "age level": "ageLevelMenu" } as const;

describe("the parents' menus upright", () => {
  it.each(Object.keys(MENUS) as Array<keyof typeof MENUS>)("open the %s menu whole inside a 600 by 800 window in Russian, each name on one line, and a tap outside closes it and opens nothing", async (name) => {
    const { user } = openUpright(600, 800, { language: "ru" });
    const label = TEXTS.ru[MENUS[name]];

    const menu = await openMenu(user, label);

    // The menu hangs under the parents' menus, its right edge on theirs,
    // which stand at the corner's right.
    const style = getComputedStyle(menu);
    expect([style.position, style.top, style.right, style.boxSizing]).toEqual(["absolute", "calc(100% + 8px)", "0px", "border-box"]);
    const corner = getComputedStyle(part(".home-corner"));
    const menus = getComputedStyle(part(".parent-menus"));
    expect(menus.position).toBe("relative");
    const right = 600 - px(corner.right) - px(corner.paddingRight);
    expect(right - px(style.width)).toBeGreaterThanOrEqual(0);
    const choices = within(menu).getAllByRole("menuitemradio");
    const rows = choices.map((choice) => px(getComputedStyle(choice).height));
    const height = px(style.paddingTop) + rows.reduce((sum, row) => sum + row, 0) + px(style.gap) * (rows.length - 1) + px(style.paddingBottom);
    const buttons = [...part(".parent-menus").querySelectorAll(".parent-menu-button")].map((button) => px(getComputedStyle(button).minHeight));
    const top = px(corner.top) + px(corner.paddingTop) + px(menus.paddingTop) + Math.max(...buttons) + px(menus.paddingBottom) + 8;
    expect(top + height).toBeLessThanOrEqual(800);

    // Each name stands on one line beside its symbol and room for the ✓,
    // which the chosen row draws.
    const room = px(style.width) - px(style.paddingLeft) - px(style.paddingRight);
    const tick = px(within(menu).getByRole("menuitemradio", { checked: true }).querySelector("svg.lucide-check")?.getAttribute("width") ?? "");
    expect(tick).toBeGreaterThan(0);
    const overflowing = choices.flatMap((choice) => {
      const row = getComputedStyle(choice);
      const symbol = choice.firstElementChild;
      const words = choice.querySelector(".parent-menu-words");
      if (!symbol || symbol === words || !words) throw new Error("A choice without its symbol or words");
      const symbolWidth = px(getComputedStyle(symbol).width) || px(symbol.getAttribute("width") ?? "");
      const wordsRoom = room - px(row.paddingLeft) - px(row.paddingRight) - symbolWidth - tick - px(row.gap) * 2;
      return [...words.children].flatMap((text) => {
        const shown = text.textContent ?? "";
        const textStyle = getComputedStyle(text);
        const width = (MENU_EMS[shown] ?? Number.NaN) * px(textStyle.fontSize) + px(textStyle.letterSpacing) * shown.length;
        return textStyle.whiteSpace === "nowrap" && width <= wordsRoom ? [] : [`${shown}: ${width.toFixed(1)}px in ${wordsRoom.toFixed(1)}px, ${textStyle.whiteSpace}`];
      });
    });
    expect(overflowing).toEqual([]);

    // The backdrop is fixed to the whole window: the corner it stands in,
    // upright on the page, has no transform or filter to pin it there.
    const backdrop = getComputedStyle(outsideMenu());
    expect([backdrop.position, backdrop.top, backdrop.right, backdrop.bottom, backdrop.left]).toEqual(["fixed", "0px", "0px", "0px", "0px"]);
    expect([corner.transform || "none", corner.filter || "none"]).toEqual(["none", "none"]);
    await user.click(outsideMenu());

    expect(screen.queryByRole("menu")).toBeNull();
    expect([featuredCard().isConnected, tilesRow().isConnected, document.querySelector(".menu-backdrop")]).toEqual([true, true, null]);
  });
});

describe("turning the window", () => {
  // turn-motion.feature's turns, there and back, are in homeTurn.test.tsx.
  it("keeps the open menu, the large card, which does not rise in again, and the column the row of tiles stood at", async () => {
    const { viewport, user } = openUpright(1180, 820, { viewport: manualViewport("landscape") });
    const card = featuredCard();
    const row = layOutTilesRow();
    const rise = getComputedStyle(card).animationName;
    const landscape = getComputedStyle(part(".games")).flexDirection;
    // Swiped so SKELETONS, the second column, stands at the row's left
    // edge.
    swipeTiles(row, 334);
    await openMenu(user, "Theme");

    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));

    expect([document.documentElement.dataset.size, document.querySelector(".orientation-gate")?.hasAttribute("data-shown")]).toEqual(["tall", false]);
    expect(getComputedStyle(part(".games")).flexDirection).toBe("column");
    expect(screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")).toBe(false);
    // The same card, never drawn anew, rises in only as it is first drawn.
    expect([featuredCard(), card.dataset.game, getComputedStyle(card).animationName]).toEqual([card, "compare", rise]);
    expect([tilesRow(), row.scrollLeft]).toEqual([row, 334]);
    expect(within(row).getAllByRole("button")[2]?.getAttribute("aria-label")).toBe("SKELETONS");

    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));

    expect(document.documentElement.dataset.size).toBe("wide");
    expect(getComputedStyle(part(".games")).flexDirection).toBe(landscape);
    expect(screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")).toBe(false);
    expect([featuredCard(), getComputedStyle(card).animationName]).toEqual([card, rise]);
    expect([tilesRow(), row.scrollLeft]).toEqual([row, 334]);
  });
});
