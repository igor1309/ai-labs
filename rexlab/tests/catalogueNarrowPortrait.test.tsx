import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// iPhones upright: one with its display zoomed, or a window in Slide
// Over, the smallest iPhone, and the common ones.
const PHONES = [
  [320, 568],
  [375, 667],
  [390, 844],
  [393, 852],
  [430, 932]
] as const;

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

// The catalogue's list of every dinosaur in a tall-narrow window `width`
// by `height`, in `language`, its chips' parts measured from the em
// tables.
async function openNarrow(width: number, height: number, language: Language = "en") {
  openWindow(width, height);
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  const user = userEvent.setup({ delay: null });
  render(
    <App
      {...featuring()}
      dinosaurs={SHIPPED_DINOSAURS}
      catalogue={SHIPPED_CATALOGUE}
      bodyPicture={fakeBodyPicture}
      random={seededRandom(11)}
      portraitLayouts={{ home: ["tall", "tall-narrow"], catalogue: ["tall", "tall-narrow"] }}
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

// The width of each card in a window of `size`: the list's row on its
// 20-pixel sides, shared equally by its columns 20 apart. A grid laid out
// any other way, or a card sized by any rule of its own, fails here,
// since this sum would not see it.
function cardWidth(size: WindowSize, language: Language = "en") {
  const list = grid(language);
  const at = styleAt(list, size);
  // The page and its list fill the window across, no rule sizing them.
  for (const box of [part(".catalogue"), list]) {
    const boxAt = styleAt(box, size);
    expect([boxAt.value("width") || "auto", boxAt.value("max-width") || "none", boxAt.px("margin-left"), boxAt.px("margin-right")]).toEqual(["auto", "none", 0, 0]);
  }
  expect([at.value("display"), at.value("grid-template-columns"), at.px("margin-left"), at.px("margin-right")]).toEqual(["grid", "repeat(var(--columns), minmax(0, 1fr))", 0, 0]);
  for (const card of cards(language).slice(0, 2)) {
    const cardAt = styleAt(card, size);
    expect([cardAt.value("width") || "auto", cardAt.value("max-width") || "none", cardAt.px("margin-left"), cardAt.px("margin-right"), cardAt.value("grid-column") || "auto"]).toEqual(["auto", "none", 0, 0, "auto"]);
  }
  const columns = Number(getComputedStyle(list).getPropertyValue("--columns"));
  const main = getComputedStyle(part(".catalogue"));
  return (size[0] - px(main.paddingLeft) - px(main.paddingRight) - at.px("padding-left") - at.px("padding-right") - at.columnGap() * (columns - 1)) / columns;
}

describe("the catalogue in a tall-narrow window", () => {
  it.each(PHONES)("stands upright in a %i by %i window: HOME beside the food symbols, the cards under them one to a row on 20-pixel sides", async (width, height) => {
    await openNarrow(width, height);
    const size: WindowSize = [width, height];
    expect(document.documentElement.dataset.size).toBe("tall-narrow");
    expect(part(".orientation-gate").hasAttribute("data-shown")).toBe(false);

    const main = part(".catalogue");
    const bar = part(".catalogue-bar");
    const home = screen.getByRole("button", { name: TEXTS.en.home });
    expect([...main.children]).toEqual([bar, grid()]);
    expect([...bar.children]).toEqual([home, chipGroup()]);
    const at = (element: Element, properties: string[]) => properties.map((property) => styleAt(element, size).value(property));
    expect(at(main, ["flex-direction", "gap"])).toEqual(["column", "20px"]);
    expect(at(bar, ["flex-direction", "align-items", "padding-left", "padding-right", "gap"])).toEqual(["row", "center", "20px", "20px", "8px"]);
    expect(at(grid(), ["padding-left", "padding-right", "padding-bottom"])).toEqual(["20px", "20px", "48px"]);
    expect(getComputedStyle(grid()).getPropertyValue("--columns")).toBe("1");
    expect(cardWidth(size)).toBe(width - 40);
  });

  it.each((["en", "ru"] as const).flatMap((language) => PHONES.map(([width, height]) => [language, width, height] as const)))("fits symbol filters beside HOME in %s at %i by %i without scrolling", async (language, width, height) => {
    await openNarrow(width, height, language);
    expectCompactControls([width, height], language);
  });

  it.each(["en", "ru"] as const)("keeps localized names, pressed state, filtering and HOME working in %s at 320 wide", async (language) => {
    const { user } = await openNarrow(320, 568, language);
    for (const food of ["meat", "plants", "both", "all"] as const) {
      const name = food === "all" ? TEXTS[language].everyFood : TEXTS[language].diets[food];
      await user.click(within(chipGroup(language)).getByRole("button", { name }));
      expect(chips(language).map((chip) => chip.getAttribute("aria-pressed"))).toEqual(["all", "meat", "plants", "both"].map((value) => String(value === food)));
      expect(cards(language).map((card) => card.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.filter(({ diet }) => food === "all" || diet === food).map(({ name }) => name[language]));
      expectCompactControls([320, 568], language);
    }
    await user.click(screen.getByRole("button", { name: TEXTS[language].home }));
    expect(screen.queryByRole("group", { name: TEXTS[language].foodChoice })).toBeNull();
    expect(screen.getByRole("button", { name: TEXTS[language].catalogueTile })).toBeDefined();
  });

  it.each((["en", "ru"] as const).flatMap((language) => [320, 375].map((width) => [language, width] as const)))("fits every word in %s at %i wide: every card's name on one line as large as in landscape, and its height, weight and food tag", async (language, width) => {
    await openNarrow(width, 667, language);
    const size: WindowSize = [width, 667];
    const card = cardWidth(size, language);
    const names = cards(language).map((each) => cardName(each, card));
    expect(names).toHaveLength(SHIPPED_CATALOGUE.length);
    expect(names.filter(({ size: nameSize, over, wraps }) => nameSize < LANDSCAPE_NAME || over > 1 || wraps).map(({ words }) => words)).toEqual([]);
    const details = cards(language).map((each) => cardDetails(each, card));
    expect(details.filter(({ over }) => over > 0).map(({ name }) => name)).toEqual([]);
  });

  it.each(PHONES)("keeps every tap at least 44 pixels in a %i by %i window", async (width, height) => {
    await openNarrow(width, height);
    const size: WindowSize = [width, height];
    expectCompactControls(size);
    // A card is its picture, 200/317 of its width tall, over its footer.
    const card = cardWidth(size);
    expect(card).toBeGreaterThanOrEqual(44);
    expect(styleAt(part(".catalogue-art", cards()[0]), size).value("aspect-ratio")).toBe("317 / 200");
    expect((card * 200) / 317).toBeGreaterThanOrEqual(44);
  });

  it("goes back to the tall layout, two to a row, when the window grows to 600 by 800", async () => {
    const { viewport } = await openNarrow(375, 667);
    openWindow(600, 800);
    viewport.resize("tall", true);
    await screen.findByRole("group", { name: TEXTS.en.catalogue });
    expect(document.documentElement.dataset.size).toBe("tall");
    expect(styleAt(grid(), [600, 800]).px("padding-left")).toBe(56);
  });
});
