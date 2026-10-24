import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { HomeGame } from "../src/HomePage.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localCareProgress, localDigProgress, localPairsProgress, localProgress, localSkeletonProgress, localSortingProgress } from "../src/localProgress.ts";
import { NARROW_ROW_START, tileColumnWidth } from "../src/tileColumns.ts";
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
  unsetAgeLevel
} from "./support.ts";
import { openWindow } from "./windowSizes.ts";

// The home page's tiles and the games still to come, in columns of two.
const COLUMNS = 4;

// iPhones upright: the smallest the page is drawn for, and the common ones.
const PHONES = [
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
function openNarrow(width: number, height: number, { language = "en", featured = "compare" }: { language?: Language; featured?: HomeGame } = {}) {
  openWindow(width, height);
  const footer = Object.assign(document.createElement("footer"), { id: "version" });
  document.body.append(footer);
  onTestFinished(() => footer.remove());
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  const storage = memoryStorage();
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
    expect(featuredCard()).toBeTruthy();
    expect(tilesRow()).toBeTruthy();
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

  it.each(["en", "ru"] as const)("keeps the corner on one line beside the wordmark at 375 wide, in %s, every tap at least 44 pixels", (language) => {
    openNarrow(375, 667, { language });
    const line = topLine(375, language);
    expect(line.museumWraps).toBe(false);
    expect(line.between).toBeGreaterThanOrEqual(line.cornerGap);
    expect(Math.max(line.cornerEnd, line.wordmarkEnd)).toBeLessThanOrEqual(line.greetingTop);
    const museum = getComputedStyle(part(".home-museum"));
    expect([px(museum.width), px(museum.height)]).toEqual([60, 60]);
    for (const button of document.querySelectorAll(".parent-menu-button")) {
      const style = getComputedStyle(button);
      expect([px(style.minWidth), px(style.minHeight)]).toEqual([44, 44]);
    }
  });

  it.each(PHONES)("sizes the tiles' columns from the 20-pixel side in a %i by %i window, the next column peeking in", (width, height) => {
    openNarrow(width, height);
    const column = tileColumnWidth(width, COLUMNS, NARROW_ROW_START);
    expect(tilesRow().style.getPropertyValue("--tile-column")).toBe(`${column}px`);
    expect(column).toBeLessThan(width - NARROW_ROW_START);
    expect(getComputedStyle(part(".games-tiles")).marginRight).toBe("-20px");
  });

  it.each((["en", "ru"] as const).flatMap((language) => GAMES.map((featured) => [language, featured] as const)))("fits every word at 375 wide in %s, featuring %s", (language, featured) => {
    openNarrow(375, 667, { language, featured });
    const home = getComputedStyle(part(".home"));
    const cardWidth = 375 - px(home.paddingLeft) - px(home.paddingRight);
    const title = featuredCard().querySelector(".featured-card-title");
    if (!title?.textContent) throw new Error("No name on the large card");
    const style = getComputedStyle(title);
    const size = px(style.fontSize);
    const room = roomFor(title, () => cardWidth);
    const lines = linesOf(title.textContent, size, px(style.letterSpacing), room);
    if (!Array.isArray(lines)) throw new Error(`${lines.missing}: no width in ems`);
    expect(lines.filter((line) => widthOf(line, size, px(style.letterSpacing)) > room)).toEqual([]);

    const column = tileColumnWidth(375, COLUMNS, NARROW_ROW_START);
    const overflowing = tileTitles().flatMap((tile) => {
      const tileStyle = getComputedStyle(tile);
      const words = tile.textContent ?? "";
      const needed = (TITLE_EMS[words] ?? Number.NaN) * px(tileStyle.fontSize) + px(tileStyle.letterSpacing) * words.length;
      const tileRoom = roomFor(tile, () => column);
      return needed <= tileRoom ? [] : [`${words}: ${needed.toFixed(1)}px in ${tileRoom.toFixed(1)}px`];
    });
    expect(overflowing).toEqual([]);
    for (const tile of tilesRow().querySelectorAll(".pairs-tile-title, .sand-writing-tile-title")) {
      const tileStyle = getComputedStyle(tile);
      const tileLines = linesOf(tile.textContent ?? "", px(tileStyle.fontSize), px(tileStyle.letterSpacing), roomFor(tile, () => column));
      expect(Array.isArray(tileLines) && tileLines.length <= 2).toBe(true);
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
