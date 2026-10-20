import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { SortScreen, type Basket, type BasketView } from "../src/SortScreen.tsx";
import { BASKET_EMS, MARK_EMS, SPACE_EMS } from "./basketWidths.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_SORTABLES, fakeBodyPicture } from "./support.ts";

// sort-dinosaurs-basket-fit.feature: a basket filled as full as the game deals,
// its cards in rows, each wide enough for its picture and its name.

// Each level's boards as the game deals them: its cards, and the baskets
// of each property it sorts by.
const BOARDS: readonly { level: string; cards: number; baskets: readonly (readonly Basket[])[] }[] = [
  {
    level: "Hatchling",
    cards: 6,
    baskets: [
      ["two-legs", "four-legs"],
      ["plants", "meat"],
      ["big", "small"],
      ["horns", "no-horns"],
      ["feathers", "no-feathers"]
    ]
  },
  {
    level: "Explorer",
    cards: 8,
    baskets: [
      ["two-legs", "four-legs"],
      ["plants", "meat", "both"],
      ["big", "small"],
      ["horns", "no-horns"],
      ["feathers", "no-feathers"]
    ]
  },
  {
    level: "Paleontologist",
    cards: 10,
    baskets: [
      ["two-legs", "four-legs", "two-or-four"],
      ["feathers", "no-feathers", "not-known-yet"]
    ]
  }
];

// Every other basket of a board gets at least two cards.
const LEAST_PER_BASKET = 2;

// The iPads' windows, a wide but short desktop one, and larger ones.
const WINDOWS = [
  [1024, 768],
  [1180, 820],
  [1366, 1024],
  [1506, 807],
  [1920, 1080]
] as const;

type Size = readonly [number, number];

// Where even names alone in one column take more height than a full
// basket has, so a name there shrinks to its card's height.
const TIGHT: readonly Size[] = [
  [1024, 768],
  [1180, 820]
];

const NAME_SIZE = 14;
// Lexend's normal line height, for a name that sets none.
const NORMAL_LINE = 1.25;

const px = (value: string) => Number.parseFloat(value) || 0;

const holds = (condition: string, [width, height]: Size) => {
  const [, feature, least] = /^\((min-width|min-height): (\d+)px\)$/.exec(condition) ?? [];
  return feature === "min-width" ? width >= Number(least) : feature === "min-height" ? height >= Number(least) : false;
};

// An element's style in a window of `size`. jsdom applies no media query, so the
// screen's rules for wider or taller windows are applied here: each
// restates a selector of the screen's own rules, and the last that
// matches wins.
function styleAt(element: Element, size: Size) {
  const computed = getComputedStyle(element);
  const value = (property: string) => {
    let found = computed.getPropertyValue(property);
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSMediaRule) || !holds(rule.conditionText, size)) continue;
        for (const inner of rule.cssRules) {
          if (inner instanceof CSSStyleRule && element.matches(inner.selectorText)) found = inner.style.getPropertyValue(property) || found;
        }
      }
    }
    return found;
  };
  // jsdom keeps a gap only as the shorthand, row gap first.
  return { value, px: (property: string) => px(value(property)), rowGap: () => px(value("gap").split(" ")[0] ?? ""), columnGap: () => px(value("gap").split(" ").at(-1) ?? "") };
}

const first = (selector: string, within: ParentNode = document) => {
  const element = within.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return element;
};

// The `count` names of the shipped dinosaurs that are widest in `language`,
// as wide as any basket can be dealt.
function widestNames(language: Language, count: number) {
  return SHIPPED_SORTABLES.map((dinosaur) => dinosaur.name[language])
    .sort((one, other) => (NAME_EMS[other.toLocaleUpperCase(language)] ?? 0) - (NAME_EMS[one.toLocaleUpperCase(language)] ?? 0))
    .slice(0, count);
}

function openBasket(baskets: readonly Basket[], full: number, cards: number, language: Language) {
  const names = widestNames(language, cards - LEAST_PER_BASKET * (baskets.length - 1));
  const [one, two, three] = baskets.map<BasketView>((basket, at) => ({
    basket,
    cards: at === full ? names.map((name, place) => ({ id: `card-${place}`, name, picture: fakeBodyPicture(name) })) : []
  }));
  if (!one || !two) throw new Error("A board has two or three baskets");
  return render(
    <SortScreen
      language={language}
      tray={Array.from({ length: cards }, () => null)}
      baskets={three ? [one, two, three] : [one, two]}
      sorted={names.length}
      total={cards}
      glow={undefined}
      onDrop={() => {}}
      onHome={() => {}}
      onSeeResult={() => {}}
    />,
    withPictures
  );
}

// The room a basket leaves for its cards under its label, in a window of `size`:
// the label is its mark beside its name, broken between words into as few
// lines as fit.
function cardsRoom(basket: HTMLElement, count: number, size: Size) {
  const [width, height] = size;
  const screen = styleAt(first(".sort"), size);
  const row = width - screen.px("padding-left") - screen.px("padding-right");
  const basketWidth = (row - styleAt(first(".baskets"), size).columnGap() * (count - 1)) / count;
  const basketHeight =
    height -
    screen.px("padding-top") -
    screen.px("padding-bottom") -
    styleAt(first(".home-button"), size).px("height") -
    styleAt(first(".prompt-symbol"), size).px("height") -
    styleAt(first(".sort-tray-area"), size).px("height") -
    3 * screen.rowGap();
  const box = styleAt(basket, size);
  const mark = first(".basket-mark", basket);
  const name = first(".basket-name", basket);
  const markStyle = styleAt(mark, size);
  const content = [...mark.children].map((part) =>
    part instanceof SVGElement ? styleAt(part, size).px("width") || Number(part.getAttribute("width")) : (MARK_EMS[part.textContent ?? ""] ?? Number.NaN) * styleAt(part, size).px("font-size")
  );
  const markWidth = Math.max(markStyle.px("min-width"), content.reduce((sum, each) => sum + each, 0) + markStyle.columnGap() * (content.length - 1) + markStyle.px("padding-left") + markStyle.px("padding-right"));
  const nameStyle = styleAt(name, size);
  const fontSize = nameStyle.px("font-size");
  const inside = basketWidth - box.px("padding-left") - box.px("padding-right");
  const room = inside - markWidth - styleAt(name.parentElement ?? name, size).columnGap();
  let lines = 1;
  let used = 0;
  for (const word of (name.textContent ?? "").split(" ")) {
    const needed = (BASKET_EMS[word] ?? Number.NaN) * fontSize;
    if (used === 0) used = needed;
    else if (nameStyle.value("white-space") !== "nowrap" && used + SPACE_EMS * fontSize + needed > room) {
      lines++;
      used = needed;
    } else used += SPACE_EMS * fontSize + needed;
  }
  const label = Math.max(markStyle.px("height"), lines * fontSize * (Number(nameStyle.value("line-height")) || NORMAL_LINE));
  return { width: inside, height: basketHeight - box.px("padding-top") - box.px("padding-bottom") - label - box.rowGap() };
}

const CASES = BOARDS.flatMap(({ level, cards, baskets }) =>
  baskets.flatMap((board) => board.flatMap((basket, full) => LANGUAGES.flatMap((language) => WINDOWS.map((size) => ({ level, cards, board, basket, full, language, size })))))
);

describe("a full basket", () => {
  it.each(CASES)("of $level's $basket, in $language at $size, wraps its cards into rows, each as wide as its name at 14px, apart, inside the basket", ({ cards, board, full, language, size }) => {
    const { unmount } = openBasket(board, full, cards, language);
    const basket = document.querySelectorAll<HTMLElement>(".baskets .basket")[full];
    if (!basket) throw new Error("The board has no such basket");
    const area = first(".basket-cards", basket) as HTMLElement;
    const names = [...area.querySelectorAll(".sorted-name")].map((name) => name.textContent ?? "");
    const letters = Math.max(...names.map((name) => name.length));
    const grid = styleAt(area, size);
    const card = styleAt(first(".sorted-card", area), size);
    const footer = styleAt(first(".sorted-footer", area), size);
    const name = styleAt(first(".sorted-name", area), size);
    const sides = footer.px("padding-left") + footer.px("padding-right");
    const ends = footer.px("padding-top") + footer.px("padding-bottom");
    const lineHeight = Number(name.value("line-height"));

    // The columns are as many as fit at the width the longest name needs
    // at 14px, at most 0.75 of its size a letter, and share what is left.
    expect([grid.value("display"), grid.value("grid-template-columns"), grid.value("grid-auto-rows"), area.style.getPropertyValue("--longest")]).toEqual([
      "grid",
      "repeat(auto-fill, minmax(min(100%, var(--least-card)), 1fr))",
      "minmax(0, 1fr)",
      String(letters)
    ]);
    // jsdom drops the spaces around a custom property's * and /.
    expect(grid.value("--least-card").replaceAll(" ", "")).toBe(`calc(var(--longest)*0.75*${NAME_SIZE}px+${sides}px)`);
    expect(["container-type", "min-width", "min-height", "height"].map(card.value)).toEqual(["size", "0px", "0px", "100%"]);
    expect([name.value("font-size"), name.value("white-space")]).toEqual([`min(${NAME_SIZE}px, 100cqi / (var(--letters) * 0.75), (100cqh - ${ends}px) / ${lineHeight})`, "nowrap"]);

    const room = cardsRoom(basket, board.length, size);
    const [rowGap, columnGap] = [grid.rowGap(), grid.columnGap()];
    const least = Math.min(room.width, letters * 0.75 * NAME_SIZE + sides);
    const columns = Math.max(1, Math.floor((room.width + columnGap) / (least + columnGap)));
    const columnWidth = (room.width - columnGap * (columns - 1)) / columns;
    const rows = Math.ceil(names.length / columns);
    const cardHeight = Math.min((room.height - rowGap * (rows - 1)) / rows, card.px("max-height"));
    const nameSize = Math.min(NAME_SIZE, (columnWidth - sides) / (letters * 0.75), (cardHeight - ends) / lineHeight);

    expect([rowGap > 0, columnGap > 0, cardHeight > 0]).toEqual([true, true, true]);
    expect(rows * cardHeight + rowGap * (rows - 1)).toBeLessThanOrEqual(room.height + 0.01);
    // Each card is wide enough for its name at 14px.
    expect(names.filter((each) => (NAME_EMS[each] ?? Number.NaN) * NAME_SIZE + sides > columnWidth)).toEqual([]);
    // The name keeps 14px wherever the rows leave it the height; only a
    // basket too short for them takes it down to its card's height.
    expect(nameSize).toBeCloseTo(Math.min(NAME_SIZE, (cardHeight - ends) / lineHeight));
    if (!TIGHT.some(([width, height]) => width === size[0] && height === size[1])) expect(nameSize).toBe(NAME_SIZE);
    unmount();
  });
});
