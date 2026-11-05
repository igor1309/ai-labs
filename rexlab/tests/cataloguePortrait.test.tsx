import { gameDoor } from "./support.ts";
import { emptyLabyrinth } from "./support.ts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { App, type PortraitLayouts } from "../src/App.tsx";
import type { ChipWidths } from "../src/FoodChips.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { emChipWidths, manualChipWidths } from "./chipWidths.ts";
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
import { openWindow, type WindowSize } from "./windowSizes.ts";

// catalogue-portrait.feature. The turn between the layouts is
// catalogue-turn.feature's; here each window is opened in its layout.

// The screens with a portrait layout, as the browser's app has them.
const PORTRAIT_LAYOUTS: PortraitLayouts = { home: ["tall"], catalogue: ["tall"] };

// "The list stands upright": each window and its cards in a row.
const UPRIGHT = [
  [600, 800, 2],
  [744, 1133, 2],
  [768, 1024, 2],
  [810, 1080, 3],
  [820, 1180, 3],
  [1024, 1366, 4],
  [1400, 1500, 4]
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

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

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
    <App {...emptyLabyrinth()}
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
  await user.click(gameDoor(TEXTS[language].catalogue));
  return { viewport, user };
}

// The cards to a row the screen sets on its list; the browser fit
// contract measures that they stand whole.
const columns = (language: Language = "en") => Number(grid(language).style.getPropertyValue("--columns"));

describe("the list of every dinosaur upright", () => {
  it.each(UPRIGHT)(
    "in a %i by %i window shows no picture asking to turn, HOME beside the food symbols, and the 52 cards %i to a row",
    async (width, height, count) => {
      await openList(width, height);

      expect([document.documentElement.dataset.size, gateShown()]).toEqual(["tall", false]);
      expect([...part(".catalogue-bar").children]).toEqual([screen.getByRole("button", { name: TEXTS.en.home }), chipGroup()]);
      expect(columns()).toBe(count);
      expect(cards().map((each) => each.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.map(({ name }) => name.en));
    }
  );

  it("counts the window's side insets out of its row, as a tall window with them holds one card fewer", async () => {
    // 1060 wide, an inset of 18 on each side leaves four cards of 213;
    // one more pixel leaves room for three.
    const tight = { left: 19, right: 18 };

    await openList(1060, 1400, { viewport: manualViewport("portrait", tight) });

    expect(columns()).toBe(3);
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

    expect(columns()).toBe(4);
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
    expect(chipGroup().dataset.arrangement).toBe(from);

    widths.set(contents(after));
    expect(chipGroup().dataset.arrangement).toBe(from);
    act(() => widths.notify());

    expect([window.innerWidth, window.innerHeight]).toEqual(size);
    expect(chipGroup().dataset.arrangement).toBe(to);
    expect(chips().every((chip) => getComputedStyle(chip).whiteSpace === "nowrap")).toBe(true);
  });

  it.each(WORDS)("lays the symbols in %s in a %i by 1000 window out %s, every card's chips in one row", async (language, width, arrangement) => {
    await openList(width, 1000, { language });
    expect(chipGroup(language).dataset.arrangement).toBe(arrangement);
    expect(cards(language).map((card) => part(".catalogue-chips", card).children.length)).toEqual(cards(language).map(() => 3));
  });

  it("keeps one symbol row as measured arrangements change with the window width", async () => {
    const { viewport } = await openList(820, 1180);
    expect(chipGroup().dataset.arrangement).toBe("spaced");

    openWindow(744, 1133);
    act(() => viewport.resize("tall", true));
    expect(chipGroup().dataset.arrangement).toBe("closed");

    openWindow(600, 800);
    act(() => viewport.resize("tall", true));
    expect(chipGroup().dataset.arrangement).toBe("stacked");

    openWindow(820, 1180);
    act(() => viewport.resize("tall", true));
    expect(chipGroup().dataset.arrangement).toBe("spaced");
  });

  it.each(["en", "ru"] as const)("keeps words, counts and landscape spacing beside HOME in %s", async (language) => {
    await openList(1024, 768, { language, viewport: manualViewport("landscape") });

    expect([document.documentElement.dataset.size, chipGroup(language).hasAttribute("data-arrangement")]).toEqual(["wide", false]);
    for (const label of chipGroup(language).querySelectorAll(".food-chip-word, .food-chip-count")) expect(getComputedStyle(label).display).not.toBe("none");
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
    expect(columns()).toBe(3);

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
});
