import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { ResultScreen } from "../src/ResultScreen.tsx";
import { SortResultScreen, type SortResultScreenProps } from "../src/SortResultScreen.tsx";
import { LEVEL_EMS } from "./levelEms.ts";
import { withPictures } from "./pictures.tsx";
import { contrast, fakeBodyPicture, sameColour, seenOn, surfaceOf } from "./support.ts";

const result = {
  language: "en", score: 5, total: 8, best: 7, beaten: undefined,
  celebration: null, hero: fakeBodyPicture("tyrannosaurus")
} as const;

function openResult(props: Partial<SortResultScreenProps> = {}) {
  const callbacks = { onChoose: vi.fn(), onPlayAgain: vi.fn(), onHome: vi.fn() };
  const given: SortResultScreenProps = { ...result, level: "explorer", ...callbacks, ...props };
  const view = render(<SortResultScreen {...given} />, withPictures);
  return { ...view, ...callbacks, given };
}

const levelSwitch = (language: Language = "en") => screen.getByRole("group", { name: TEXTS[language].ageLevelSwitch });
const element = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};
const style = (selector: string) => getComputedStyle(element(selector));

describe("the sorting result's level switch", () => {
  it.each(AGE_LEVELS)("shows %s chosen, youngest first with their pictures, above PLAY AGAIN", (level) => {
    openResult({ level });

    const levels = within(levelSwitch()).getAllByRole("button");
    expect(levels.map((button) => button.textContent)).toEqual(["🥚HATCHLING", "🦖EXPLORER", "🦴PALEONTOLOGIST"]);
    expect(levels).toEqual(AGE_LEVELS.map((each) => within(levelSwitch()).getByRole("button", { name: TEXTS.en.ageLevels[each].name, pressed: each === level })));
    expect(levelSwitch().compareDocumentPosition(screen.getByRole("button", { name: "PLAY AGAIN" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(levelSwitch().style.getPropertyValue("--chosen")).toBe(String(AGE_LEVELS.indexOf(level)));
    const selected = getComputedStyle(within(levelSwitch()).getByRole("button", { pressed: true }));
    expect(selected.fontWeight).toBe("700");
    expect(selected.boxShadow).not.toBe("none");
    for (const other of within(levelSwitch()).getAllByRole("button", { pressed: false })) {
      expect([getComputedStyle(other).fontWeight, getComputedStyle(other).boxShadow]).toEqual(["600", "none"]);
    }
  });

  it.each(AGE_LEVELS)("reports a choice of %s without navigating or changing the finished round; the caller moves the mark", async (level) => {
    const user = userEvent.setup();
    const view = openResult();
    const main = screen.getByRole("main");

    await user.click(within(levelSwitch()).getByRole("button", { name: TEXTS.en.ageLevels[level].name }));

    expect(view.onChoose.mock.calls).toEqual([[level]]);
    expect([view.onPlayAgain.mock.calls, view.onHome.mock.calls]).toEqual([[], []]);
    expect(within(levelSwitch()).getByRole("button", { pressed: true }).textContent).toBe("🦖EXPLORER");
    view.rerender(<SortResultScreen {...view.given} level={level} />);
    expect(screen.getByRole("main")).toBe(main);
    expect([screen.getByLabelText("SCORE").textContent, screen.getByLabelText("BEST SCORE").textContent]).toEqual(["5/8", "BEST7"]);
    expect(within(levelSwitch()).getByRole("button", { pressed: true }).textContent).toBe(`${{ hatchling: "🥚", explorer: "🦖", paleontologist: "🦴" }[level]}${TEXTS.en.ageLevels[level].name}`);
    expect(levelSwitch().style.getPropertyValue("--chosen")).toBe(String(AGE_LEVELS.indexOf(level)));
    expect(style(".pairs-level-mark").transition).toBe("translate var(--motion-standard) var(--ease-out)");

    await user.click(screen.getByRole("button", { name: "PLAY AGAIN" }));
    await user.click(screen.getByRole("button", { name: "HOME" }));
    expect([view.onPlayAgain.mock.calls.length, view.onHome.mock.calls.length, view.onChoose.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it.each([6, 8, 10].flatMap((total) => [0, total - 2, total].map((score) => [score, total])))("shows %i won stars out of %i, with their reward stagger", (score, total) => {
    openResult({ score, total });

    const stars = screen.getByRole("img", { name: TEXTS.en.stars(score, total) });
    expect(stars.children).toHaveLength(total);
    expect([...stars.children].map((star) => star.classList.contains("star-won"))).toEqual(Array.from({ length: total }, (_, index) => index < score));
    expect([...stars.querySelectorAll<HTMLElement>(".star-won")].map((star) => star.style.getPropertyValue("--star"))).toEqual(Array.from({ length: score }, (_, index) => String(index)));
    expect(screen.getByLabelText("SCORE").textContent).toBe(`${score}/${total}`);
  });

  it("keeps the ordinary result's layout and actions without a level switch", () => {
    render(<ResultScreen {...result} onPlayAgain={() => {}} onHome={() => {}} />, withPictures);

    expect(screen.queryByRole("group", { name: TEXTS.en.ageLevelSwitch })).toBeNull();
    expect(screen.getByRole("main").className).toBe("result");
    expect([style(".result-content").gap, style(".play-again-button").height]).toEqual(["24px", "80px"]);
  });
});

// jsdom lays nothing out. Budget the delivered grid and all its rows
// using conservative font widths, including the shared level measures.
const WORD_EMS: Record<string, number> = {
  "PLAY AGAIN": 7.2, HOME: 3.2, "WELL DONE!": 7.5, "FIRST BEST!": 7.6, "NEW BEST!": 7.2,
  "ЕЩЁ РАЗ": 5.8, ДОМОЙ: 4.1, "МОЛОДЕЦ!": 6.8, "ПЕРВЫЙ РЕКОРД!": 10.8, "НОВЫЙ РЕКОРД!": 10.5,
  BEST: 3.2, РЕКОРД: 5.2
};
function pixels(value: string): number {
  if (value === "0") return 0;
  const plain = /^([\d.]+)(px|vh)$/.exec(value);
  if (plain) return Number(plain[1]) * (plain[2] === "vh" ? 768 / 100 : 1);
  const minimum = /^min\(([^()]+)\)$/.exec(value);
  if (minimum) return Math.min(...(minimum[1] ?? "").split(",").map((part) => pixels(part.trim())));
  throw new Error(`Cannot budget ${value}`);
}
const horizontal = (s: CSSStyleDeclaration) => pixels(s.paddingLeft) + pixels(s.paddingRight);
const vertical = (s: CSSStyleDeclaration) => pixels(s.paddingTop) + pixels(s.paddingBottom);
const gap = (s: CSSStyleDeclaration) => pixels(s.gap);
const wordWidth = (word: string, size: number) => (WORD_EMS[word] ?? NaN) * size;

describe.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))("the sorting result in %s, %s at 1024 by 768", (language, theme) => {
  it.each(["first-best", "new-best"] as const)("fits a Paleontologist's ten stars, %s celebration, switch and actions with readable names", (celebration) => {
    document.documentElement.dataset.theme = theme;
    try {
      openResult({ language, level: "paleontologist", score: 10, total: 10, best: 10, beaten: celebration === "new-best" ? 9 : undefined, celebration });
      const text = TEXTS[language];
      const outer = style(".result");
      expect([outer.height, outer.boxSizing, outer.display, outer.overflow]).toEqual(["100dvh", "border-box", "grid", "hidden"]);
      const columns = /^minmax\(0, 1fr\) minmax\(0, (\d+)px\)$/.exec(outer.gridTemplateColumns);
      if (!columns) throw new Error(`Unknown grid: ${outer.gridTemplateColumns}`);
      const width = Number(columns[1]);
      expect(width + gap(outer)).toBeLessThan(1024 - horizontal(outer));

      const panel = style(".result-content");
      expect([panel.display, panel.flexDirection, panel.alignItems]).toEqual(["flex", "column", "center"]);
      const switchStyle = getComputedStyle(levelSwitch(language));
      expect([switchStyle.display, switchStyle.gridTemplateColumns, switchStyle.alignSelf]).toEqual(["grid", "repeat(3, 1fr)", "stretch"]);
      const segment = (width - horizontal(switchStyle) - pixels(switchStyle.borderLeftWidth) - pixels(switchStyle.borderRightWidth) - 2 * gap(switchStyle)) / 3;
      expect(segment).toBeGreaterThanOrEqual(48);
      const levels = within(levelSwitch(language)).getAllByRole("button");
      for (const button of levels) {
        const s = getComputedStyle(button);
        const name = button.querySelector(".pairs-level-name");
        const picture = button.querySelector(".pairs-level-picture");
        if (!name || !picture) throw new Error("A level without its name or picture");
        const words = name.textContent ?? "";
        const needed = (LEVEL_EMS[words] ?? NaN) * pixels(s.fontSize) + pixels(s.letterSpacing) * words.length;
        expect(s.whiteSpace).toBe("nowrap");
        expect(needed + horizontal(s) + pixels(getComputedStyle(picture).width) + gap(s)).toBeLessThanOrEqual(segment);
        expect(pixels(s.height)).toBeGreaterThanOrEqual(48);
        const surface = surfaceOf(name);
        expect(contrast(seenOn(s.color, surface), surface)).toBeGreaterThanOrEqual(4.5);
        expect(sameColour(s.color, "#f6f2e9")).toBe(button.getAttribute("aria-pressed") !== "true");
      }

      const stars = screen.getByRole("img", { name: text.stars(10, 10) });
      expect(stars.children).toHaveLength(10);
      expect(10 * pixels(getComputedStyle(stars).fontSize) + 9 * gap(getComputedStyle(stars))).toBeLessThanOrEqual(width);
      expect(style(".result-stars").lineHeight).toBe("1");
      const score = style(".result-score");
      expect(score.lineHeight).toBe("1");
      expect(2 * 0.75 * pixels(style(".result-score-value").fontSize) + 3 * 0.75 * pixels(style(".result-score-total").fontSize) + gap(score)).toBeLessThanOrEqual(width);
      const title = style(".result-title");
      expect(wordWidth(text.wellDone, pixels(title.fontSize))).toBeLessThanOrEqual(width);
      const chip = style(".celebration");
      expect(wordWidth(text.celebrations[celebration].text, pixels(chip.fontSize)) + horizontal(chip) + 30 + gap(chip)).toBeLessThanOrEqual(width);
      expect(screen.getByRole("status", { name: text.celebrations[celebration].label })).toBeDefined();
      expect(document.querySelectorAll(".confetti").length).toBeGreaterThan(0);

      const actions = style(".result-actions");
      const buttons = [text.playAgain, text.home].map((name) => screen.getByRole("button", { name }));
      const actionWidth = buttons.reduce((sum, button) => {
        const s = getComputedStyle(button);
        expect(s.whiteSpace).toBe("nowrap");
        expect(pixels(s.height)).toBeGreaterThanOrEqual(48);
        return sum + horizontal(s) + 28 + gap(s) + wordWidth(button.textContent ?? "", pixels(s.fontSize));
      }, gap(actions));
      expect(actionWidth).toBeLessThanOrEqual(width);
      const best = style(".best-score");
      expect(horizontal(best) + wordWidth(text.best, pixels(best.fontSize)) + 0.75 * pixels(best.fontSize) + 20 + 2 * 0.75 * pixels(style(".best-score-value").fontSize) + 3 * gap(best)).toBeLessThanOrEqual(width);
      const switchHeight = vertical(switchStyle) + pixels(switchStyle.borderTopWidth) + pixels(switchStyle.borderBottomWidth) + pixels(getComputedStyle(levels[0] ?? document.body).height);
      const panelHeight = pixels(chip.height) + pixels(style(".result-score-value").fontSize) + pixels(style(".result-stars").fontSize) + pixels(title.fontSize) * Number(title.lineHeight) + pixels(best.height) + switchHeight + vertical(actions) + Math.max(...buttons.map((button) => pixels(getComputedStyle(button).height))) + (element(".result-content").children.length - 1) * gap(panel);
      expect(panelHeight).toBeLessThanOrEqual(768 - vertical(outer));
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
