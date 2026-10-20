import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { SortScreen, type Basket, type BasketView } from "../src/SortScreen.tsx";
import { BASKET_EMS, MARK_EMS, SPACE_EMS } from "./basketWidths.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_SORTABLES, fakeBodyPicture } from "./support.ts";

// sort-dinosaurs-basket-fit.feature: a basket filled as full as the game deals,
// its cards in rows, with a 14px name where it fits beside the picture,
// otherwise a picture alone with its accessible name.

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

// Only the browser's layout measurements and resize notifications are replaced:
// the screen decides whether the delivered strip belongs in the card's flow.
function layoutMeasurements() {
  const sizes = new Map<HTMLElement, Size>();
  const observers = new Map<() => void, Set<Element>>();
  for (const [property, axis] of [["clientWidth", 0], ["clientHeight", 1], ["offsetWidth", 0], ["offsetHeight", 1]] as const) {
    vi.spyOn(HTMLElement.prototype, property, "get").mockImplementation(function (this: HTMLElement) {
      return sizes.get(this)?.[axis] ?? 0;
    });
  }
  vi.stubGlobal("ResizeObserver", class {
    private targets = new Set<Element>();
    constructor(private changed: () => void) {
      observers.set(changed, this.targets);
    }
    observe(element: Element) { this.targets.add(element); }
    disconnect() { observers.delete(this.changed); }
  });
  return {
    set: (element: HTMLElement, size: Size) => sizes.set(element, size),
    resized: (...elements: Element[]) => {
      for (const [changed, targets] of observers) {
        if (elements.some((element) => targets.has(element))) changed();
      }
    },
    observed: () => [...observers.values()].flatMap((targets) => [...targets])
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stripSize(card: Element, size: Size): Size {
  const name = first(".sorted-name", card);
  const text = styleAt(name, size);
  const strip = styleAt(first(".sorted-footer", card), size);
  return [
    (NAME_EMS[name.textContent ?? ""] ?? Number.NaN) * text.px("font-size") + strip.px("padding-left") + strip.px("padding-right"),
    text.px("font-size") * Number(text.value("line-height")) + strip.px("padding-top") + strip.px("padding-bottom")
  ];
}

function measureCard(layout: ReturnType<typeof layoutMeasurements>, card: HTMLElement, size: Size, window: Size) {
  const strip = first(".sorted-footer", card) as HTMLElement;
  const natural = stripSize(card, window);
  layout.set(card, [Math.floor(size[0]), Math.floor(size[1])]);
  layout.set(strip, [Math.round(natural[0]), Math.round(natural[1])]);
  layout.resized(card, strip);
}

function expectCard(card: HTMLElement, width: number, height: number, size: Size) {
  const name = first(".sorted-name", card);
  const strip = styleAt(first(".sorted-footer", card), size);
  const art = styleAt(first(".sorted-art", card), size);
  const picture = first(".sorted-picture", card);
  const image = styleAt(picture, size);
  const [nameWidth, stripHeight] = stripSize(card, size);
  expect(styleAt(name, size).value("font-size")).toBe(`${NAME_SIZE}px`);
  expect(styleAt(name, size).value("white-space")).toBe("nowrap");
  expect([strip.value("width"), strip.value("flex-shrink"), strip.value("container-type")]).toEqual(["max-content", "0", "normal"]);
  expect([art.value("flex-grow"), art.value("flex-basis"), art.value("min-height")]).toEqual(["1", "0px", "0px"]);
  expect([image.value("width"), image.value("height"), image.value("object-fit")]).toEqual(["100%", "100%", "contain"]);
  expect(picture.getAttribute("alt")?.toLocaleUpperCase()).toBe(name.textContent);

  if (strip.value("visibility") === "visible") {
    expect(strip.value("position")).toBe("static");
    expect(nameWidth).toBeLessThanOrEqual(width);
    // At least 32px of picture plus its padding remains beside the strip.
    expect(height - stripHeight - art.px("padding-top") - art.px("padding-bottom")).toBeGreaterThanOrEqual(32);
  } else {
    expect(strip.value("visibility")).toBe("hidden");
    expect(strip.value("position")).toBe("absolute");
    // A hidden strip takes no height: the flexing picture gets the full card.
    expect([art.px("padding-top"), art.px("padding-bottom"), art.px("padding-left"), art.px("padding-right")]).toEqual([0, 0, 0, 0]);
    // Allow the spare pixel and integer rounding in the DOM measurements.
    expect(nameWidth > width || stripHeight + 48 + 2 > height).toBe(true);
  }
}

describe("a full basket", () => {
  it.each(CASES)("of $level's $basket, in $language at $size, wraps its cards inside the basket with 14px names or pictures alone", ({ cards, board, full, language, size }) => {
    const layout = layoutMeasurements();
    const { unmount } = openBasket(board, full, cards, language);
    const basket = document.querySelectorAll<HTMLElement>(".baskets .basket")[full];
    if (!basket) throw new Error("The board has no such basket");
    const area = first(".basket-cards", basket) as HTMLElement;
    const sortedCards = [...area.querySelectorAll<HTMLElement>(".sorted-card")];
    const names = sortedCards.map((card) => first(".sorted-name", card).textContent ?? "");
    const letters = Math.max(...names.map((name) => name.length));
    const grid = styleAt(area, size);
    const card = styleAt(first(".sorted-card", area), size);
    const footer = styleAt(first(".sorted-footer", area), size);
    const sides = footer.px("padding-left") + footer.px("padding-right");

    // Columns budget the longest name at 14px, at most 0.75 of its size a
    // letter, and share the remaining width; rows share the basket's height.
    expect([grid.value("display"), grid.value("grid-template-columns"), grid.value("grid-auto-rows"), area.style.getPropertyValue("--longest")]).toEqual([
      "grid",
      "repeat(auto-fill, minmax(min(100%, var(--least-card)), 1fr))",
      "minmax(0, 1fr)",
      String(letters)
    ]);
    // jsdom drops the spaces around a custom property's * and /.
    expect(grid.value("--least-card").replaceAll(" ", "")).toBe(`calc(var(--longest)*0.75*${NAME_SIZE}px+${sides}px)`);
    expect(["min-width", "min-height", "height", "display", "flex-direction"].map(card.value)).toEqual(["0px", "0px", "100%", "flex", "column"]);

    const room = cardsRoom(basket, board.length, size);
    const [rowGap, columnGap] = [grid.rowGap(), grid.columnGap()];
    const least = Math.min(room.width, letters * 0.75 * NAME_SIZE + sides);
    const columns = Math.max(1, Math.floor((room.width + columnGap) / (least + columnGap)));
    const columnWidth = (room.width - columnGap * (columns - 1)) / columns;
    const rows = Math.ceil(names.length / columns);
    const cardHeight = Math.min((room.height - rowGap * (rows - 1)) / rows, card.px("max-height"));

    expect([rowGap > 0, columnGap > 0, cardHeight > 0]).toEqual([true, true, true]);
    expect(rows * cardHeight + rowGap * (rows - 1)).toBeLessThanOrEqual(room.height + 0.01);
    expect(names.filter((each) => (NAME_EMS[each] ?? Number.NaN) * NAME_SIZE + sides > columnWidth)).toEqual([]);
    for (const sorted of sortedCards) {
      measureCard(layout, sorted, [columnWidth, cardHeight], size);
      expectCard(sorted, columnWidth, cardHeight, size);
    }
    unmount();
    expect(layout.observed()).toEqual([]);
  });

  it("rechecks width, height and the name's natural size as the same card resizes", () => {
    const layout = layoutMeasurements();
    openBasket(["plants", "meat"], 0, 6, "en");
    const card = first(".sorted-card") as HTMLElement;
    const strip = first(".sorted-footer", card) as HTMLElement;
    const size = [1920, 1080] as const;
    const [width, height] = stripSize(card, size);
    for (const [room, shown] of [
      [[width + 10, height + 60], true],
      [[width - 10, height + 60], false],
      [[width + 10, height + 60], true],
      [[width + 10, height + 40], false],
      [[width + 10, height + 60], true]
    ] as const) {
      measureCard(layout, card, room, size);
      expect(card.hasAttribute("data-name-fits")).toBe(shown);
      expectCard(card, ...room, size);
    }
    // A font can change the strip's natural width without changing the card.
    layout.set(strip, [width + 20, height]);
    layout.resized(strip);
    expect(getComputedStyle(strip).visibility).toBe("hidden");
    layout.set(strip, [width, height]);
    layout.resized(strip);
    expect(getComputedStyle(strip).visibility).toBe("visible");
  });
});
