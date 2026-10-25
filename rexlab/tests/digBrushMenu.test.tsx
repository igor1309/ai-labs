import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { twoLines } from "../src/DigBar.tsx";
import { MENU_EXIT } from "../src/ParentMenu.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { board, brushAll, choiceCard, clearCells, openDigApp, placeBoard } from "./digApp.tsx";
import { homeTile, manualViewport } from "./support.ts";
import { openWindow } from "./windowSizes.ts";

// dig-brush-menu.feature: on a phone upright DIG's brushes are a menu
// opened from the title's brush, in place of the bar's pair of buttons.

const NARROW_LAYOUTS: PortraitLayouts = { home: ["tall-narrow"], "dig-board": ["tall-narrow"], "dig-question": ["tall-narrow"] };

afterEach(() => {
  delete document.documentElement.dataset.size;
});

type Level = "hatchling" | "explorer" | "paleontologist";

function openPhone(level: Level = "hatchling", language: "en" | "ru" = "en", theme: "light" | "dark" = "light") {
  openWindow(393, 852);
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  const app = openDigApp({ viewport, portraitLayouts: NARROW_LAYOUTS, ageLevel: { level, revision: "parent" }, language, theme });
  fireEvent.click(homeTile(TEXTS[language].dig));
  placeBoard(800);
  return app;
}

const menuButton = (language: "en" | "ru" = "en") => screen.getByRole<HTMLButtonElement>("button", { name: TEXTS[language].brushMenu });
const menu = () => screen.queryByRole("menu");
const face = () => menuButton().querySelector(".dig-brush-dot")!;

describe("the phone's brush menu", () => {
  it.each(["en", "ru"] as const)("stands after HOME in %s, the bar's pair of buttons and DUG UP gone, the brush picked", (language) => {
    openPhone("hatchling", language);
    const bar = screen.getByRole("banner");
    const names = within(bar).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);

    expect(names).toEqual([TEXTS[language].home, TEXTS[language].brushMenu, TEXTS[language].fieldGuide]);
    expect(getComputedStyle(screen.getByLabelText(TEXTS[language].dugUp)).display).toBe("none");
    expect([menuButton(language).getAttribute("aria-expanded"), menuButton(language).querySelector(".dig-brush-dot")!.hasAttribute("data-wide")]).toEqual(["false", false]);
  });

  it("opens on a tap, the brush ticked, and picks the wide brush, closing and clearing no sand", () => {
    const app = openPhone();
    fireEvent.click(menuButton());
    const choices = within(menu()!).getAllByRole("menuitemradio");

    expect(choices.map((choice) => [choice.textContent, choice.getAttribute("aria-checked")])).toEqual([[TEXTS.en.brush, "true"], [TEXTS.en.wideBrush, "false"]]);
    fireEvent.click(choices[1]!);
    app.timers.fire(MENU_EXIT);

    expect([menu(), menuButton().getAttribute("aria-expanded"), face().hasAttribute("data-wide"), clearCells()]).toEqual([null, "false", true, []]);
    fireEvent.click(menuButton());
    expect(within(menu()!).getAllByRole("menuitemradio").map((choice) => choice.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it.each([
    ["light", "rgb(227, 155, 45)", "rgb(29, 39, 66)"],
    ["dark", "rgb(242, 178, 75)", "rgb(24, 30, 46)"]
  ] as const)("is DIG's amber brush in the %s theme, closed and open, its dot dark", (theme, amber, dot) => {
    openPhone("hatchling", "en", theme);
    const look = () => [getComputedStyle(menuButton()).backgroundColor, getComputedStyle(face()).backgroundColor];

    expect(look()).toEqual([amber, dot]);
    fireEvent.click(menuButton());
    expect(look()).toEqual([amber, dot]);
  });

  it("closes on a tap outside it, which brushes nothing and keeps the brush", () => {
    const app = openPhone();
    fireEvent.click(menuButton());
    fireEvent.click(document.querySelector(".dig-brush-menu .menu-backdrop")!);
    app.timers.fire(MENU_EXIT);

    expect([menu(), face().hasAttribute("data-wide"), clearCells()]).toEqual([null, false, []]);
    expect(board()).toBeTruthy();
  });

  it("rests once the right name is picked, until the next round", () => {
    openPhone("explorer");
    brushAll();
    fireEvent.click(choiceCard());

    expect(menuButton().disabled).toBe(true);
    fireEvent.click(menuButton());
    expect(menu()).toBeNull();
  });

  it("is not on the board of a wide window, the pair of buttons there instead", () => {
    openDigApp({ ageLevel: { level: "hatchling", revision: null } });
    fireEvent.click(homeTile(TEXTS.en.dig));

    expect(screen.queryByRole("button", { name: TEXTS.en.brushMenu })).toBeNull();
    expect(screen.getByRole("button", { name: TEXTS.en.wideBrush })).toBeTruthy();
  });
});

describe("a title on two lines", () => {
  it.each([
    ["DIG", 1, 3],
    ["WHO IS IT?", 2, 6],
    ["КТО ЭТО?", 2, 4],
    ["РАСКОПКИ", 1, 8],
    ["A BB CCC DDDD", 2, 8]
  ])("splits %s into %i lines, the longer %i letters, the least it can be", (words, count, longest) => {
    const lines = twoLines(words);
    expect([lines.length, Math.max(...lines.map((line) => line.length)), lines.join(" ")]).toEqual([count, longest, words]);
  });
});
