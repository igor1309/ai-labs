import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { PEEK, SHORT_ROW_COLUMNS, SHORT_TILE_GAP, shortTileColumn } from "../src/tileColumns.ts";
import { topLine } from "./homeCorner.ts";
import { TITLE_EMS, linesOf, roomFor, tileTitles, widthOf } from "./homeTitles.ts";
import {
  SHIPPED_CATALOGUE,
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
  pageAtRest,
  seededRandom,
  tilesRow,
  unsetAgeLevel,
  type MemoryStorage,
} from "./support.ts";
import { openWindow, sizedStyle, styleAt } from "./windowSizes.ts";

// iPhones on their side, full screen from the home screen: the smallest,
// a common one and the largest.
const PHONES = [
  [667, 375],
  [852, 393],
  [932, 430],
] as const;

const GAMES: HomeGame[] = ["compare", "catalogue", "care", "sort", "pairs", "skeletons", "dig", "sandWriting"];

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

// The greeting's width in ems of its bold face, measured as the titles'
// are: Lexend's for the Latin words, the iPhone's own for the Cyrillic.
const GREETING_EMS: Record<Language, number> = { en: 7.0, ru: 6.9 };

// The least height of a row of tiles, as upright on the smallest phone.
const LEAST_TILE_ROW = 122;

const px = (value: string) => Number.parseFloat(value) || 0;

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

// The home page in a wide-short window `width` by `height`, its large
// card `featured`'s, in `language`.
function openShort(width: number, height: number, { language = "en", featured = "compare", storage = memoryStorage() }: { language?: Language; featured?: HomeGame; storage?: MemoryStorage } = {}) {
  openWindow(width, height);
  const footer = Object.assign(document.createElement("footer"), {
    id: "version",
  });
  document.body.append(footer);
  onTestFinished(() => footer.remove());
  const viewport = manualViewport("landscape");
  viewport.resize("wide-short", false);
  const progress = () => storage;
  render(
    <App
      {...featuring(featured)}
      portraitLayouts={{}}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(7)}
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
    />,
  );
  return viewport;
}

// The page's parts across a window `width` wide, as its rules set them:
// the content between the sides, the large card's width and the tiles'
// row, which reaches past the right side, and each column in it.
function across(width: number, height: number) {
  const at = (selector: string) => styleAt(part(selector), [width, height]);
  const home = at(".home");
  const games = at(".games");
  const tiles = at(".games-tiles");
  const content = width - home.px("padding-left") - home.px("padding-right");
  const shared = content - games.columnGap();
  const card = shared / 2;
  const row = shared / 2 - tiles.px("margin-right");
  const gap = tiles.columnGap();
  const column = shortTileColumn(row);
  return { home, games, tiles, card, row, gap, column };
}

describe("the home page in a wide-short window", () => {
  it.each(PHONES)("keeps the landscape row in a %i by %i window, with no ask to turn, on 20-pixel sides", (width, height) => {
    openShort(width, height);
    expect(document.documentElement.dataset.size).toBe("wide-short");
    expect(document.querySelector(".orientation-gate[data-shown]")).toBeNull();
    const { home, games } = across(width, height);
    expect([home.px("padding-top"), home.px("padding-right"), home.px("padding-bottom"), home.px("padding-left"), home.rowGap()]).toEqual([8, 20, 20, 20, 12]);
    expect([games.value("flex-direction") || "row", [...part(".games").children]]).toEqual(["row", [featuredCard(), part(".games-tiles")]]);
  });

  it.each((["en", "ru"] as const).flatMap((language) => PHONES.map(([width, height]) => [language, width, height] as const)))("puts RexLab's mark, the greeting and the corner on one 60-pixel bar in %s at %i by %i", (language, width, height) => {
    openShort(width, height, { language });
    const line = topLine(width, language, { wordsHidden: true });
    const home = styleAt(part(".home"), [width, height]);
    const greeting = styleAt(part(".greeting"), [width, height]);
    // The bar's line: the corner's and the mark's, and the greeting's.
    expect([line.cornerEnd, line.wordmarkEnd, home.px("padding-top") + greeting.px("line-height")]).toEqual([68, 68, 68]);
    // Along it: the mark, then the greeting, then the corner, each at
    // least the corner's gap from the next.
    const wordmark = styleAt(part(".wordmark"), [width, height]);
    const markEnd = wordmark.px("left") + styleAt(part(".wordmark-mark"), [width, height]).px("width");
    const greetingStart = home.px("padding-left") + greeting.px("padding-left");
    const words = TEXTS[language].greeting;
    const greetingEnd = greetingStart + GREETING_EMS[language] * greeting.px("font-size") + greeting.px("letter-spacing") * words.length;
    const cornerStart = markEnd + line.between;
    expect(greetingStart - markEnd).toBeGreaterThanOrEqual(line.cornerGap);
    expect(cornerStart - greetingEnd).toBeGreaterThanOrEqual(line.cornerGap);
  });

  it("names RexLab and the museum for screen readers while showing their symbols alone, every tap at least 44 pixels", () => {
    openShort(667, 375);
    for (const word of [screen.getByText("RexLab"), screen.getByText(TEXTS.en.museum)]) {
      expect(getComputedStyle(word).position).toBe("absolute");
      expect(getComputedStyle(word).clipPath).toBe("inset(50%)");
    }
    const museum = styleAt(part(".home-museum"), [667, 375]);
    expect([museum.px("min-width"), museum.px("height")]).toEqual([60, 60]);
    for (const button of document.querySelectorAll(".parent-menu-button")) {
      expect([px(getComputedStyle(button).minWidth), px(getComputedStyle(button).minHeight)]).toEqual([44, 44]);
    }
  });

  it.each(PHONES)("fills the height the bar leaves with the games in a %i by %i window, each row of tiles tall enough to tap", (width, height) => {
    openShort(width, height);
    const { home, games, tiles } = across(width, height);
    const room = styleAt(part(".greeting"), [width, height]).px("line-height");
    const left = height - home.px("padding-top") - room - home.rowGap() - home.px("padding-bottom");
    // The page is a column the window's height at least, and the games
    // grow into what the bar leaves of it, never under their least.
    expect([home.value("display"), home.value("flex-direction"), home.px("min-height")]).toEqual(["flex", "column", height]);
    expect([games.value("height"), games.value("flex")]).toEqual(["auto", "1 0 260px"]);
    expect(left).toBeGreaterThanOrEqual(260);
    expect((left - tiles.rowGap()) / 2).toBeGreaterThanOrEqual(LEAST_TILE_ROW);
  });

  it("scrolls the page rather than squeeze the tiles in a window shorter than they need", () => {
    openShort(667, 320);
    const { games, tiles } = across(667, 320);
    expect(games.value("flex")).toBe("1 0 260px");
    expect((260 - tiles.rowGap()) / 2).toBeGreaterThanOrEqual(LEAST_TILE_ROW);
  });

  it.each(PHONES)("shows a column of tiles whole and the next peeking in, in a %i by %i window", (width, height) => {
    openShort(width, height);
    const { tiles, row, gap, column } = across(width, height);
    expect([featuredCard(), part(".games-tiles")].map((side) => styleAt(side, [width, height]).value("flex"))).toEqual(["1 1 0px", "1 1 0px"]);
    expect(tiles.value("grid-auto-columns")).toMatch(/^calc\(/);
    expect(gap).toBe(16);
    const peek = row - (column + gap);
    expect(peek).toBeGreaterThanOrEqual(PEEK);
    expect(peek).toBeLessThanOrEqual(column - PEEK);
  });

  it.each((["en", "ru"] as const).flatMap((language) => PHONES.flatMap(([width, height]) => GAMES.map((featured) => [language, width, height, featured] as const))))(
    "fits every word in %s at %i by %i, featuring %s",
    (language, width, height, featured) => {
      openShort(width, height, { language, featured });
      const styleOf = (element: Element) => sizedStyle(element, [width, height]);
      const { card, column } = across(width, height);
      const title = featuredCard().querySelector(".featured-card-title");
      if (!title?.textContent) throw new Error("No name on the large card");
      const style = styleOf(title);
      const size = px(style.fontSize);
      const room = roomFor(title, () => card, styleOf);
      const lines = linesOf(title.textContent, size, px(style.letterSpacing), room);
      if (!Array.isArray(lines)) throw new Error(`${lines.missing}: no width in ems`);
      expect(lines.filter((line) => widthOf(line, size, px(style.letterSpacing)) > room)).toEqual([]);

      const wrapping = ".pairs-tile-title, .sand-writing-tile-title, .catalogue-tile-title";
      const overflowing = tileTitles()
        .filter((tile) => !tile.matches(wrapping))
        .flatMap((tile) => {
          const tileStyle = styleOf(tile);
          const words = tile.textContent ?? "";
          const needed = (TITLE_EMS[words] ?? Number.NaN) * px(tileStyle.fontSize) + px(tileStyle.letterSpacing) * words.length;
          const tileRoom = roomFor(tile, () => column, styleOf);
          if (tileStyle.whiteSpace !== "nowrap") return [`${words}: may wrap`];
          return needed <= tileRoom ? [] : [`${words}: ${needed.toFixed(1)}px in ${tileRoom.toFixed(1)}px`];
        });
      expect(overflowing).toEqual([]);
      for (const tile of tilesRow().querySelectorAll(wrapping)) {
        const tileStyle = styleOf(tile);
        expect(tileStyle.whiteSpace).not.toBe("nowrap");
        const tileRoom = roomFor(tile, () => column, styleOf);
        const tileLines = linesOf(tile.textContent ?? "", px(tileStyle.fontSize), px(tileStyle.letterSpacing), tileRoom);
        expect(Array.isArray(tileLines) && tileLines.length <= 2 && tileLines.every((line) => widthOf(line, px(tileStyle.fontSize), px(tileStyle.letterSpacing)) <= tileRoom)).toBe(true);
      }
    },
  );

  it.each(PHONES)("opens each parents' menu whole under the bar in a %i by %i window", (width, height) => {
    openShort(width, height);
    const list = () => document.querySelector(".parent-menu-list");
    for (const button of document.querySelectorAll(".parent-menu-button")) {
      fireEvent.click(button);
      const opened = list();
      if (!opened) throw new Error("A parents' menu did not open");
      const style = styleAt(opened, [width, height]);
      const rows = opened.querySelectorAll(".parent-menu-choice");
      const rowHeight = styleAt(rows[0]!, [width, height]).px("height");
      const tall = style.px("padding-top") + style.px("padding-bottom") + rows.length * rowHeight + (rows.length - 1) * style.rowGap();
      const top = 8 + 60 + 8;
      expect(top + tall).toBeLessThanOrEqual(height);
      fireEvent.click(button);
    }
  });

  it("goes back to the iPad's layout when the window grows past 600 tall", () => {
    const viewport = openShort(852, 393);
    openWindow(1180, 820);
    act(() => viewport.resize("wide", false));
    expect(document.documentElement.dataset.size).toBe("wide");
    expect(getComputedStyle(screen.getByText("RexLab")).position).not.toBe("absolute");
  });
});
