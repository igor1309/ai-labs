import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
import { LANDSCAPE_NAME, cardDetails, cardName } from "./catalogueCards.ts";
import { expectCompactControls } from "./compactCatalogueControls.ts";
import { emChipWidths } from "./chipWidths.ts";
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
  unsetAgeLevel
} from "./support.ts";
import { appStylesheet, type SafeArea } from "./stylesheet.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// iPhones on their side, full screen: the smallest, a common one and the
// largest, each with the insets its notch and home indicator take, and
// the cards to a row each holds.
const PHONES = [
  [667, 375, { top: 0, right: 0, bottom: 21, left: 0 }, 2],
  [852, 393, { top: 0, right: 59, bottom: 21, left: 59 }, 3],
  [932, 430, { top: 0, right: 59, bottom: 21, left: 59 }, 3]
] as const;

// Phones between them, at the widths where a row's cards are widest, so
// tallest: just short of a third column, with and without the notch.
const BETWEEN = [
  [718, 375, { top: 0, right: 0, bottom: 21, left: 0 }, 2],
  [836, 375, { top: 0, right: 59, bottom: 21, left: 59 }, 2]
] as const;

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const part = (selector: string, within: ParentNode = document) => {
  const found = within.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector} on the page`);
  return found;
};

const grid = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].catalogue });
const cards = (language: Language = "en") => within(grid(language)).getAllByRole("button");
const chipGroup = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].foodChoice });

// The catalogue in a wide-short window `width` by `height` with the
// safe-area insets `insets`, in `language`.
async function openShort(width: number, height: number, insets: SafeArea, language: Language = "en") {
  openWindow(width, height);
  const sheet = document.createElement("style");
  sheet.textContent = appStylesheet(insets);
  document.head.append(sheet);
  onTestFinished(() => sheet.remove());
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const user = userEvent.setup({ delay: null });
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={{}}
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
      chipWidths={emChipWidths()}
    />
  );
  await user.click(screen.getByRole("button", { name: TEXTS[language].catalogueTile }));
  return { viewport, user };
}

// Each card's width: the window less the page's sides, past the notch,
// and the list's, shared by its columns 20 apart.
function cardWidth(size: WindowSize, language: Language = "en") {
  const at = styleAt(grid(language), size);
  const main = styleAt(part(".catalogue"), size);
  const columns = Number(getComputedStyle(grid(language)).getPropertyValue("--columns"));
  expect(at.value("grid-template-columns")).toBe("repeat(var(--columns), minmax(0, 1fr))");
  return { columns, card: (size[0] - main.px("padding-left") - main.px("padding-right") - at.px("padding-left") - at.px("padding-right") - at.columnGap() * (columns - 1)) / columns };
}

// A length the stylesheet writes as a sum of pixels and the window's
// height, as 100vh, in a window `height` tall.
function pixels(value: string, height: number) {
  const sum = /^calc\((.*)\)$/.exec(value)?.[1] ?? value;
  return sum.split(/\s+(?=[-+]\s)/).reduce((total, term) => {
    const [, sign = "+", amount = "", unit = ""] = /^([-+])?\s*([\d.]+)(px|d?vh)$/.exec(term.trim()) ?? [];
    if (!amount) throw new Error(`No sum for ${term} in ${value}`);
    const length = unit.endsWith("vh") ? (Number(amount) * height) / 100 : Number(amount);
    return sign === "-" ? total - length : total + length;
  }, 0);
}

// A card's height in a window of `size`, `card` wide, its name `name`
// pixels: its picture, 200/317 of its width but no taller than its rule
// lets it be, over its footer, its padding, its name's line, the gap and
// the 32-pixel chips; and the room the list leaves under the bar, over
// its end.
// jsdom resolves no vh against the test's window, so the picture's
// highest is read from its rule as the window's insets write it.
function cardHeight(size: WindowSize, insets: SafeArea, card: number, name: number, language: Language) {
  const first = cards(language)[0]!;
  expect(styleAt(part(".catalogue-art", first), size).value("aspect-ratio")).toBe("317 / 200");
  const [, highest = ""] = /html\[data-size="wide-short"\] \.catalogue-art \{\s*max-height: ([^;]+);/.exec(appStylesheet(insets)) ?? [];
  const picture = Math.min((card * 200) / 317, pixels(highest, size[1]));
  const footer = styleAt(part(".catalogue-footer", first), size);
  const tall = picture + footer.px("padding-top") + name * 1.25 + footer.rowGap() + 32 + footer.px("padding-bottom");
  const main = styleAt(part(".catalogue"), size);
  return { tall, room: size[1] - main.px("padding-top") - main.px("padding-bottom") - 48 - main.rowGap() - styleAt(grid(language), size).px("padding-bottom") };
}

describe("the catalogue in a wide-short window", () => {
  it.each([...PHONES, ...BETWEEN])("stands in one short bar over %i by %i, the cards %#: HOME beside the food symbols, 8 under the top, 20 past each side's inset", async (width, height, insets, columns) => {
    await openShort(width, height, insets);
    const size: WindowSize = [width, height];
    expect(document.documentElement.dataset.size).toBe("wide-short");
    const main = styleAt(part(".catalogue"), size);
    const bar = styleAt(part(".catalogue-bar"), size);
    const list = styleAt(grid(), size);
    expect([main.px("padding-top"), main.px("padding-left"), main.px("padding-right"), main.px("padding-bottom"), main.rowGap()]).toEqual([8, insets.left, insets.right, insets.bottom, 12]);
    expect([bar.px("padding-left"), bar.px("padding-right"), bar.columnGap()]).toEqual([20, 20, 8]);
    expect([list.px("padding-left"), list.px("padding-right"), list.px("padding-bottom"), list.value("overflow-y")]).toEqual([20, 20, 20, "auto"]);
    expect(cardWidth(size).columns).toBe(columns);
  });

  it.each((["en", "ru"] as const).flatMap((language) => PHONES.map(([width, height, insets]) => [language, width, height, insets] as const)))("fits HOME and the food symbols on one row of 48-pixel taps in %s at %i by %i", async (language, width, height, insets) => {
    await openShort(width, height, insets, language);
    const size: WindowSize = [width, height];
    const { height: chip } = expectCompactControls(size, language);
    expect([chip, styleAt(screen.getByRole("button", { name: TEXTS[language].home }), size).px("height")]).toEqual([48, 48]);
  });

  it.each((["en", "ru"] as const).flatMap((language) => [...PHONES, ...BETWEEN].map(([width, height, insets]) => [language, width, height, insets] as const)))("stands every card whole in the height the bar leaves, its name as large as in landscape, in %s at %i by %i", async (language, width, height, insets) => {
    await openShort(width, height, insets, language);
    const size: WindowSize = [width, height];
    const { card } = cardWidth(size, language);
    const names = cards(language).map((each) => cardName(each, card));
    expect(names.filter(({ size: nameSize, over, wraps }) => nameSize < LANDSCAPE_NAME || over > 1 || wraps).map(({ words }) => words)).toEqual([]);
    expect(cards(language).map((each) => cardDetails(each, card)).filter(({ over }) => over > 0).map(({ name }) => name)).toEqual([]);
    const { tall, room } = cardHeight(size, insets, card, Math.max(...names.map(({ size: nameSize }) => nameSize)), language);
    expect(tall).toBeLessThanOrEqual(room);
  });

  it.each((["en", "ru"] as const).flatMap((language) => [...PHONES, ...BETWEEN].map(([width, height, insets]) => [language, width, height, insets] as const)))("scrolls the list to its last row, whole and clear of the home indicator, in %s at %i by %i", async (language, width, height, insets) => {
    await openShort(width, height, insets, language);
    const size: WindowSize = [width, height];
    const list = grid(language);
    const { columns, card } = cardWidth(size, language);
    const { tall } = cardHeight(size, insets, card, 20, language);
    const main = styleAt(part(".catalogue"), size);
    const listStyle = styleAt(list, size);
    // The screen as its flex column lays it out: the bar at the top, and
    // the list growing into what is left over the screen's bottom
    // padding, the home indicator in it.
    expect([listStyle.value("flex-grow"), listStyle.value("flex-shrink"), listStyle.value("flex-basis"), listStyle.value("height") || "auto", listStyle.value("max-height") || "none", listStyle.value("overflow-y")]).toEqual(["1", "1", "0px", "auto", "none", "auto"]);
    const listTop = main.px("padding-top") + 48 + main.rowGap();
    const listBottom = height - main.px("padding-bottom");
    const rows = Math.ceil(cards(language).length / columns);
    const content = rows * tall + (rows - 1) * listStyle.rowGap() + listStyle.px("padding-bottom");
    const clientHeight = listBottom - listTop;
    expect(content).toBeGreaterThan(clientHeight);
    const lastTop = listTop + (rows - 1) * (tall + listStyle.rowGap()) - (content - clientHeight);
    expect(lastTop).toBeGreaterThanOrEqual(listTop);
    expect(lastTop + tall - (height - insets.bottom - 20)).toBeLessThanOrEqual(1e-9);
  });

  it.each(["en", "ru"] as const)("keeps filtering and HOME working in %s on a phone on its side", async (language) => {
    const { user } = await openShort(667, 375, PHONES[0][2], language);
    await user.click(within(chipGroup(language)).getByRole("button", { name: TEXTS[language].diets.meat }));
    expect(cards(language).map((card) => card.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.filter(({ diet }) => diet === "meat").map(({ name }) => name[language]));
    await user.click(screen.getByRole("button", { name: TEXTS[language].home }));
    expect(screen.getByRole("button", { name: TEXTS[language].catalogueTile })).toBeDefined();
  });

  it("goes back to four to a row when the window grows past 600 tall", async () => {
    const { viewport } = await openShort(852, 393, PHONES[1][2]);
    openWindow(1180, 820);
    viewport.resize("wide", false);
    await screen.findByRole("group", { name: TEXTS.en.catalogue });
    expect(getComputedStyle(grid()).getPropertyValue("--columns")).toBe("4");
    expect(styleAt(grid(), [1180, 820]).px("padding-left")).toBe(56);
  });
});
