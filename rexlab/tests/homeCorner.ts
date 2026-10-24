import { expect } from "vitest";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { styleAt } from "./windowSizes.ts";

// jsdom lays nothing out, so the width of each word in the top corners
// is given here in ems of its face, rounded up: Lexend's at the weight
// it is shown in for the Latin words, and the iPad's own bold face for
// the Cyrillic one, which Lexend has no letters for.
const WORD_EMS: Record<string, number> = { RexLab: 3.8, MUSEUM: 4.6, МУЗЕЙ: 3.5, EN: 1.5, RU: 1.5 };

const px = (value: string) => Number.parseFloat(value) || 0;

const wordWidth = (words: string, style: CSSStyleDeclaration) => (WORD_EMS[words] ?? Number.NaN) * px(style.fontSize) + px(style.letterSpacing) * words.length;

const sides = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight);

// An element's style in the window as it is, its media rules included,
// read as a computed style is.
const styleOf = (element: Element) => {
  const at = styleAt(element, [window.innerWidth, window.innerHeight]);
  return new Proxy({} as CSSStyleDeclaration, { get: (_, name: string) => at.value(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)) });
};

// A row's width: its sides, its parts and the gaps between them.
const rowWidth = (row: Element, parts: number[]) => {
  const style = styleOf(row);
  return sides(style) + parts.reduce((sum, part) => sum + part, 0) + px(style.gap) * (parts.length - 1);
};

// The width a box takes for its content: its own width if it sets one,
// held between its least and its most.
const boxWidth = (box: Element, content: number) => {
  const style = styleOf(box);
  const most = px(style.maxWidth) || Number.POSITIVE_INFINITY;
  return Math.min(most, Math.max(px(style.minWidth), px(style.width) || content));
};

const drawnWidth = (symbol: Element | null) => px(symbol?.getAttribute("width") ?? "");

// A word's part of its row: none where the layout hides it, taken out of
// the row, and a word hidden from sight where it should show, or shown
// where it should be hidden, fails here.
const shownWidth = (word: Element | null, words: string, style: CSSStyleDeclaration, hidden: boolean) => {
  expect(word !== null && getComputedStyle(word).position === "absolute").toBe(hidden);
  return hidden ? [] : [wordWidth(words, style)];
};

const partOf = (selector: string) => {
  const part = document.querySelector(selector);
  if (!part) throw new Error(`No ${selector} on the page`);
  return part;
};

// The home page's top line in a window `width` wide, in `language`, with
// RexLab's and the museum's words hidden from sight if `wordsHidden`: the
// room between RexLab and the corner of the museum and the parents'
// menus, the least the corner keeps, and where each of them ends below
// against where the greeting begins. The widths add up along one row,
// every part centred on it.
export function topLine(width: number, language: Language, { wordsHidden = false }: { wordsHidden?: boolean } = {}) {
  const button = partOf(".home-museum");
  const museumStyle = styleOf(button);
  const museum = boxWidth(button, rowWidth(button, [drawnWidth(button.querySelector("svg")), ...shownWidth(button.querySelector(".narrow-hidden"), TEXTS[language].museum, museumStyle, wordsHidden)]));
  // Each button shows its face: a symbol or a picture, and at most a code.
  const menuButtons = [...partOf(".parent-menus").querySelectorAll(".parent-menu-button")].map((menuButton) => {
    const style = styleOf(menuButton);
    const face = menuButton.querySelector(".parent-menu-face");
    if (!face) throw new Error("A parents' menu button shows nothing");
    const symbol = menuButton.querySelector("svg");
    const picture = menuButton.querySelector(".parent-menu-picture");
    const code = menuButton.querySelector(".parent-menu-code")?.textContent;
    const parts = [...(symbol ? [drawnWidth(symbol)] : []), ...(picture ? [px(styleOf(picture).width)] : []), ...(code ? [wordWidth(code, style)] : [])];
    expect(parts.length).toBeGreaterThan(0);
    return boxWidth(menuButton, rowWidth(menuButton, [rowWidth(face, parts)]));
  });
  expect(menuButtons).toHaveLength(3);
  const corner = partOf(".home-corner");
  for (const row of [corner, partOf(".parent-menus"), button, partOf(".wordmark")]) {
    const style = styleOf(row);
    expect([style.display, style.flexDirection || "row", style.flexWrap || "nowrap", style.alignItems]).toEqual(["flex", "row", "nowrap", "center"]);
  }
  const cornerStyle = styleOf(corner);
  const cornerWidth = boxWidth(corner, rowWidth(corner, [museum, boxWidth(partOf(".parent-menus"), rowWidth(partOf(".parent-menus"), menuButtons))]));
  const wordmark = partOf(".wordmark");
  const wordmarkStyle = styleOf(wordmark);
  const wordmarkWidth = rowWidth(wordmark, [px(styleOf(partOf(".wordmark-mark")).width), ...shownWidth(wordmark.querySelector(".narrow-hidden"), "RexLab", wordmarkStyle, wordsHidden)]);
  const menusStyle = styleOf(partOf(".parent-menus"));
  const menuHeight = Math.max(...[...partOf(".parent-menus").querySelectorAll(".parent-menu-button")].map((menuButton) => px(styleOf(menuButton).minHeight)));
  const cornerHeight = Math.max(px(museumStyle.height), px(menusStyle.paddingTop) + menuHeight + px(menusStyle.paddingBottom));
  return {
    museumWraps: museumStyle.whiteSpace !== "nowrap",
    between: width - px(cornerStyle.right) - cornerWidth - (px(wordmarkStyle.left) + wordmarkWidth),
    cornerGap: px(cornerStyle.gap),
    cornerEnd: px(cornerStyle.top) + cornerHeight,
    wordmarkEnd: px(wordmarkStyle.top) + px(wordmarkStyle.height),
    greetingTop: px(styleOf(partOf(".home")).paddingTop)
  };
}
