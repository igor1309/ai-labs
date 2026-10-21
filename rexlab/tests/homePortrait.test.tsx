import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
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
  lightDevice,
  loadedPictures,
  manualViewport,
  memoryStorage,
  seededRandom,
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
      digProgress={localDigProgress(progress)}
      {...loadedPictures()}
    />
  );
  return { viewport, user: userEvent.setup() };
}

// The upright page as the browser lays it out from the stylesheet: a
// column of the greeting and the games, the games a column of the large
// card over the row, the large card growing into the height the rest
// leaves, from nothing to at least its least height. A size set any
// other way fails here, since this sum would not see it.
function uprightLayout(size: WindowSize) {
  const [width, height] = size;
  const home = part(".home");
  const greeting = part(".greeting");
  const games = part(".games");
  const card = featuredCard();
  const row = tilesRow();
  const [homeStyle, gamesStyle, cardStyle, rowStyle] = [home, games, card, row].map((element) => getComputedStyle(element));
  if (!homeStyle || !gamesStyle || !cardStyle || !rowStyle) throw new Error("No style for the page");
  const inFlow = (child: Element) => getComputedStyle(child).position === "static" && getComputedStyle(child).display !== "contents";
  expect([...home.children].filter(inFlow)).toEqual([greeting, games]);
  expect([...home.querySelectorAll(".stratum")].map((band) => getComputedStyle(band).position)).toEqual(["absolute", "absolute", "absolute"]);
  expect([...games.children]).toEqual([card, row]);
  expect([homeStyle.display, homeStyle.flexDirection, px(homeStyle.minHeight)]).toEqual(["flex", "column", height]);
  expect([gamesStyle.display, gamesStyle.flexDirection, gamesStyle.flexGrow, gamesStyle.height]).toEqual(["flex", "column", "1", "auto"]);
  expect([cardStyle.flexGrow, cardStyle.flexBasis, cardStyle.height, rowStyle.flexGrow, rowStyle.flexShrink]).toEqual(["1", "0px", "auto", "0", "0"]);
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
        "compare-dinosaurs": { bestScore: 7, roundsPlayed: 3 },
        "dinosaur-care": { bestScore: 8, visitsFinished: 1, friends: [] },
        "sort-dinosaurs": { bestScore: 6, explorerBest: 6, paleontologistBest: null, roundsPlayed: 2 },
        "find-the-pair": { stars: 120, level: 1, boardsOnLevel: 0, best: {}, found: [] },
        "skeleton-assembly": { earned: ["tyrannosaurus", "triceratops", "stegosaurus"], bestScore: 3, rebuilding: [] },
        dig: { dug: SHIPPED_DIG.slice(0, 7).map(({ id }) => id), badges: [] }
      }
    })
  });

// Each tile's count, in the tiles' order.
const COUNTS: Record<HomeGame, string> = {
  compare: "7",
  catalogue: String(SHIPPED_CATALOGUE.length),
  pairs: "120",
  skeletons: "3",
  dig: "7",
  sort: "6",
  care: "8"
};

const TILE_ORDER: readonly HomeGame[] = ["compare", "catalogue", "pairs", "skeletons", "dig", "sort", "care"];

// The outline's examples: the language, the window's width, 800 tall,
// and the game the large card features.
const TIGHTEST: ReadonlyArray<readonly [Language, number, HomeGame]> = [
  ["en", 600, "compare"],
  ["ru", 600, "catalogue"],
  ["ru", 600, "pairs"],
  ["ru", 677, "compare"],
  ["ru", 700, "compare"],
  ["ru", 677, "skeletons"]
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
      expect([badge?.parentElement, badge && getComputedStyle(badge).position, badge && getComputedStyle(badge).top, badge && getComputedStyle(badge).right]).toEqual([card, "absolute", "24px", "24px"]);

      const row = tilesRow();
      const column = styleAt(row, [width, 800]).px("grid-auto-columns");
      expect(column).toBeGreaterThan(0);
      const titles = tileTitles();
      const shown = TILE_ORDER.filter((game) => game !== featured);
      const words = (game: HomeGame) => TEXTS[language][game === "compare" ? "quizCard" : game === "catalogue" ? "catalogueTile" : game];
      // FIND THE PAIR's title may wrap, so it is read apart below.
      expect(titles.map((title) => title.textContent)).toEqual([...shown.filter((game) => game !== "pairs").map(words), TEXTS[language].moreComing]);
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

      const pairs = row.querySelector(".pairs-tile-title");
      if (pairs) {
        const style = getComputedStyle(pairs);
        const size = px(style.fontSize);
        const spacing = px(style.letterSpacing);
        const room = roomFor(pairs, () => column);
        const lines = linesOf(pairs.textContent ?? "", size, spacing, room);
        expect(size).toBeGreaterThanOrEqual(24);
        expect(Array.isArray(lines) && lines.length <= 2 && lines.every((line) => widthOf(line, size, spacing) <= room)).toBe(true);
      }

      const counts = [...row.querySelectorAll<HTMLElement>(TILE_COUNTS)];
      expect(counts.map((count) => [count.textContent, count.parentElement === count.closest("button"), getComputedStyle(count).position, px(getComputedStyle(count).fontSize) >= 20])).toEqual(
        shown.map((game) => [COUNTS[game], true, "absolute", true])
      );

      const line = topLine(width, language);
      expect(line.museumWraps).toBe(false);
      expect(line.between).toBeGreaterThanOrEqual(line.cornerGap);
      expect(Math.max(line.cornerEnd, line.wordmarkEnd)).toBeLessThanOrEqual(line.greetingTop);
    }
  );
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
  it("keeps the open menu and the large card, which does not rise in again, and stands the row of tiles at its start", async () => {
    const { viewport, user } = openUpright(1180, 820, { viewport: manualViewport("landscape") });
    const card = featuredCard();
    const row = tilesRow();
    const rise = getComputedStyle(card).animationName;
    const landscape = getComputedStyle(part(".games")).flexDirection;
    // Swiped to MORE COMING, the last column.
    row.scrollLeft = 1000;
    await openMenu(user, "Theme");

    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));

    expect([document.documentElement.dataset.size, document.querySelector(".orientation-gate")?.hasAttribute("data-shown")]).toEqual(["tall", false]);
    expect(getComputedStyle(part(".games")).flexDirection).toBe("column");
    expect(screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")).toBe(false);
    // The same card, never drawn anew, rises in only as it is first drawn.
    expect([featuredCard(), card.dataset.game, getComputedStyle(card).animationName]).toEqual([card, "compare", rise]);
    expect([tilesRow(), row.scrollLeft]).toEqual([row, 0]);
    expect(within(row).getAllByRole("button")[0]?.getAttribute("aria-label")).toBe("ANCIENT REPTILES");

    row.scrollLeft = 1000;
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));

    expect(document.documentElement.dataset.size).toBe("wide");
    expect(getComputedStyle(part(".games")).flexDirection).toBe(landscape);
    expect(screen.getByRole("menu", { name: "Theme" }).hasAttribute("data-leaving")).toBe(false);
    expect([featuredCard(), getComputedStyle(card).animationName]).toEqual([card, rise]);
    expect([tilesRow(), row.scrollLeft]).toEqual([row, 0]);
  });
});
