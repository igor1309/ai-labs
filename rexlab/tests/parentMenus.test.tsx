import { act, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { MENU_EXIT } from "../src/ParentMenu.tsx";
import { openMenu, outsideMenu } from "./menus.ts";
import { openHomeApp } from "./skeletonsApp.tsx";
import { contrast, manualPictures, seenOn, surfaceOf, type ManualPictures } from "./support.ts";

// age-level-menu.feature

const DEVICES: Record<Language, string> = { en: "en-GB", ru: "ru-RU" };

const THEMES = ["light", "dark"] as const;

const SCREEN = { width: 1024, height: 768 };

// jsdom lays nothing out, so the width of each age level's name and age
// is given here in ems of its face, rounded up: Lexend's for the Latin
// words, and the iPad's own face for the Cyrillic ones, which Lexend has
// no letters for. The names at their bold, the chosen one's; the ages at
// their regular weight.
const LEVEL_EMS: Record<string, number> = {
  HATCHLING: 6.3,
  EXPLORER: 5.5,
  PALEONTOLOGIST: 9.7,
  ДЕТЁНЫШ: 5.2,
  ИССЛЕДОВАТЕЛЬ: 8.8,
  ПАЛЕОНТОЛОГ: 7.6,
  "about 4": 3.8,
  "about 5": 3.8,
  "6 and up": 4.3,
  "около 4 лет": 5.4,
  "около 5 лет": 5.3,
  "6 лет и старше": 6.8
};

const px = (value: string) => Number.parseFloat(value) || 0;

const partOf = (selector: string) => {
  const part = document.querySelector(selector);
  if (!part) throw new Error(`No ${selector} on the page`);
  return part;
};

const textWidth = (text: Element) => {
  const words = text.textContent ?? "";
  const style = getComputedStyle(text);
  return (LEVEL_EMS[words] ?? Number.NaN) * px(style.fontSize) + px(style.letterSpacing) * words.length;
};

// The contrast of a text with what it is seen on.
const textContrast = (text: Element) => {
  const surface = surfaceOf(text);
  return contrast(seenOn(getComputedStyle(text).color, surface), surface);
};

const list = () => document.querySelector<HTMLElement>(".parent-menu-list");

describe("the age level menu", () => {
  it.each(LANGUAGES.flatMap((language) => THEMES.map((theme) => [language, theme] as const)))(
    "fits and reads on a 1024 by 768 screen, in %s and the %s theme",
    async (language, theme) => {
      const { user } = openHomeApp({ deviceLanguage: DEVICES[language], appearance: theme });

      const menu = await openMenu(user, TEXTS[language].ageLevelMenu);

      // The menu hangs under the parents' menus, its right edge on theirs,
      // which stand at the corner's right.
      const style = getComputedStyle(menu);
      expect([style.position, style.top, style.right, style.boxSizing]).toEqual(["absolute", "calc(100% + 8px)", "0px", "border-box"]);
      const corner = getComputedStyle(partOf(".home-corner"));
      const menus = getComputedStyle(partOf(".parent-menus"));
      const right = SCREEN.width - px(corner.right) - px(corner.paddingRight);
      expect(right - px(style.width)).toBeGreaterThanOrEqual(0);
      const choices = within(menu).getAllByRole("menuitemradio");
      const rows = choices.map((choice) => px(getComputedStyle(choice).height));
      const height = px(style.paddingTop) + rows.reduce((sum, row) => sum + row, 0) + px(style.gap) * (rows.length - 1) + px(style.paddingBottom);
      const buttons = [...partOf(".parent-menus").querySelectorAll(".parent-menu-button")].map((button) => px(getComputedStyle(button).minHeight));
      const top = px(corner.top) + px(corner.paddingTop) + px(menus.paddingTop) + Math.max(...buttons) + px(menus.paddingBottom) + 8;
      expect(top + height).toBeLessThanOrEqual(SCREEN.height);

      // Each name and age stands on one line beside the picture and room
      // for the ✓, which the chosen row draws.
      const room = px(style.width) - px(style.paddingLeft) - px(style.paddingRight);
      const tick = px(within(menu).getByRole("menuitemradio", { checked: true }).querySelector("svg.lucide-check")?.getAttribute("width") ?? "");
      expect(tick).toBeGreaterThan(0);
      for (const choice of choices) {
        const row = getComputedStyle(choice);
        const picture = choice.querySelector(".parent-menu-picture");
        const words = choice.querySelector(".parent-menu-words");
        if (!picture || !words) throw new Error("A level without its picture or words");
        const wordsRoom = room - px(row.paddingLeft) - px(row.paddingRight) - px(getComputedStyle(picture).width) - tick - px(row.gap) * 2;
        for (const text of words.children) {
          expect(getComputedStyle(text).whiteSpace).toBe("nowrap");
          expect(textWidth(text)).toBeLessThanOrEqual(wordsRoom);
          expect(textContrast(text)).toBeGreaterThanOrEqual(4.5);
        }
        expect(words.children).toHaveLength(2);
      }
    }
  );
});

// The parents' menus, by their labels in English.
const MENUS = { language: "Language", theme: "Theme", "age level": "Age level" } as const;

type Menu = keyof typeof MENUS;

describe("the parents' menus' ✓", () => {
  it.each((Object.keys(MENUS) as Menu[]).flatMap((menu) => THEMES.map((theme) => [menu, theme] as const)))(
    "of the %s menu keeps 3:1 with the chosen row in the %s theme",
    async (menu, theme) => {
      const { user } = openHomeApp({ appearance: theme });

      const opened = await openMenu(user, MENUS[menu]);

      const chosen = within(opened).getByRole("menuitemradio", { checked: true });
      const tick = chosen.querySelector("svg.lucide-check");
      if (!tick) throw new Error("The chosen row has no ✓");
      expect(contrast(getComputedStyle(tick).color, surfaceOf(chosen))).toBeGreaterThanOrEqual(3);
    }
  );
});

// What closes an open menu without a choice.
const CLOSINGS = {
  "tapping outside it": (user: UserEvent) => user.click(outsideMenu()),
  "tapping its button again": (user: UserEvent, label: string) => user.click(screen.getByRole("button", { name: label })),
  "pressing Escape": (user: UserEvent) => user.keyboard("{Escape}")
};

type Closing = keyof typeof CLOSINGS;

const ROWS: Array<[Menu, Closing]> = [
  ["language", "tapping outside it"],
  ["theme", "tapping its button again"],
  ["age level", "pressing Escape"],
  ["age level", "tapping outside it"]
];

const leaving = () => list()?.hasAttribute("data-leaving");

const exitsRunning = (pictures: ManualPictures) => pictures.timers().filter((ms) => ms === MENU_EXIT).length;

const faceOf = (label: string) => {
  const face = screen.getByRole("button", { name: label }).querySelector(".parent-menu-face");
  if (!face) throw new Error(`The ${label} button shows nothing`);
  return face;
};

// The device's wish for reduced motion changes only the motion tokens
// app.css times the menus by, which motion.test.ts proves: the menus stay
// as long either way.
describe.each([false, true])("the parents' menus, with reduced motion %s", (reducedMotion) => {
  it.each(ROWS)("animate the %s menu in, out when a choice closes it, and out when %s closes it", async (menu, closing) => {
    const pictures = manualPictures();
    const { user } = openHomeApp({ pictures, reducedMotion });
    const before = faceOf(MENUS[menu]);
    expect(before.hasAttribute("data-changed")).toBe(false);

    const opened = await openMenu(user, MENUS[menu]);
    expect(leaving()).toBe(false);
    const [another] = within(opened).getAllByRole("menuitemradio", { checked: false });
    if (!another) throw new Error(`The ${menu} menu offers nothing else`);
    await user.click(another);

    // Chosen in English, the language menu is named in Russian from then on.
    const label = menu === "language" ? TEXTS.ru.languageMenu : MENUS[menu];
    expect(screen.queryByRole("menu")).toBeNull();
    expect([leaving(), list()?.getAttribute("aria-hidden"), exitsRunning(pictures)]).toEqual([true, "true", 1]);
    const after = faceOf(label);
    expect(after.hasAttribute("data-changed")).toBe(true);
    expect(after.innerHTML).not.toBe(before.innerHTML);
    act(() => pictures.fire(MENU_EXIT));
    expect(list()).toBeNull();

    await openMenu(user, label);
    await CLOSINGS[closing](user, label);
    expect(screen.queryByRole("menu")).toBeNull();
    expect([leaving(), exitsRunning(pictures)]).toEqual([true, 1]);
    // The face stays as it is when nothing is chosen.
    expect(faceOf(label)).toBe(after);
    act(() => pictures.fire(MENU_EXIT));
    expect(list()).toBeNull();
  });

  it.each(Object.values(MENUS))("take the rest of a double tap on a %s choice on the leaving menu, pressing nothing", async (label) => {
    const pictures = manualPictures();
    const { user } = openHomeApp({ pictures, reducedMotion });
    const opened = await openMenu(user, label);
    const [another] = within(opened).getAllByRole("menuitemradio", { checked: false });
    if (!another) throw new Error(`The ${label} menu offers nothing else`);
    await user.click(another);
    const chosen = document.querySelector(".parent-menus")?.innerHTML;

    // The leaving menu stands over the page and catches the tap.
    expect([leaving(), list()?.hasAttribute("inert"), getComputedStyle(list() ?? document.body).pointerEvents]).toEqual([true, false, "auto"]);
    await user.click(another);

    expect([document.querySelector(".games-tiles") !== null, screen.queryByRole("menu")]).toEqual([true, null]);
    expect(document.querySelector(".parent-menus")?.innerHTML).toBe(chosen);
  });

  it.each(Object.values(MENUS))("bring the %s menu back at once when it is opened again while it animates out", async (label) => {
    const pictures = manualPictures();
    const { user } = openHomeApp({ pictures, reducedMotion });
    await openMenu(user, label);
    await user.click(outsideMenu());
    expect(leaving()).toBe(true);

    const menu = await openMenu(user, label);

    expect([menu, leaving(), menu.getAttribute("aria-hidden"), exitsRunning(pictures)]).toEqual([list(), false, null, 0]);
  });
});
