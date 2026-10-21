import { expect } from "vitest";

// jsdom lays nothing out, so the width of each title in every language
// is given here in ems of its bold face, rounded up: Lexend's for the
// Latin words, and the iPad's own face for the Cyrillic ones, which
// Lexend has no letters for. A title missing here fails the test that
// reads it.
export const TITLE_EMS: Record<string, number> = {
  COMPARE: 5.1,
  СРАВНИ: 4.1,
  "ANCIENT REPTILES": 10.3,
  // ANCIENT REPTILES may wrap on the large card, so each of its words is here.
  ANCIENT: 4.9,
  REPTILES: 5.2,
  ВСЕ: 2.1,
  CARE: 2.8,
  ЗАБОТА: 4.0,
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
  SKELETONS: 6.2,
  СКЕЛЕТЫ: 4.8,
  DIG: 2.1,
  РАСКОПКИ: 5.8,
  "MORE COMING": 7.9,
  "СКОРО ЕЩЁ": 6.0
};

// The words each tile's title on the home page shows.
export const TITLE_TEXTS: Record<string, "quizCard" | "catalogueTile" | "care" | "sort" | "skeletons" | "dig" | "moreComing"> = {
  "compare-tile-title": "quizCard",
  "catalogue-tile-title": "catalogueTile",
  "care-tile-title": "care",
  "sort-tile-title": "sort",
  "skeletons-tile-title": "skeletons",
  "dig-tile-title": "dig",
  "more-coming-title": "moreComing"
};

// Every tile's title on the home page, the games still to come's last.
export const tileTitles = () => [...document.querySelectorAll(Object.keys(TITLE_TEXTS).map((name) => `.${name}`).join(", "))];

// Each count in a tile's picture's corner.
export const TILE_COUNTS = ".compare-tile-best, .catalogue-tile-count, .care-tile-best, .sort-tile-best, .pairs-tile-stars, .skeletons-tile-best, .dig-tile-count";

const px = (value: string) => Number.parseFloat(value) || 0;

// jsdom keeps a gap as it is written, unexpanded.
export const columnGapOf = (style: CSSStyleDeclaration) => px(style.gap.split(" ").at(-1) ?? "");

export const sidesOf = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);

// The widths the large card and the tiles' row take on a page `width`
// wide: they grow from nothing by their shares of what the page's
// padding, the gap and their own sides leave. A width set, capped or
// floored any other way fails here, since this sum would not see it.
export function gamesWidths(width: number) {
  const home = document.querySelector(".home");
  const games = document.querySelector(".games");
  if (!home || !games) throw new Error("No games on the page");
  const parts = [...games.children].map((part) => ({ part, style: getComputedStyle(part) }));
  expect(parts.map(({ style }) => [style.flexBasis, style.minWidth, style.maxWidth, style.width])).toEqual(parts.map(() => ["0px", "0px", "none", "auto"]));
  expect([home, games].map((element) => [getComputedStyle(element).maxWidth, getComputedStyle(element).width])).toEqual([
    ["none", "auto"],
    ["none", "auto"]
  ]);
  const free = width - sidesOf(getComputedStyle(home)) - columnGapOf(getComputedStyle(games)) * (parts.length - 1) - parts.reduce((sum, { style }) => sum + sidesOf(style), 0);
  const shares = parts.reduce((sum, { style }) => sum + Number(style.flexGrow), 0);
  return new Map(parts.map(({ part, style }) => [part, (free * Number(style.flexGrow)) / shares + sidesOf(style)]));
}

// The width a title has in a card `cardWidth` wide: the card's width,
// short of the sides of the card and the row, and of the row's other
// parts and the gaps between them.
export function roomFor(title: Element, cardWidth: (card: Element) => number) {
  const row = title.parentElement;
  const card = title.closest("button, .more-coming");
  if (!row || !card) throw new Error("A title outside the games");
  const others = [...row.children].filter((child) => child !== title);
  return (
    cardWidth(card) -
    sidesOf(getComputedStyle(card)) -
    sidesOf(getComputedStyle(row)) -
    // A symbol drawn straight into the row is as wide as it is drawn.
    others.reduce((sum, other) => sum + (px(getComputedStyle(other).width) || px(other.getAttribute("width") ?? "")), 0) -
    columnGapOf(getComputedStyle(row)) * others.length
  );
}

// The width of `words` at `size` and `spacing` between letters.
export const widthOf = (words: string, size: number, spacing: number) => (TITLE_EMS[words] ?? Number.NaN) * size + spacing * words.length;

// The lines `words` wrap onto in `room` at `size` and `spacing`, a word
// at a time, or the line whose width in ems is missing here.
export function linesOf(words: string, size: number, spacing: number, room: number): string[] | { missing: string } {
  const lines: string[] = [];
  for (const word of words.split(" ")) {
    const last = lines.at(-1);
    const joined = last === undefined ? word : `${last} ${word}`;
    if (TITLE_EMS[joined] === undefined) return { missing: joined };
    if (last !== undefined && widthOf(joined, size, spacing) <= room) lines[lines.length - 1] = joined;
    else lines.push(word);
  }
  const missing = lines.find((line) => TITLE_EMS[line] === undefined);
  return missing === undefined ? lines : { missing };
}
