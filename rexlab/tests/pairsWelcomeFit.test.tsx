import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { TOP_CLIMB_LEVEL } from "../src/pairs/index.ts";
import { NARROW_WELCOME, pairsWelcomeType, pairsWelcomeWidth, PORTRAIT_WELCOME } from "../src/pairsWelcomeLayout.ts";
import { PairsWelcomeScreen } from "../src/PairsWelcomeScreen.tsx";
import { TITLE_EMS } from "./homeTitles.ts";
import { LEVEL_EMS } from "./levelEms.ts";
import { withPictures } from "./pictures.tsx";
import { fakeBodyPicture } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// find-the-pair-welcome-portrait.feature's words at the narrowest tall
// window. jsdom lays nothing out: the delivered CSS is budgeted with the
// titles' and the levels' measured widths in ems, and conservative ones,
// 0.8 em a glyph, for PLAY and the chips' numbers.
const GLYPH_EMS = 0.8;

const element = (selector: string, root: ParentNode = document) => {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

// The document stands in a tall window, as App marks it.
function tallWindow(size: WindowSize) {
  openWindow(...size);
  document.documentElement.dataset.size = "tall";
  onTestFinished(() => void delete document.documentElement.dataset.size);
}

// What a symbol drawn straight into a row takes of it.
const symbolWidth = (row: Element) => Number(element("svg", row).getAttribute("width"));

describe("an upright welcome's words fit the narrowest width", () => {
  it.each([
    ["en", 0], ["ru", 0], ["en", 16], ["ru", 16]
  ] as const)("keeps every word of a %s welcome on its line in a 600 by 1000 window with a %i-pixel scrollbar", (language, scrollbar) => {
    const size: WindowSize = [600, 1000];
    tallWindow(size);
    const width = pairsWelcomeWidth(600, 0, 0, scrollbar);
    const type = pairsWelcomeType(width);
    const text = TEXTS[language];
    // The highest climb level and a long run of stars, Hatchling's chips
    // at their widest.
    render(
      <PairsWelcomeScreen
        language={language} level="hatchling" climbLevel={TOP_CLIMB_LEVEL} stars={999}
        heroPicture={fakeBodyPicture("triceratops")} onLevel={() => {}} onPlay={() => {}} onHome={() => {}} type={type}
      />,
      withPictures
    );
    const at = (selector: string) => styleAt(element(selector), size);
    const outer = at(".pairs-welcome");
    expect([outer.px("padding-left"), outer.px("padding-right")]).toEqual([32, 32]);
    const start = at(".pairs-start");
    expect([start.value("width"), start.px("max-width"), start.value("align-items")]).toEqual(["100%", 648, "center"]);
    const column = Math.min(648, width);

    // The title on one line beside its mark, at least 50.
    const heading = screen.getByRole("heading");
    const title = styleAt(heading, size);
    expect(heading.textContent).toBe(text.pairs);
    expect([title.value("flex-wrap"), title.value("white-space"), title.px("font-size"), title.px("letter-spacing")]).toEqual(["nowrap", "nowrap", type.title, 0]);
    expect(type.title).toBeGreaterThanOrEqual(50);
    const ems = TITLE_EMS[text.pairs];
    if (ems === undefined) throw new Error(`No width for ${text.pairs}`);
    expect(at(".pairs-mark").px("width") + title.columnGap() + ems * title.px("font-size")).toBeLessThanOrEqual(column + 1e-9);

    // Every level's name on one line under its picture, at least 14.
    const switcher = screen.getByRole("group", { name: text.ageLevelSwitch });
    const switchStyle = styleAt(switcher, size);
    expect([switchStyle.value("width"), switchStyle.px("max-width"), switchStyle.value("border-top-style"), switchStyle.value("grid-template-columns")]).toEqual(["100%", 648, "none", "repeat(3, 1fr)"]);
    const third = (column - switchStyle.px("padding-left") - switchStyle.px("padding-right") - 2 * switchStyle.columnGap()) / 3;
    for (const button of within(switcher).getAllByRole("button")) {
      const level = styleAt(button, size);
      const name = element(".level-switch-name", button).textContent ?? "";
      expect(element(".level-switch-picture", button).nextElementSibling).toBe(element(".level-switch-name", button));
      expect([level.value("flex-direction"), level.value("white-space"), level.px("font-size")]).toEqual(["column", "nowrap", type.levelName]);
      expect(type.levelName).toBeGreaterThanOrEqual(14);
      const nameEms = LEVEL_EMS[name];
      if (nameEms === undefined) throw new Error(`No width for ${name}`);
      expect(nameEms * level.px("font-size") + level.px("letter-spacing") * name.length + level.px("padding-left") + level.px("padding-right"), name).toBeLessThanOrEqual(third + 1e-9);
    }

    // The climb level and the stars side by side, each on one line.
    const chips = at(".pairs-chips");
    expect([chips.value("display"), chips.value("flex-direction") || "row", chips.value("flex-wrap") || "nowrap"]).toEqual(["flex", "row", "nowrap"]);
    const shownChips = [screen.getByLabelText(text.level), screen.getByLabelText(text.starsEarned)];
    expect(shownChips.map((chip) => chip.textContent)).toEqual([String(TOP_CLIMB_LEVEL), "999"]);
    const chipsWidth = shownChips.reduce((sum, chip) => {
      const own = styleAt(chip, size);
      expect([own.value("flex-shrink"), own.value("display")]).toEqual(["0", "flex"]);
      return sum + own.px("padding-left") + own.px("padding-right") + symbolWidth(chip) + own.columnGap() + GLYPH_EMS * (chip.textContent ?? "").length * own.px("font-size");
    }, chips.columnGap());
    expect(chipsWidth).toBeLessThanOrEqual(column);

    // PLAY on one line.
    const play = screen.getByRole("button", { name: text.play });
    const playStyle = styleAt(play, size);
    expect(play.textContent).toBe(text.play);
    expect(playStyle.px("padding-left") + playStyle.px("padding-right") + symbolWidth(play) + playStyle.columnGap() + GLYPH_EMS * text.play.length * playStyle.px("font-size")).toBeLessThanOrEqual(column);
  });

  it("sizes the title by the longer of either language", () => {
    const titles = LANGUAGES.map((language) => TEXTS[language].pairs);
    const widest = titles.reduce((wide, title) => ((TITLE_EMS[title] ?? Infinity) > (TITLE_EMS[wide] ?? Infinity) ? title : wide));
    expect(TITLE_EMS[widest]).toBe(PORTRAIT_WELCOME.widestTitleEms);
  });
});

describe("an upright welcome's words fit a 320-wide phone", () => {
  it.each([["en"], ["ru"]] as const)("keeps every word of a %s welcome on its line", (language) => {
    const size: WindowSize = [320, 568];
    openWindow(...size);
    document.documentElement.dataset.size = "tall-narrow";
    onTestFinished(() => void delete document.documentElement.dataset.size);
    const width = pairsWelcomeWidth(320, 0, 0, 0, NARROW_WELCOME);
    expect(width).toBe(280);
    const type = pairsWelcomeType(width, NARROW_WELCOME);
    const text = TEXTS[language];
    render(
      <PairsWelcomeScreen
        language={language} level="hatchling" climbLevel={TOP_CLIMB_LEVEL} stars={999}
        heroPicture={fakeBodyPicture("triceratops")} onLevel={() => {}} onPlay={() => {}} onHome={() => {}} type={type}
      />,
      withPictures
    );
    const at = (selector: string) => styleAt(element(selector), size);

    // The title on one line beside its mark.
    const title = styleAt(screen.getByRole("heading"), size);
    const ems = TITLE_EMS[text.pairs];
    if (ems === undefined) throw new Error(`No width for ${text.pairs}`);
    expect([title.value("white-space"), title.px("font-size")]).toEqual(["nowrap", type.title]);
    expect(at(".pairs-mark").px("width") + title.columnGap() + ems * title.px("font-size")).toBeLessThanOrEqual(width + 1e-9);

    // Each level its picture alone, the name out of the row.
    for (const name of document.querySelectorAll(".level-switch-name")) expect(styleAt(name, size).value("position")).toBe("absolute");

    // The climb level and the stars side by side, each on one line.
    const chips = at(".pairs-chips");
    const chipsWidth = [screen.getByLabelText(text.level), screen.getByLabelText(text.starsEarned)].reduce((sum, chip) => {
      const own = styleAt(chip, size);
      return sum + own.px("padding-left") + own.px("padding-right") + symbolWidth(chip) + own.columnGap() + GLYPH_EMS * (chip.textContent ?? "").length * own.px("font-size");
    }, chips.columnGap());
    expect(chipsWidth).toBeLessThanOrEqual(width);

    // PLAY on one line, every tap at least 44.
    const play = screen.getByRole("button", { name: text.play });
    const playStyle = styleAt(play, size);
    expect(playStyle.px("padding-left") + playStyle.px("padding-right") + symbolWidth(play) + playStyle.columnGap() + GLYPH_EMS * text.play.length * playStyle.px("font-size")).toBeLessThanOrEqual(width);
    for (const button of screen.getAllByRole("button")) expect(styleAt(button, size).px("height")).toBeGreaterThanOrEqual(44);
  });
});
