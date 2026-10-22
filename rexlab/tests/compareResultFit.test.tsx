import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { compareResultType, compareResultWidth, PORTRAIT_RESULT } from "../src/compareResultLayout.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { LevelOfferDialog } from "../src/LevelOfferDialog.tsx";
import { LevelResultScreen } from "../src/LevelResultScreen.tsx";
import { LEVEL_EMS } from "./levelEms.ts";
import { withPictures } from "./pictures.tsx";
import { fakeBodyPicture, manualTimers } from "./support.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// compare-dinosaurs-result-portrait.feature's words at the narrowest
// tall window. jsdom lays nothing out: the delivered CSS is budgeted with
// conservative widths in ems, Lexend's bold Latin face and the iPad's
// Cyrillic face, as the landscape result's fit test measures them, and
// the levels' shared measures.
const WORD_EMS: Record<string, number> = {
  "PLAY AGAIN": 7.2, HOME: 3.2, "WELL DONE!": 7.5, "FIRST BEST!": 7.6, "NEW BEST!": 7.2,
  "ЕЩЁ РАЗ": 5.8, ДОМОЙ: 4.1, "МОЛОДЕЦ!": 6.8, "ПЕРВЫЙ РЕКОРД!": 10.8, "НОВЫЙ РЕКОРД!": 10.5,
  BEST: 3.2, РЕКОРД: 5.2
};
const wordWidth = (word: string, size: number) => {
  const ems = WORD_EMS[word];
  if (ems === undefined) throw new Error(`No width for ${word}`);
  return ems * size;
};

const px = (value: string) => {
  if (value === "0" || value === "normal") return 0;
  const plain = /^(-?[\d.]+)px$/.exec(value);
  if (!plain) throw new Error(`Cannot budget ${value}`);
  return Number(plain[1]);
};

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

describe("an upright result's words fit the narrowest width", () => {
  it.each([
    ["en", 0], ["ru", 0], ["en", 16], ["ru", 16]
  ] as const)("keeps every word of a %s result on its line in a 600 by 1000 window with a %i-pixel scrollbar", (language, scrollbar) => {
    const size: WindowSize = [600, 1000];
    tallWindow(size);
    const width = compareResultWidth(600, 0, 0, scrollbar);
    const type = compareResultType(width);
    const text = TEXTS[language];
    render(
      <LevelResultScreen
        language={language} score={10} total={10} best={10} beaten={9} celebration="new-best"
        hero={fakeBodyPicture("tyrannosaurus")} level="paleontologist" onLevel={() => {}}
        onPlayAgain={() => {}} onHome={() => {}} type={type}
      />,
      withPictures
    );
    const at = (selector: string) => styleAt(element(selector), size);
    const outer = at(".result");
    expect([outer.px("padding-left"), outer.px("padding-right"), outer.value("flex-direction"), outer.value("align-items")]).toEqual([32, 32, "column", "center"]);
    expect(at(".result-content").value("align-self")).toBe("stretch");

    // Ten stars on one line, each at least 44.
    const stars = screen.getByRole("img", { name: text.stars(10, 10) });
    const star = styleAt(stars, size);
    expect(stars.children).toHaveLength(10);
    expect([star.px("font-size"), star.value("line-height"), star.value("display")]).toEqual([type.star, "1", "flex"]);
    expect(type.star).toBeGreaterThanOrEqual(44);
    expect(10 * star.px("font-size") + 9 * star.columnGap()).toBeLessThanOrEqual(width + 1e-9);

    // Every level's name on one line under its picture, at least 14.
    const switcher = screen.getByRole("group", { name: text.ageLevelSwitch });
    const switchStyle = styleAt(switcher, size);
    expect([switchStyle.value("width"), switchStyle.px("max-width"), switchStyle.value("border-top-style"), switchStyle.value("grid-template-columns")]).toEqual(["100%", 648, "none", "repeat(3, 1fr)"]);
    const switchWidth = Math.min(648, width);
    const third = (switchWidth - switchStyle.px("padding-left") - switchStyle.px("padding-right") - 2 * switchStyle.columnGap()) / 3;
    for (const button of within(switcher).getAllByRole("button")) {
      const level = styleAt(button, size);
      const name = element(".level-switch-name", button).textContent ?? "";
      expect(element(".level-switch-picture", button).nextElementSibling).toBe(element(".level-switch-name", button));
      expect([level.value("flex-direction"), level.value("white-space"), level.px("font-size")]).toEqual(["column", "nowrap", type.levelName]);
      expect(type.levelName).toBeGreaterThanOrEqual(14);
      const ems = LEVEL_EMS[name];
      if (ems === undefined) throw new Error(`No width for ${name}`);
      expect(ems * level.px("font-size") + level.px("letter-spacing") * name.length + level.px("padding-left") + level.px("padding-right"), name).toBeLessThanOrEqual(third + 1e-9);
    }

    // PLAY AGAIN and HOME side by side, each on one line.
    const actions = at(".result-actions");
    expect(actions.value("display")).toBe("flex");
    expect(actions.value("flex-direction") || "row").toBe("row");
    const buttons = [text.playAgain, text.home].map((name) => screen.getByRole("button", { name }));
    const actionWidth = buttons.reduce((sum, button) => {
      const own = styleAt(button, size);
      expect(own.value("white-space")).toBe("nowrap");
      return sum + own.px("padding-left") + own.px("padding-right") + 28 + own.columnGap() + wordWidth(button.textContent ?? "", own.px("font-size"));
    }, actions.columnGap());
    expect(actionWidth).toBeLessThanOrEqual(width);

    // The celebration and the best score each on one line.
    const chip = at(".celebration");
    expect(wordWidth(text.celebrations["new-best"].text, chip.px("font-size")) + chip.px("padding-left") + chip.px("padding-right") + 30 + chip.columnGap()).toBeLessThanOrEqual(width);
    const best = at(".best-score");
    const value = at(".best-score-value");
    expect(best.px("padding-left") + best.px("padding-right") + wordWidth(text.best, best.px("font-size")) + 0.75 * best.px("font-size") + 20 + 2 * 0.75 * value.px("font-size") + 3 * best.columnGap()).toBeLessThanOrEqual(width);
    expect([screen.getByLabelText(text.bestScore).textContent, screen.getByLabelText(text.score).textContent]).toEqual([`${text.best}910`, "10/10"]);
  });

  it("sizes the names by the widest of either language", () => {
    const names = LANGUAGES.flatMap((language) => Object.values(TEXTS[language].ageLevels).map(({ name }) => name));
    const needed = (name: string) => (LEVEL_EMS[name] ?? Infinity) * 16 + PORTRAIT_RESULT.levelLetterSpacing * name.length;
    const widest = names.reduce((wide, name) => (needed(name) > needed(wide) ? name : wide));
    expect([LEVEL_EMS[widest], widest.length]).toEqual([PORTRAIT_RESULT.widestLevelEms, PORTRAIT_RESULT.widestLevelLetters]);
  });
});

// The offer's question and answers with conservative widths, 0.8 em a
// glyph and 0.4 a space, as the landscape offer's fit test budgets them,
// and each level's name its measured width.
const glyphs = (word: string, size: number) => {
  const name = LEVEL_EMS[word.replace(/\?$/, "")];
  return name === undefined ? [...word].length * 0.8 * size : (name + (word.endsWith("?") ? 0.8 : 0)) * size;
};

describe("the offer of a level in a tall window", () => {
  it.each([
    ["en", "paleontologist"], ["ru", "explorer"]
  ] as const)("fits a 600 by 800 window in %s, offering %s", (language: Language, level) => {
    const size: WindowSize = [600, 800];
    tallWindow(size);
    const text = TEXTS[language];
    render(
      <LevelOfferDialog
        language={language}
        offer={{ level, onYes: () => {}, onNotNow: () => {}, onShown: () => {}, startTimer: manualTimers().startTimer }}
        leaving={false} onShown={() => {}} onAnswer={() => {}} onGone={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog", { name: text.levelOffer.question(text.ageLevels[level].name) });
    expect(text.ageLevels[level].name).toBe(language === "en" ? "PALEONTOLOGIST" : "ИССЛЕДОВАТЕЛЬ");

    // The window less 24 a side, at most 710 wide.
    const scrim = styleAt(element(".pairs-offer-scrim"), size);
    expect([scrim.value("position"), scrim.value("inset"), scrim.value("display"), scrim.value("grid-template-columns"), scrim.value("justify-content")]).toEqual(["fixed", "0px", "grid", "minmax(0, 710px)", "center"]);
    expect([scrim.px("padding-top"), scrim.px("padding-right"), scrim.px("padding-bottom"), scrim.px("padding-left")]).toEqual([24, 24, 24, 24]);
    const card = styleAt(dialog, size);
    expect([card.value("width"), card.value("box-sizing")]).toEqual(["100%", "border-box"]);
    const width = Math.min(710, size[0] - scrim.px("padding-left") - scrim.px("padding-right"));
    expect(width).toBe(552);
    const inner = width - card.px("padding-left") - card.px("padding-right");

    // The question in 32-pixel type, on at most three lines.
    const question = styleAt(within(dialog).getByRole("heading"), size);
    expect(question.px("font-size")).toBe(32);
    let lines = 1;
    let used = 0;
    for (const word of (within(dialog).getByRole("heading").textContent ?? "").split(" ")) {
      const next = glyphs(word, 32);
      expect(next, word).toBeLessThanOrEqual(inner);
      if (used && used + 0.4 * 32 + next > inner) {
        lines++;
        used = next;
      } else used += (used ? 0.4 * 32 : 0) + next;
    }
    expect(lines).toBeLessThanOrEqual(3);

    // YES and NOT NOW one above the other, each across the offer.
    const answers = styleAt(element(".pairs-offer-answers", dialog), size);
    expect([answers.value("display"), answers.value("flex-direction"), answers.value("align-items") || "normal"]).toEqual(["flex", "column", "normal"]);
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([text.levelOffer.yes, text.levelOffer.notNow]);
    for (const button of buttons) {
      const own = styleAt(button, size);
      expect([own.value("flex-grow"), own.value("flex-shrink"), own.value("width") || "auto", own.value("white-space")]).toEqual(["0", "0", "auto", "nowrap"]);
      expect(glyphs(button.textContent ?? "", own.px("font-size")) + 30 + own.columnGap() + own.px("padding-left") + own.px("padding-right")).toBeLessThanOrEqual(inner);
    }
    const picture = styleAt(element(".pairs-offer-picture", dialog), size);
    const height = card.px("padding-top") + picture.px("height") + 2 * card.rowGap() + lines * 32 * Number(question.value("line-height"))
      + 2 * styleAt(buttons[0]!, size).px("height") + answers.rowGap() + card.px("padding-bottom");
    expect(height).toBeLessThanOrEqual(size[1] - 48);
  });
});
