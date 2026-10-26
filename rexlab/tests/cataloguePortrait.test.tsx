import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type PortraitLayouts } from "../src/App.tsx";
import type { ChipWidths } from "../src/FoodChips.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { emChipWidths, manualChipWidths } from "./chipWidths.ts";
import { expectCompactControls } from "./compactCatalogueControls.ts";
import { LANDSCAPE_NAME, cardDetails, cardName } from "./catalogueCards.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import {
  SHIPPED_CATALOGUE,
  SHIPPED_DINOSAURS,
  emptyCare,
  emptyDig,
  emptyPairs,
  emptyProgress,
  emptySkeletons,
  emptySorting,
  fakeBodyPicture,
  featuring,
  lightDevice,
  loadedPictures,
  manualViewport,
  memoryStorage,
  pageAtRest,
  seededRandom,
  unreadVersion,
  unsetAgeLevel,
  type ManualViewport
} from "./support.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// catalogue-portrait.feature. The turn between the layouts is
// catalogue-turn.feature's; here each window is opened in its layout.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], catalogue: ["tall"] };

// "The list stands upright": each window, its cards in a row, each card's
// width, and the single row of food symbols.
const UPRIGHT = [
  [600, 800, 2, 234, "one row"],
  [744, 1133, 2, 306, "one row"],
  [768, 1024, 2, 318, "one row"],
  [810, 1080, 3, 219, "one row"],
  [820, 1180, 3, 223, "one row"],
  [1024, 1366, 4, 213, "one row"],
  [1400, 1500, 4, 307, "one row"]
] as const;

// "Every word fits the tall windows": the language, the window's width,
// 1000 tall, and the measured arrangement the symbol row must tolerate.
const WORDS: ReadonlyArray<readonly [Language, number, "stacked" | "closed" | "spaced"]> = [
  ["en", 600, "stacked"],
  ["ru", 600, "stacked"],
  ["ru", 700, "stacked"],
  ["en", 744, "closed"],
  ["ru", 744, "closed"],
  ["ru", 820, "spaced"]
];

// An iPad mini upright, catalogue-portrait.feature's "Safe areas stay
// clear upright": its rounded corners under the status bar, and its home
// indicator. An iPad upright has no inset at its sides.
const IPAD_MINI_UPRIGHT: SafeArea = { top: 24, right: 0, bottom: 20, left: 0 };

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const px = (value: string) => Number.parseFloat(value) || 0;

const part = (selector: string, within: ParentNode = document) => {
  const found = within.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

const grid = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].catalogue });
const cards = (language: Language = "en") => within(grid(language)).getAllByRole("button");
const chipGroup = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].foodChoice });
const chips = (language: Language = "en") => within(chipGroup(language)).getAllByRole("button");
const gateShown = () => part(".orientation-gate").hasAttribute("data-shown");

// The app in a window `width` by `height`, in `language`, upright unless
// `viewport` stands otherwise, its chips' parts measured from the em
// tables, opened on the list of every dinosaur.
async function openList(
  width: number,
  height: number,
  { language = "en", viewport = manualViewport("portrait"), chipWidths = emChipWidths() }: { language?: Language; viewport?: ManualViewport; chipWidths?: ChipWidths } = {}
) {
  openWindow(width, height);
  const user = userEvent.setup({ delay: null });
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={PORTRAIT_LAYOUTS}
      viewport={viewport}
      progress={emptyProgress()}
      deviceLanguage={DEVICES[language]}
      languageStore={localLanguage(() => memoryStorage())}
      nameVersion={unreadVersion}
      {...lightDevice()}
      {...unsetAgeLevel()}
      {...loadedPictures()}
      {...emptyCare()}
      {...emptySorting()}
      {...emptyPairs()}
      {...emptySkeletons()}
      {...emptyDig()}
      {...pageAtRest()}
      chipWidths={chipWidths}
    />
  );
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
  return { viewport, user };
}

// The properties a sum reads or assumes, as the rules that match in a
// window of `size` set them: a rule that sets one to anything the sum
// does not model fails here.
function sized(element: Element, size: WindowSize, expected: Record<string, string>) {
  const at = styleAt(element, size);
  // jsdom writes a zero length as the stylesheet does, with or without
  // its unit.
  const set = (property: string) => (at.value(property) === "0" && expected[property]?.endsWith("px") ? "0px" : at.value(property));
  expect(Object.fromEntries(Object.keys(expected).map((property) => [property, set(property)]))).toEqual(expected);
}

// The upright list as the browser lays it out from the stylesheet: the
// screen a column of the bar and the list, the bar a row of HOME
// and the food symbols, and the list a grid of `--columns` equal columns
// inside its padding and its scrollbar, where one takes room: as wide as
// the list's box is wider than its client area. A size set any other way
// fails here, since these sums would not see it.
function uprightList(size: WindowSize, language: Language = "en") {
  const [width] = size;
  const main = part(".catalogue");
  const bar = part(".catalogue-bar");
  const home = screen.getByRole("button", { name: TEXTS[language].home });
  const list = grid(language);
  expect([...main.children]).toEqual([bar, list]);
  expect([...bar.children]).toEqual([home, chipGroup(language)]);
  sized(main, size, { display: "flex", "flex-direction": "column" });
  sized(bar, size, { display: "flex", "flex-direction": "row", "align-items": "center", "padding-top": "0px", "padding-bottom": "0px" });
  sized(home, size, { "margin-top": "0px", "margin-left": "0px", "align-self": "auto" });
  sized(chipGroup(language), size, { "align-self": "auto", "margin-top": "0px", "margin-left": "0px", "margin-right": "0px" });
  sized(list, size, { display: "grid", "grid-template-columns": "repeat(var(--columns), minmax(0, 1fr))", "padding-top": "0px", "margin-top": "0px" });
  const [mainStyle, barStyle, listStyle] = [main, bar, list].map((element) => getComputedStyle(element));
  if (!mainStyle || !barStyle || !listStyle) throw new Error("No style for the list");
  const columns = Number(listStyle.getPropertyValue("--columns"));
  const gap = styleAt(list, size).columnGap();
  const inside = width - px(mainStyle.paddingLeft) - px(mainStyle.paddingRight);
  const scrollbar = list.offsetWidth - list.clientWidth;
  const controls = expectCompactControls(size, language);
  const cardsTop = px(mainStyle.paddingTop) + controls.height + styleAt(main, size).rowGap();
  expect(cardsTop).toBeLessThan(size[1]);
  return {
    home: { left: px(mainStyle.paddingLeft) + px(barStyle.paddingLeft), top: px(mainStyle.paddingTop) },
    // The gap beside HOME, and the cards under the controls.
    chipsBeside: styleAt(bar, size).rowGap(),
    cardsUnder: styleAt(main, size).rowGap(),
    chipRow: inside - px(barStyle.paddingLeft) - px(barStyle.paddingRight),
    columns,
    card: (inside - scrollbar - px(listStyle.paddingLeft) - px(listStyle.paddingRight) - gap * (columns - 1)) / columns
  };
}

describe("the list of every dinosaur upright", () => {
  it.each(UPRIGHT)(
    "in a %i by %i window shows no picture asking to turn, HOME beside the food symbols, and the 52 cards %i to a row, each %i wide, the chips in %s",
    async (width, height, columns, card) => {
      await openList(width, height);
      const layout = uprightList([width, height]);

      expect([document.documentElement.dataset.size, gateShown()]).toEqual(["tall", false]);
      expect([layout.home, layout.chipsBeside, layout.cardsUnder]).toEqual([{ left: 56, top: 40 }, 24, 28]);
      expectCompactControls([width, height]);
      expect(layout.columns).toBe(columns);
      expect(Math.abs(layout.card - card)).toBeLessThanOrEqual(1);
      expect(cards().map((each) => each.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.map(({ name }) => name.en));
    }
  );

  it("counts the window's side insets out of its row, as a tall window with them holds one card fewer", async () => {
    // 1060 wide, an inset of 18 on each side leaves four cards of 213;
    // one more pixel leaves room for three.
    const sheet = (insets: { left: number; right: number }) => Object.assign(document.createElement("style"), { textContent: appStylesheet({ top: 0, bottom: 0, ...insets }) });
    const tight = { left: 19, right: 18 };
    const inset = sheet(tight);
    document.head.append(inset);
    onTestFinished(() => inset.remove());

    await openList(1060, 1400, { viewport: manualViewport("portrait", tight) });

    const layout = uprightList([1060, 1400]);
    expect(layout.columns).toBe(3);
    expect(layout.card).toBeGreaterThanOrEqual(213);
    expect(layout.home.left).toBe(56 + 19);
  });

  it("narrows the cards, never their count, by a 15-pixel scrollbar in a 1024 wide window: four to a row", async () => {
    // A scrollbar that takes room takes it from the list's client area.
    const scrollbar = 15;
    const list = (element: HTMLElement) => element.classList.contains("catalogue-grid");
    const offset = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return list(this) ? 1024 : 0;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return list(this) ? 1024 - scrollbar : 0;
    });
    onTestFinished(() => [offset, client].forEach((spy) => spy.mockRestore()));

    const { viewport } = await openList(1024, 1366);
    act(() => viewport.resize("tall", true));

    const layout = uprightList([1024, 1366]);
    expect(layout.columns).toBe(4);
    expect(layout.card).toBe((1024 - 112 - scrollbar - 3 * 20) / 4);
    expect(layout.card).toBeLessThan(213);
  });
});

describe("compact controls upright", () => {
  it.each([
    [40, "spaced", 82, "closed"],
    [82, "closed", 122, "stacked"],
    [122, "stacked", 82, "closed"],
    [82, "closed", 40, "spaced"]
  ] as const)("a font notification changes PLANTS from %i px (%s) to %i px (%s) without resizing", async (before, from, after, to) => {
    const contents = (word: number) => [{ symbols: 22, word: 58, count: 37 }, { symbols: 22, word, count: 37 }, { symbols: 46, word: 60, count: 36 }];
    const widths = manualChipWidths(contents(before));
    await openList(744, 1133, { chipWidths: widths });
    const size: WindowSize = [744, 1133];
    const row = uprightList(size).chipRow;
    expect(row).toBe(632);
    expect(chipGroup().dataset.arrangement).toBe(from);
    expectCompactControls(size);

    widths.set(contents(after));
    expect(chipGroup().dataset.arrangement).toBe(from);
    act(() => widths.notify());

    expect([window.innerWidth, window.innerHeight]).toEqual(size);
    expect(chipGroup().dataset.arrangement).toBe(to);
    expectCompactControls(size);
    expect(chips().every((chip) => getComputedStyle(chip).whiteSpace === "nowrap")).toBe(true);
  });

  it.each(WORDS)("fits symbols in %s in a %i by 1000 window regardless of the measured %s arrangement, and keeps every card name as large as in landscape", async (language, width, arrangement) => {
    await openList(width, 1000, { language });
    const size: WindowSize = [width, 1000];
    const layout = uprightList(size, language);
    expect(chipGroup(language).dataset.arrangement).toBe(arrangement);
    // Portrait symbols replace the word-and-count spacing in every arrangement.
    expectCompactControls(size, language);

    // The names' widths in ems are rounded up, and sizes hold to within
    // a pixel.
    const names = cards(language).map((card) => cardName(card, layout.card));
    expect(names.filter(({ size, over, wraps }) => size < LANDSCAPE_NAME || over > 1 || wraps).map(({ words }) => words)).toEqual([]);
    expect(
      cards(language).map((card) => {
        const row = getComputedStyle(part(".catalogue-chips", card));
        return [row.display, row.flexDirection || "row", row.flexWrap || "nowrap", part(".catalogue-chips", card).children.length];
      })
    ).toEqual(cards(language).map(() => ["flex", "row", "nowrap", 3]));
  });

  it.each(["en", "ru"] as const)("fits every card's height, weight and food tag in its footer in %s, on the narrowest upright card, 213 wide", async (language) => {
    await openList(1024, 1366, { language });
    const layout = uprightList([1024, 1366], language);
    expect(layout.card).toBe(213);

    const details = cards(language).map((card) => cardDetails(card, layout.card));

    expect(details).toHaveLength(SHIPPED_CATALOGUE.length);
    expect(details.filter(({ over }) => over > 0).map(({ name }) => name)).toEqual([]);
  });

  it("keeps one symbol row as measured arrangements change with the window width", async () => {
    const { viewport } = await openList(820, 1180);
    expect(chipGroup().dataset.arrangement).toBe("spaced");

    openWindow(744, 1133);
    act(() => viewport.resize("tall", true));
    expect(chipGroup().dataset.arrangement).toBe("closed");
    expectCompactControls([744, 1133]);

    openWindow(600, 800);
    act(() => viewport.resize("tall", true));
    expect(chipGroup().dataset.arrangement).toBe("stacked");
    expectCompactControls([600, 800]);

    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect(chipGroup().dataset.arrangement).toBe("spaced");
  });

  it.each(["en", "ru"] as const)("keeps words, counts and landscape spacing beside HOME in %s", async (language) => {
    await openList(1024, 768, { language, viewport: manualViewport("landscape") });

    expect([document.documentElement.dataset.size, chipGroup(language).hasAttribute("data-arrangement")]).toEqual(["wide", false]);
    for (const label of chipGroup(language).querySelectorAll(".food-chip-word, .food-chip-count")) expect(getComputedStyle(label).display).not.toBe("none");
    for (const face of chipGroup(language).querySelectorAll(".food-chip:not([data-food=all]) .food-chip-face")) {
      const style = styleAt(face, [1024, 768]);
      expect([style.px("padding-left"), style.px("padding-right"), style.columnGap()]).toEqual([20, 10, 10]);
    }
    expect(getComputedStyle(part(".catalogue-home-word")).display).not.toBe("none");
    expect(getComputedStyle(part(".catalogue-bar")).flexDirection || "row").toBe("row");
  });
});

// The place each card rises in at, in the stagger.
const places = () => cards().map((card) => card.style.getPropertyValue("--card"));

describe("the cards rising in upright", () => {
  it("rise in by the row they stand in: two, then three after a resize", async () => {
    const { viewport, user } = await openList(744, 1133);
    expect(grid().dataset.rise).toBe("true");
    expect(places()).toEqual(SHIPPED_CATALOGUE.map((_, index) => String(Math.min(index, 1))));

    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    await user.click(screen.getByRole("button", { name: "PLANTS" }));

    expect(grid().dataset.rise).toBe("true");
    expect(places()).toEqual(SHIPPED_CATALOGUE.filter(({ diet }) => diet === "plants").map((_, index) => String(Math.min(index, 2))));
  });
});

describe("the list upright, used", () => {
  it("shows only the 26 meat-eaters, three to a row, for MEAT, and all 52 again for ALL", async () => {
    const { user } = await openList(820, 1180);

    await user.click(screen.getByRole("button", { name: "MEAT" }));

    expect(cards()).toHaveLength(26);
    expect(cards().map((card) => card.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.filter(({ diet }) => diet === "meat").map(({ name }) => name.en));
    expect(uprightList([820, 1180]).columns).toBe(3);

    await user.click(screen.getByRole("button", { name: "ALL" }));

    expect(cards()).toHaveLength(52);
  });

  it("opens a card's page, which the picture asking to turn fades in over", async () => {
    const { user } = await openList(820, 1180);
    expect(gateShown()).toBe(false);

    await user.click(within(grid()).getByRole("button", { name: "Triceratops" }));

    expect(screen.getByRole("heading", { level: 1, hidden: true }).textContent).toBe("TRICERATOPS");
    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect(getComputedStyle(part(".orientation-gate")).animation).toMatch(/^fade-in /);
  });

  it("is covered by the picture asking to turn as the window becomes tall and narrow", async () => {
    const { viewport } = await openList(820, 1180);
    const list = grid();

    openWindow(393, 852);
    act(() => viewport.resize("tall-narrow", true));

    expect([gateShown(), part(".gated-screen").hasAttribute("inert")]).toEqual([true, true]);
    expect(screen.getByRole("img", { name: TEXTS.en.turnSideways })).toBeDefined();
    expect(within(part(".gated-screen")).getByRole("group", { name: TEXTS.en.catalogue, hidden: true })).toBe(list);
  });

  it("keeps clear of an iPad mini's safe areas at 744 by 1133, the last card ending above the home indicator, and its background at the window's edges", async () => {
    await openList(744, 1133);
    const main = part(".catalogue");
    const measure = () => {
      const style = getComputedStyle(main);
      const list = getComputedStyle(grid());
      return {
        layout: uprightList([744, 1133]),
        padding: { top: px(style.paddingTop), bottom: px(style.paddingBottom) },
        box: [style.boxSizing, style.height, style.position],
        // The list fills the height the bar leaves, and scrolls inside
        // its own padding.
        list: [list.flexGrow, list.flexShrink, list.flexBasis, list.overflowY, px(list.paddingBottom)]
      };
    };
    const without = measure();
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(IPAD_MINI_UPRIGHT) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());

    const inset = measure();

    expect([inset.padding.top - without.padding.top, inset.padding.bottom - without.padding.bottom]).toEqual([IPAD_MINI_UPRIGHT.top, IPAD_MINI_UPRIGHT.bottom]);
    expect(inset.layout.home.top).toBe(40 + IPAD_MINI_UPRIGHT.top);
    expect(inset.box).toEqual(without.box);
    expect(inset.box).toEqual(["border-box", "1133px", "relative"]);
    // The list ends at the screen's padding over the home indicator, and
    // its last card 48 pixels above that, once scrolled to its end.
    expect(inset.list).toEqual(["1", "1", "0px", "auto", 48]);
    // So scrolled to its end, the last card's bottom stands 48 pixels over
    // the list's, which is the window's less the screen's bottom padding,
    // the home indicator in it.
    const listBottom = 1133 - inset.padding.bottom;
    expect(listBottom - px(getComputedStyle(grid()).paddingBottom)).toBeLessThanOrEqual(1133 - IPAD_MINI_UPRIGHT.bottom);
    expect(listBottom).toBeLessThanOrEqual(1133 - IPAD_MINI_UPRIGHT.bottom);
    expect([inset.layout.columns, inset.layout.card]).toEqual([without.layout.columns, without.layout.card]);
  });

  it("scrolled to its end at 744 by 1133 with the home indicator, shows its last card whole, above the indicator", async () => {
    await openList(744, 1133);
    const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(IPAD_MINI_UPRIGHT) });
    document.head.append(sheet);
    onTestFinished(() => sheet.remove());
    const list = grid();
    const cards = [...list.children].filter((child) => child.classList.contains("catalogue-card"));
    const { columns, card } = uprightList([744, 1133]);
    const [main, bar, listStyle] = [part(".catalogue"), part(".catalogue-bar"), list].map((element) => getComputedStyle(element));
    if (!main || !bar || !listStyle) throw new Error("No style for the screen");
    // The screen as its flex column lays it out: the bar at the top, at
    // its height, and the list growing into what is left over the
    // screen's bottom padding, less its own margins.
    const barHeight = expectCompactControls([744, 1133]).height;
    const listTop = px(main.paddingTop) + barHeight + styleAt(part(".catalogue"), [744, 1133]).rowGap() + px(listStyle.marginTop);
    const listBottom = 1133 - px(main.paddingBottom) - px(listStyle.marginBottom);
    const rowHeight = (card * 200) / 317 + 14 + 1.25 * Math.min(20, 0.07 * card) + 10 + 32 + 18;
    const rows = Math.ceil(cards.length / columns);
    const gap = px(listStyle.rowGap);
    const content = px(listStyle.paddingTop) + rows * rowHeight + (rows - 1) * gap + px(listStyle.paddingBottom);
    const clientHeight = listBottom - listTop;
    Object.defineProperties(list, { clientHeight: { configurable: true, value: clientHeight }, scrollHeight: { configurable: true, value: content } });
    list.scrollTop = list.scrollHeight - list.clientHeight;
    const lastTop = listTop + px(listStyle.paddingTop) + (rows - 1) * (rowHeight + gap) - list.scrollTop;

    expect([listStyle.flexGrow, listStyle.flexShrink, listStyle.flexBasis, listStyle.height, listStyle.maxHeight, listStyle.overflowY]).toEqual(["1", "1", "0px", "auto", "none", "auto"]);
    expect(content).toBeGreaterThan(clientHeight);
    expect(lastTop).toBeGreaterThanOrEqual(listTop);
    expect(lastTop + rowHeight).toBeLessThanOrEqual(listBottom);
    expect(lastTop + rowHeight).toBeLessThanOrEqual(1133 - IPAD_MINI_UPRIGHT.bottom - 48);
  });
});
