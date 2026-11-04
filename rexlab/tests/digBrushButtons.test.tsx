import type { Theme } from "../src/theme.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PortraitLayouts } from "../src/App.tsx";
import { twoLines } from "../src/DigBar.tsx";
import { TEXTS } from "../src/language/texts.ts";
import { board, brushAll, choiceCard, clearCells, openDigApp, placeBoard } from "./digApp.tsx";
import { homeTile, manualViewport, sameColour } from "./support.ts";
import { openWindow } from "./windowSizes.ts";

// dig-brush-choice.feature, as a phone upright meets it: DIG's brushes are
// two wide buttons under the board, in place of the bar's pair of buttons.

const NARROW_LAYOUTS: PortraitLayouts = { home: ["tall-narrow"], "dig-board": ["tall-narrow"], "dig-question": ["tall-narrow"] };

afterEach(() => {
  delete document.documentElement.dataset.size;
});

type Level = "hatchling" | "explorer" | "paleontologist";

function openPhone(level: Level = "hatchling", language: "en" | "ru" = "en", theme: Theme = "light") {
  openWindow(393, 852);
  const viewport = manualViewport("portrait");
  viewport.resize("tall-narrow", true);
  const app = openDigApp({ viewport, portraitLayouts: NARROW_LAYOUTS, ageLevel: { level, revision: "parent" }, language, theme });
  fireEvent.click(homeTile(TEXTS[language].dig));
  placeBoard(800);
  return app;
}

const buttons = () => document.querySelectorAll<HTMLButtonElement>(".dig-brush-buttons .dig-brush-button");
const pressed = () => [...buttons()].map((button) => button.getAttribute("aria-pressed"));

describe("the phone's brush buttons", () => {
  it.each(["en", "ru"] as const)("stand under the board in %s, each its dot and name, the bar keeping HOME and the FIELD GUIDE, the brush picked", (language) => {
    openPhone("hatchling", language);
    const bar = screen.getByRole("banner");
    const names = within(bar).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);

    expect(names).toEqual([TEXTS[language].home, TEXTS[language].fieldGuide]);
    expect(getComputedStyle(screen.getByLabelText(TEXTS[language].dugUp)).display).toBe("none");
    expect(getComputedStyle(document.querySelector(".dig-brush-picker")!).display).toBe("none");
    expect([...buttons()].map((button) => [button.textContent, button.querySelector(".dig-brush-dot")!.hasAttribute("data-wide")]))
      .toEqual([[TEXTS[language].brush, false], [TEXTS[language].wideBrush, true]]);
    expect(screen.getByRole("button", { name: TEXTS[language].wideBrush })).toBe(buttons()[1]);
    expect(pressed()).toEqual(["true", "false"]);
  });

  it("picks the wide brush and back on a tap, clearing no sand", () => {
    openPhone();
    fireEvent.click(buttons()[1]!);
    expect(pressed()).toEqual(["false", "true"]);
    fireEvent.click(buttons()[0]!);
    expect([pressed(), clearCells()]).toEqual([["true", "false"], []]);
  });

  it.each(["light", "dark"] as const)("fills the picked one in amber, the other on paper, each at least 48 tall, in the %s theme", (theme) => {
    openPhone("hatchling", "en", theme);
    const look = () => [...buttons()].map((button) => {
      const own = getComputedStyle(button);
      return [sameColour(own.backgroundColor, own.getPropertyValue("--ds-reward")), sameColour(own.backgroundColor, own.getPropertyValue("--ds-label")), Number.parseFloat(own.height) >= 48];
    });

    expect(look()).toEqual([[true, false, true], [false, true, true]]);
    fireEvent.click(buttons()[1]!);
    expect(look()).toEqual([[false, true, true], [true, false, true]]);
  });

  it("rest once the right name is picked, until the next round", () => {
    openPhone("explorer");
    brushAll();
    fireEvent.click(choiceCard());

    expect([...buttons()].map((button) => button.disabled)).toEqual([true, true]);
  });

  it("are not on the board of a wide window, the picker in the bar there instead", () => {
    openDigApp({ ageLevel: { level: "hatchling", revision: null } });
    fireEvent.click(homeTile(TEXTS.en.dig));

    expect(getComputedStyle(document.querySelector(".dig-brush-buttons")!).display).toBe("none");
    expect(screen.getByRole("button", { name: TEXTS.en.wideBrush }).closest(".dig-bar")).not.toBeNull();
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
