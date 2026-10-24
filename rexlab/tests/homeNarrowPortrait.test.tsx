import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PROGRESS_KEY, localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { PEEK, TILE_GAP, tileColumnWidth } from "../src/tileColumns.ts";
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
  type MemoryStorage
} from "./support.ts";
import { openWindow, sizedStyle, styleAt } from "./windowSizes.ts";

// The home page's tiles and the games still to come, in columns of two.
const COLUMNS = 4;

// iPhones upright: one with its display zoomed, or a window in Slide
// Over, the smallest iPhone, and the common ones.
const PHONES = [
  [320, 568],
  [375, 667],
  [390, 844],
  [393, 852],
  [430, 932]
] as const;

const GAMES: HomeGame[] = ["compare", "catalogue", "care", "sort", "pairs", "skeletons", "dig", "sandWriting"];

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const px = (value: string) => Number.parseFloat(value) || 0;

const part = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

// The home page in a tall-narrow window `width` by `height`, its large
// card `featured`'s, in `language`.
function openNarrow(width: number, height: number, { language = "en", featured = "compare", storage = memoryStorage() }: { language?: Language; featured?: HomeGame; storage?: MemoryStorage } = {}) {
  openWindow(width, height);
  const footer = Object.assign(document.createElement("footer"), { id: "version" });
  document.body.append(footer);
  onTestFinished(() => footer.remove());
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  const progress = () => storage;
  render(
    <App
      {...featuring(featured)}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(7)}
      portraitLayouts={{ home: ["tall", "tall-narrow"] }}
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
  return viewport;
}

describe("the home page in a tall-narrow window", () => {
  it.each(PHONES)("stands upright in a %i by %i window, with no ask to turn over, on 20-pixel sides", (width, height) => {
    openNarrow(width, height);
    expect(document.documentElement.dataset.size).toBe("tall-narrow");
    expect(document.querySelector(".orientation-gate[data-shown]")).toBeNull();
    const home = getComputedStyle(part(".home"));
    expect([home.paddingLeft, home.paddingRight].map(px)).toEqual([20, 20]);
    // The large card over the row, each across the page's whole width.
    const games = part(".games");
    expect([getComputedStyle(games).display, getComputedStyle(games).flexDirection, getComputedStyle(games).width, getComputedStyle(games).maxWidth]).toEqual(["flex", "column", "auto", "none"]);
    expect([...games.children]).toEqual([featuredCard(), part(".games-tiles")]);
    for (const child of games.children) {
      const style = getComputedStyle(child);
      expect([style.width, style.maxWidth, style.alignSelf || "auto", px(style.marginLeft), px(style.marginRight)]).toEqual(["auto", "none", "auto", 0, child === featuredCard() ? 0 : -20]);
    }
    expect(getComputedStyle(games).alignItems || "normal").toMatch(/^(normal|stretch)$/);
    expect([getComputedStyle(part(".home")).maxWidth, getComputedStyle(part(".home")).width]).toEqual(["none", "auto"]);
  });

  it.each(PHONES)("sets the narrow page's sizes in a %i by %i window: its sides and gap, the greeting, the large card and the tiles' row", (width, height) => {
    // A best score, so the large card shows its badge.
    openNarrow(width, height, { storage: memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, games: { "compare-dinosaurs": { bestScore: 7, explorerBest: 7, paleontologistBest: null, roundsPlayed: 3 } } }) }) });
    const values = (selector: string, properties: string[]) => properties.map((property) => styleAt(part(selector), [width, height]).value(property));
    expect(values(".home", ["padding-top", "padding-bottom", "gap"])).toEqual(["100px", "48px", "20px"]);
    expect(values(".greeting", ["font-size", "line-height"])).toEqual(["30px", "36px"]);
    expect(values(".featured-card", ["min-height"])).toEqual(["240px"]);
    expect(values(".featured-card-footer", ["padding", "gap"])).toEqual(["18px 18px 22px", "12px"]);
    expect(values(".featured-card-title", ["font-size"])).toEqual([width < 360 ? "26px" : "28px"]);
    expect(values(".featured-card-badge", ["top", "right", "padding", "font-size"])).toEqual(["16px", "16px", "8px 14px", "22px"]);
    // The row takes 36% of the height, 320 to 420.
    expect(values(".games-tiles", ["height", "margin-right"]).map(px)).toEqual([Math.min(420, Math.max(320, (height * 36) / 100)), -20]);
  });

  it("names RexLab and the museum for screen readers while showing their symbols alone", () => {
    openNarrow(375, 667);
    for (const word of [screen.getByText("RexLab"), screen.getByText(TEXTS.en.museum)]) {
      expect(word.className).toBe("narrow-hidden");
      expect(getComputedStyle(word).position).toBe("absolute");
      expect(getComputedStyle(word).clipPath).toBe("inset(50%)");
    }
    expect(screen.getByRole("button", { name: new RegExp(TEXTS.en.museum, "i") })).toBeTruthy();
  });

  it.each((["en", "ru"] as const).flatMap((language) => [320, 375].map((width) => [language, width] as const)))("keeps the corner on one line beside the wordmark in %s at %i wide, every tap at least 44 pixels", (language, width) => {
    openNarrow(width, 667, { language });
    const line = topLine(width, language, { wordsHidden: true });
    expect(line.museumWraps).toBe(false);
    expect(line.between).toBeGreaterThanOrEqual(line.cornerGap);
    expect(Math.max(line.cornerEnd, line.wordmarkEnd)).toBeLessThanOrEqual(line.greetingTop);
    const museum = styleAt(part(".home-museum"), [width, 667]);
    expect([museum.px("width"), museum.px("height")]).toEqual([width < 360 ? 48 : 60, 60]);
    for (const button of document.querySelectorAll(".parent-menu-button")) {
      const style = getComputedStyle(button);
      expect([px(style.minWidth), px(style.minHeight)]).toEqual([44, 44]);
    }
  });

  it.each(PHONES)("sizes the tiles' columns from the 20-pixel side in a %i by %i window, the next column peeking in", (width, height) => {
    openNarrow(width, height);
    const row = tilesRow();
    // The row starts at the page's own left side.
    const rowStart = px(getComputedStyle(part(".home")).paddingLeft);
    const column = tileColumnWidth(width, COLUMNS, rowStart);
    expect(row.style.getPropertyValue("--tile-column")).toBe(`${column}px`);
    // The width the grid gives each column, and the gap it leaves.
    const at = styleAt(row, [width, height]);
    expect(at.px("grid-auto-columns")).toBe(column);
    expect(at.columnGap()).toBe(TILE_GAP);
    expect(at.px("margin-right")).toBe(-20);
    // From the row's start at the page's side to the window's right edge.
    const shown = width - rowStart;
    const whole = Math.floor((shown + TILE_GAP) / (column + TILE_GAP));
    const peek = shown - whole * (column + TILE_GAP);
    expect(whole).toBeGreaterThanOrEqual(1);
    expect(peek).toBeGreaterThanOrEqual(PEEK);
    expect(peek).toBeLessThanOrEqual(column - PEEK);
  });

  it.each((["en", "ru"] as const).flatMap((language) => [320, 375].flatMap((width) => GAMES.map((featured) => [language, width, featured] as const))))("fits every word in %s at %i wide, featuring %s", (language, width, featured) => {
    openNarrow(width, 667, { language, featured });
    // Every style as the window's media rules leave it.
    const styleOf = (element: Element) => sizedStyle(element, [width, 667]);
    const home = styleOf(part(".home"));
    const cardWidth = width - px(home.paddingLeft) - px(home.paddingRight);
    const title = featuredCard().querySelector(".featured-card-title");
    if (!title?.textContent) throw new Error("No name on the large card");
    const style = styleOf(title);
    expect(style.whiteSpace).not.toBe("nowrap");
    const size = px(style.fontSize);
    const room = roomFor(title, () => cardWidth, styleOf);
    const lines = linesOf(title.textContent, size, px(style.letterSpacing), room);
    if (!Array.isArray(lines)) throw new Error(`${lines.missing}: no width in ems`);
    expect(lines.filter((line) => widthOf(line, size, px(style.letterSpacing)) > room)).toEqual([]);

    const column = tileColumnWidth(width, COLUMNS, px(home.paddingLeft));
    // Under 360 wide ANCIENT REPTILES may wrap with the two longer names.
    const wrapping = [".pairs-tile-title", ".sand-writing-tile-title", ...(width < 360 ? [".catalogue-tile-title"] : [])].join(", ");
    const overflowing = tileTitles().filter((tile) => !tile.matches(wrapping)).flatMap((tile) => {
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
  });

  it("goes back to the tall layout when the window grows past 600 wide", () => {
    const viewport = openNarrow(375, 667);
    openWindow(768, 1024);
    act(() => viewport.resize("tall", true));
    expect(document.documentElement.dataset.size).toBe("tall");
    expect(getComputedStyle(screen.getByText("RexLab")).position).not.toBe("absolute");
  });
});
