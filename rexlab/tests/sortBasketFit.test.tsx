import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { SortScreen, type Basket, type BasketView } from "../src/SortScreen.tsx";
import { BASKET_EMS, MARK_EMS, SPACE_EMS } from "./basketWidths.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_SORTABLES, fakeBodyPicture } from "./support.ts";
import { openWindow, styleAt, windowsAnd, type WindowSize } from "./windowSizes.ts";

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

// The shared windows, more iPads' and a wide but short desktop one.
const WINDOWS = windowsAnd([1180, 820], [1366, 1024], [1506, 807]);

type Size = WindowSize;

const NAME_SIZE = 14;
// Lexend's normal line height, for a name that sets none.
const NORMAL_LINE = 1.25;

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

function measureBasket(layout: ReturnType<typeof layoutMeasurements>, area: HTMLElement, room: Size, window: Size) {
  const cards = [...area.querySelectorAll<HTMLElement>(".sorted-card")];
  layout.set(area, [Math.floor(room[0]), Math.floor(room[1])]);
  for (const card of cards) {
    const natural = stripSize(card, window);
    layout.set(first(".sorted-footer", card) as HTMLElement, [Math.round(natural[0]), Math.round(natural[1])]);
  }
  layout.resized(area);
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
    expect(Math.min((width - art.px("padding-left") - art.px("padding-right")) * 600 / 800,
      height - stripHeight - art.px("padding-top") - art.px("padding-bottom"))).toBeGreaterThanOrEqual(48);
  } else {
    expect(strip.value("visibility")).toBe("hidden");
    expect(strip.value("position")).toBe("absolute");
    // A hidden strip takes no height: the flexing picture gets the full card.
    expect([art.px("padding-top"), art.px("padding-bottom"), art.px("padding-left"), art.px("padding-right")]).toEqual([0, 0, 0, 0]);
    // The basket uses its widest strip for every card, including shorter names.
    const cards = [...(card.parentElement?.querySelectorAll(".sorted-card") ?? [])];
    const widest = Math.max(...cards.map((each) => stripSize(each, size)[0]));
    const tallest = Math.max(...cards.map((each) => stripSize(each, size)[1]));
    expect(widest + 2 > width || tallest + 48 + 16 + 2 > height || (width - 16) * 600 / 800 < 48).toBe(true);
  }
}

describe("a full basket", () => {
  it.each(CASES)("of $level's $basket, in $language at $size, wraps its cards inside the basket with 14px names or pictures alone", ({ cards, board, full, language, size }) => {
    openWindow(...size);
    const layout = layoutMeasurements();
    const { unmount } = openBasket(board, full, cards, language);
    const basket = document.querySelectorAll<HTMLElement>(".baskets .basket")[full];
    if (!basket) throw new Error("The board has no such basket");
    const area = first(".basket-cards", basket) as HTMLElement;
    const sortedCards = [...area.querySelectorAll<HTMLElement>(".sorted-card")];
    const names = sortedCards.map((card) => first(".sorted-name", card).textContent ?? "");
    const grid = styleAt(area, size);
    const card = styleAt(first(".sorted-card", area), size);

    expect([grid.value("display"), grid.value("grid-template-columns"), grid.value("grid-auto-rows")]).toEqual([
      "grid", "repeat(var(--columns, 1), minmax(0, 1fr))", "minmax(0, 1fr)"
    ]);
    expect(["min-width", "min-height", "height", "max-height", "display", "flex-direction"].map(card.value)).toEqual(["0px", "0px", "100%", "none", "flex", "column"]);

    const room = cardsRoom(basket, board.length, size);
    const [rowGap, columnGap] = [grid.rowGap(), grid.columnGap()];
    measureBasket(layout, area, [room.width, room.height], size);
    const columns = Number(area.style.getPropertyValue("--columns"));
    expect(columns).toBeGreaterThanOrEqual(1);
    expect(columns).toBeLessThanOrEqual(names.length);
    const columnWidth = (room.width - columnGap * (columns - 1)) / columns;
    const rows = Math.ceil(names.length / columns);
    const cardHeight = (room.height - rowGap * (rows - 1)) / rows;

    expect([rowGap > 0, columnGap > 0, cardHeight > 0]).toEqual([true, true, true]);
    expect(rows * cardHeight + rowGap * (rows - 1)).toBeLessThanOrEqual(room.height + 0.01);
    expect(columns * columnWidth + columnGap * (columns - 1)).toBeLessThanOrEqual(room.width + 0.01);
    const canGive40px = Array.from({ length: names.length }, (_, at) => at + 1).some((cols) => {
      const rows = Math.ceil(names.length / cols);
      return (room.width - columnGap * (cols - 1)) / cols * 600 / 800 >= 40 && (room.height - rowGap * (rows - 1)) / rows >= 40;
    });
    for (const sorted of sortedCards) {
      expectCard(sorted, columnWidth, cardHeight, size);
      if (canGive40px) {
        const art = styleAt(first(".sorted-art", sorted), size);
        const strip = styleAt(first(".sorted-footer", sorted), size).value("visibility") === "visible" ? stripSize(sorted, size)[1] : 0;
        expect(Math.min((columnWidth - art.px("padding-left") - art.px("padding-right")) * 600 / 800,
          cardHeight - strip - art.px("padding-top") - art.px("padding-bottom"))).toBeGreaterThanOrEqual(40);
      }
    }
    unmount();
    expect(layout.observed()).toEqual([]);
  });

  it("rechecks the basket's width, height and every name's natural size on resize", () => {
    const layout = layoutMeasurements();
    openBasket(["plants", "meat"], 0, 6, "en");
    const area = first(".basket-cards") as HTMLElement;
    const cards = [...area.querySelectorAll<HTMLElement>(".sorted-card")];
    const size = [1920, 1080] as const;
    for (const [room, shown] of [
      [[800, 100], true],
      [[390, 120], false],
      [[800, 100], true],
      [[800, 80], false],
      [[800, 100], true]
    ] as const) {
      measureBasket(layout, area, room, size);
      expect(cards.map((card) => card.hasAttribute("data-name-fits"))).toEqual(cards.map(() => shown));
    }
    // A font can change a strip's natural width without changing the basket.
    const strip = first(".sorted-footer", cards[cards.length - 1] ?? area) as HTMLElement;
    layout.set(strip, [220, 25]);
    layout.resized(strip);
    expect(cards.every((card) => getComputedStyle(first(".sorted-footer", card)).visibility === "hidden")).toBe(true);
    layout.set(strip, [100, 25]);
    layout.resized(strip);
    expect(cards.every((card) => getComputedStyle(first(".sorted-footer", card)).visibility === "visible")).toBe(true);
  });
});
