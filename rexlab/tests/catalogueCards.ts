import { expect } from "vitest";
import { NAME_EMS } from "./nameWidths.ts";

const px = (value: string) => Number.parseFloat(value) || 0;

const part = (selector: string, within: ParentNode = document) => {
  const found = within.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

// The value a property of `element` takes in a card `cardWidth` wide, the
// card's container rules applied: jsdom applies none.
export function inCard(element: Element, cardWidth: number, property: string) {
  let found = getComputedStyle(element).getPropertyValue(property);
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSContainerRule)) continue;
      const [, most] = /^\(max-width: (\d+)px\)$/.exec(rule.conditionText) ?? [];
      if (most === undefined) throw new Error(`No sum for @container ${rule.conditionText}`);
      if (cardWidth > Number(most)) continue;
      for (const inner of rule.cssRules) {
        if (inner instanceof CSSStyleRule && element.matches(inner.selectorText)) found = inner.style.getPropertyValue(property) || found;
      }
    }
  }
  return found;
}

// A card's name in a card `cardWidth` wide: its size, by its share of the
// card's width, and how much wider than its room it is, if at all.
export function cardName(card: Element, cardWidth: number) {
  const name = part(".catalogue-name", card);
  const footer = part(".catalogue-footer", card);
  expect(getComputedStyle(card).containerType).toBe("inline-size");
  const fontSize = getComputedStyle(name).fontSize;
  const [, most, share] = /^min\(([\d.]+)px, ([\d.]+)cqi\)$/.exec(fontSize) ?? [];
  if (most === undefined || share === undefined) throw new Error(`A name ${fontSize} in size`);
  const size = Math.min(Number(most), (Number(share) / 100) * cardWidth);
  const words = name.textContent ?? "";
  const ems = NAME_EMS[words];
  if (ems === undefined) throw new Error(`No width in ems for ${words}`);
  const [start, end = start] = inCard(footer, cardWidth, "padding-inline").split(" ").map(px);
  const room = cardWidth - (start ?? 0) - (end ?? 0);
  return { words, size, over: ems * size - room, wraps: getComputedStyle(name).whiteSpace !== "nowrap" };
}

// The size of the names on a 1024 by 768 landscape iPad, four cards to a
// row, each 213 wide.
export const LANDSCAPE_NAME = Math.min(20, 0.07 * 213);

// jsdom lays nothing out, so the width of each character a card's height
// and weight are written in is given here in ems of its semibold face,
// rounded up: Lexend's for the digits and the Latin units, and for the
// Cyrillic units, which Lexend has no letters for, the width of a system
// face with a tenth added for the iPad's own. A value is as wide as its
// characters together: kerning, left out, only narrows it. A character
// missing here fails the test that reads it.
const DETAIL_EMS: Record<string, number> = {
  "0": 0.66,
  "1": 0.55,
  "2": 0.55,
  "3": 0.58,
  "4": 0.65,
  "5": 0.59,
  "6": 0.58,
  "7": 0.55,
  "8": 0.6,
  "9": 0.57,
  ".": 0.25,
  ",": 0.29,
  " ": 0.31,
  M: 0.88,
  K: 0.74,
  G: 0.78,
  T: 0.63,
  М: 0.95,
  К: 0.73,
  Г: 0.6,
  Т: 0.67
};

const detailWidth = (words: string, fontSize: number) =>
  [...words].reduce((sum, character) => {
    const ems = DETAIL_EMS[character];
    if (ems === undefined) throw new Error(`No width in ems for ${character} in ${words}`);
    return sum + ems * fontSize;
  }, 0);

// A gap in a card `cardWidth` wide: jsdom works out its longhand only
// where the CSS sets it, and the shorthand gives it otherwise.
function gapInCard(element: Element, cardWidth: number) {
  const set = inCard(element, cardWidth, "column-gap");
  return px(set && set !== "normal" ? set : (inCard(element, cardWidth, "gap").split(" ").at(-1) ?? ""));
}

// The symbols shown in `element`, side by side at their size and gap.
function symbolsWidth(element: Element, cardWidth: number) {
  const shown = [...element.querySelectorAll("svg")].filter((symbol) => inCard(symbol, cardWidth, "display") !== "none");
  return { count: shown.length, width: shown.reduce((sum, symbol) => sum + px(symbol.getAttribute("width") ?? ""), 0) };
}

// A card's height, weight and food tag in a card `cardWidth` wide, its
// container rules applied: how much wider their row is than the room the
// footer's padding leaves, if at all. Each chip is its padding, its
// symbol where it shows one, and its words, its parts apart by its gap;
// the food tag is its symbols inside its face's padding.
export function cardDetails(card: Element, cardWidth: number) {
  const footer = part(".catalogue-footer", card);
  const row = part(".catalogue-chips", card);
  const [start, end = start] = inCard(footer, cardWidth, "padding-inline").split(" ").map(px);
  const padded = (element: Element) => px(inCard(element, cardWidth, "padding-left")) + px(inCard(element, cardWidth, "padding-right"));
  const chips = [...row.querySelectorAll(".catalogue-chip")].map((chip) => {
    const symbols = symbolsWidth(chip, cardWidth);
    const words = detailWidth(chip.textContent ?? "", px(inCard(chip, cardWidth, "font-size")));
    return padded(chip) + symbols.width + words + gapInCard(chip, cardWidth) * symbols.count;
  });
  const face = part(".diet-tag-face", row);
  const tagSymbols = part(".diet-tag-symbols", face);
  const symbols = symbolsWidth(tagSymbols, cardWidth);
  const tag = padded(face) + symbols.width + gapInCard(tagSymbols, cardWidth) * (symbols.count - 1);
  const parts = [...chips, tag];
  const needed = parts.reduce((sum, width) => sum + width, 0) + gapInCard(row, cardWidth) * (parts.length - 1);
  return { name: card.getAttribute("aria-label"), over: needed - (cardWidth - (start ?? 0) - (end ?? 0)) };
}
