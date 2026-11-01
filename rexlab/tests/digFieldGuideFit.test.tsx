import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DigFieldGuideScreen } from "../src/DigFieldGuideScreen.tsx";
import { TREASURE_KINDS } from "../src/dig/index.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { EMS } from "./digFieldGuideWords.ts";
import { withPictures } from "./pictures.tsx";
import { fakeTreasurePicture } from "./support.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

// jsdom lays nothing out, so each word on the FIELD GUIDE is given its
// width in ems. A word missing there fails the test that reads it.
const emsOf = (word: string) => {
  const ems = EMS[word];
  if (ems === undefined) throw new Error(`No width for ${word}`);
  return ems;
};

const px = (value: string) => Number.parseFloat(value);
const style = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return getComputedStyle(element);
};
const sides = (s: CSSStyleDeclaration) => px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth);

// A size written as min(<largest>px, 100cqi / <ems>), in the room it is
// given.
function sizeIn(written: string, room: number): number {
  const parts = /^min\((\d+)px, 100cqi ?\/ ?([\d.]+)\)$/.exec(written);
  if (!parts) throw new Error(`Cannot read the size ${written}`);
  return Math.min(Number(parts[1]), room / Number(parts[2]));
}

// The feature's windows, and the 13" iPad Pro of the budget before them.
const WINDOWS = windowsAnd([1366, 1024]);

// The page with a card of each kind found, in a `width` by `height`
// window.
function show(language: Language, width: number, height: number) {
  openWindow(width, height);
  const cards = TREASURE_KINDS.map((kind) => ({ kind, picture: fakeTreasurePicture(kind), count: 1 }));
  render(<DigFieldGuideScreen language={language} cards={cards} onBack={() => {}} onHome={() => {}} />, withPictures);
}

describe.each(LANGUAGES)("the FIELD GUIDE in %s", (language) => {
  it.each(WINDOWS)("keeps its title on one line beside HOME, BACK and the kinds found, in a %i by %i window", (width, height) => {
    show(language, width, height);
    const text = TEXTS[language];
    const outer = style(".dig-screen");
    const bar = style(".dig-bar");
    const home = style(".dig-bar .home-button");
    const chip = style(".dig-kinds-found");
    const title = style(".dig-field-guide-screen .dig-title-words");
    const button = (word: string) => px(home.paddingLeft) + 24 + px(home.gap) + emsOf(word) * px(home.fontSize) + px(home.paddingRight);
    const kinds = px(chip.paddingLeft) + 20 + px(chip.gap) + emsOf("5/5") * px(chip.fontSize) + px(chip.paddingRight);
    const room = width - px(outer.paddingLeft) - px(outer.paddingRight) - button(text.home) - button(text.back) - kinds - 3 * px(bar.gap);
    // The book, its gap and the title's letters, at most 0.75 of their size.
    const mark = px(style(".dig-mark").width) + px(style(".dig-title").gap);
    expect(title.fontSize).toBe("min(40px, (100cqi - 66px) / (var(--letters) * 0.75))");
    expect(mark).toBe(66);
    expect(emsOf(text.fieldGuide)).toBeLessThanOrEqual(text.fieldGuide.length * 0.75);
    const size = Math.min(40, (room - mark) / (text.fieldGuide.length * 0.75));

    expect([style(".dig-title").whiteSpace, size >= 32]).toEqual(["nowrap", true]);
    expect(mark + emsOf(text.fieldGuide) * size).toBeLessThanOrEqual(room);
  });

  it.each(WINDOWS)("keeps each word of every name whole on its card, at least 16 pixels large, in a %i by %i window", (width, height) => {
    show(language, width, height);
    const outer = style(".dig-screen");
    const row = style(".dig-guide-cards");
    const card = style(".dig-guide-card[data-found]");
    const inside = (width - px(outer.paddingLeft) - px(outer.paddingRight) - 4 * px(row.gap)) / 5 - sides(card);
    const size = sizeIn(style(".dig-guide-name").fontSize, inside);
    const words = TREASURE_KINDS.flatMap((kind) => TEXTS[language].treasures[kind].split(" "));

    expect(size).toBeGreaterThanOrEqual(16);
    expect(words.filter((word) => emsOf(word) * size > inside)).toEqual([]);
  });

  it.each(WINDOWS)("fits a card's picture, two lines of its name and its count, or its outline and ?, in its height, in a %i by %i window", (width, height) => {
    show(language, width, height);
    const outer = style(".dig-screen");
    const row = style(".dig-guide-cards");
    const card = style(".dig-guide-card[data-found]");
    const picture = style(".dig-guide-picture");
    const name = style(".dig-guide-name");
    const inside = (width - px(outer.paddingLeft) - px(outer.paddingRight) - 4 * px(row.gap)) / 5 - sides(card);
    // The bar is as tall as its tallest part, the HOME button.
    const room = height - px(outer.paddingTop) - px(outer.paddingBottom) - px(style(".dig-bar .home-button").height) - px(outer.gap);
    const cardHeight = Math.min(px(card.maxHeight), room);
    expect([outer.height, outer.boxSizing, outer.overflow]).toEqual([`${height}px`, "border-box", "hidden"]);
    const art = Math.min(inside, 180);
    const found = px(card.paddingTop) + art + 2 * px(card.gap) + 2 * px(name.lineHeight) * sizeIn(name.fontSize, inside) + px(style(".dig-guide-count").fontSize) + px(card.paddingBottom);

    expect([picture.width, picture.aspectRatio, card.maxHeight, card.height]).toEqual(["min(100%, 180px)", "1 / 1", "520px", "100%"]);
    expect(found).toBeLessThanOrEqual(cardHeight);
    expect(px(card.paddingTop) + art + px(card.gap) + 64 + px(card.paddingBottom)).toBeLessThanOrEqual(cardHeight);
  });
});
