import { gameDoor } from "./support.ts";
import { emptyLabyrinth } from "./support.ts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.tsx";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { localLanguage } from "../src/localLanguage.ts";
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
import { openWindow } from "./windowSizes.ts";

type SafeArea = { top: number; right: number; bottom: number; left: number };

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

// The catalogue in a wide-short window `width` by `height` with the side
// insets of `insets`, in `language`. What the browser lays out there is
// catalogueFit.browser.cjs's; here are the size class, the cards to a row
// the screen sets and the controls working.
async function openShort(width: number, height: number, insets: SafeArea, language: Language = "en") {
  openWindow(width, height);
  const viewport = manualViewport("landscape", { left: insets.left, right: insets.right });
  viewport.resize("wide-short", false);
  const user = userEvent.setup({ delay: null });
  render(
    <App {...emptyLabyrinth()}
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
  await user.click(gameDoor(TEXTS[language].catalogue));
  return { viewport, user };
}

describe("the catalogue in a wide-short window", () => {
  it.each([...PHONES, ...BETWEEN])("is wide-short at %i by %i, HOME beside the food symbols, %#: the cards %i to a row", async (width, height, insets, columns) => {
    await openShort(width, height, insets);
    expect(document.documentElement.dataset.size).toBe("wide-short");
    expect([...part(".catalogue-bar").children]).toEqual([screen.getByRole("button", { name: TEXTS.en.home }), chipGroup()]);
    expect(grid().style.getPropertyValue("--columns")).toBe(String(columns));
  });

  it.each(["en", "ru"] as const)("keeps filtering and HOME working in %s on a phone on its side", async (language) => {
    const { user } = await openShort(667, 375, PHONES[0][2], language);
    await user.click(within(chipGroup(language)).getByRole("button", { name: TEXTS[language].diets.meat }));
    expect(cards(language).map((card) => card.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.filter(({ diet }) => diet === "meat").map(({ name }) => name[language]));
    await user.click(screen.getByRole("button", { name: TEXTS[language].home }));
    expect(gameDoor(TEXTS[language].catalogue)).toBeDefined();
  });

  it("goes back to four to a row when the window grows past 600 tall", async () => {
    const { viewport } = await openShort(852, 393, PHONES[1][2]);
    openWindow(1180, 820);
    viewport.resize("wide", false);
    await screen.findByRole("group", { name: TEXTS.en.catalogue });
    expect(document.documentElement.dataset.size).toBe("wide");
    expect(grid().style.getPropertyValue("--columns")).toBe("4");
  });
});
