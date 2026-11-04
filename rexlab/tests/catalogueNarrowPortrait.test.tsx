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
    <App {...emptyLabyrinth()}
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
  await user.click(gameDoor(TEXTS[language].catalogue));
  return { viewport, user };
}

describe("the catalogue in a tall-narrow window", () => {
  it.each(PHONES)("stands upright in a %i by %i window: HOME beside the food symbols, the cards under them one to a row", async (width, height) => {
    await openNarrow(width, height);
    expect(document.documentElement.dataset.size).toBe("tall-narrow");
    expect(part(".orientation-gate").hasAttribute("data-shown")).toBe(false);

    const main = part(".catalogue");
    const bar = part(".catalogue-bar");
    const home = screen.getByRole("button", { name: TEXTS.en.home });
    expect([...main.children]).toEqual([bar, grid()]);
    expect([...bar.children]).toEqual([home, chipGroup()]);
    expect(grid().style.getPropertyValue("--columns")).toBe("1");
  });


  it.each(["en", "ru"] as const)("keeps localized names, pressed state, filtering and HOME working in %s at 320 wide", async (language) => {
    const { user } = await openNarrow(320, 568, language);
    for (const food of ["meat", "plants", "both", "all"] as const) {
      const name = food === "all" ? TEXTS[language].everyFood : TEXTS[language].diets[food];
      await user.click(within(chipGroup(language)).getByRole("button", { name }));
      expect(chips(language).map((chip) => chip.getAttribute("aria-pressed"))).toEqual(["all", "meat", "plants", "both"].map((value) => String(value === food)));
      expect(cards(language).map((card) => card.getAttribute("aria-label"))).toEqual(SHIPPED_CATALOGUE.filter(({ diet }) => food === "all" || diet === food).map(({ name }) => name[language]));
    }
    await user.click(screen.getByRole("button", { name: TEXTS[language].home }));
    expect(screen.queryByRole("group", { name: TEXTS[language].foodChoice })).toBeNull();
    expect(gameDoor(TEXTS[language].catalogue)).toBeDefined();
  });



  it("goes back to the tall layout, two to a row, when the window grows to 600 by 800", async () => {
    const { viewport } = await openNarrow(375, 667);
    openWindow(600, 800);
    viewport.resize("tall", true);
    await screen.findByRole("group", { name: TEXTS.en.catalogue });
    expect(document.documentElement.dataset.size).toBe("tall");
    expect(grid().style.getPropertyValue("--columns")).toBe("2");
  });
});
