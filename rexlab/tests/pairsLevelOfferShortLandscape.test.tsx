import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { LANGUAGES, type Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { PairsResultScreen, type PairsResultScreenProps } from "../src/PairsResultScreen.tsx";
import { manualTimers } from "./support.ts";
import { appStylesheet, NO_SAFE_AREA } from "./stylesheet.ts";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// Windows on their side, full screen: the shortest a phone gives the
// layout, and iPhones from the smallest to the largest.
const PHONES: readonly WindowSize[] = [[568, 320], [667, 375], [852, 393], [932, 430]];

// Advances at weight 700, the wider of Lexend and the system face,
// rounded up; Russian with 10% room.
const WORD_EMS: Record<string, number> = {
  TRY: 2, THE: 2.09, "EXPLORER": 5.47, "PALEONTOLOGIST": 9.62, "LEVEL?": 3.76,
  "ПОПРОБУЕМ": 7.21, "УРОВЕНЬ": 5.38, "ИССЛЕДОВАТЕЛЬ?": 10.69, "ПАЛЕОНТОЛОГ?": 9.17
};
const SPACE_EMS = 0.33;
const ANSWER_EMS: Record<string, number> = { YES: 1.97, "NOT NOW": 5.18, "ДА": 1.61, "НЕ СЕЙЧАС": 6.53 };

// jsdom has no animation engine: every reward ends at once, so the offer
// shows when the screen's timer fires.
beforeEach(() => {
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [{ currentTime: 0, effect: { getComputedTiming: () => ({ endTime: 0 }) } }] });
});
afterEach(() => { Reflect.deleteProperty(Element.prototype, "getAnimations"); });

// The result in a wide-short window of `size`, its offer of `level` shown.
function openOffer(size: WindowSize, language: Language, level: "explorer" | "paleontologist") {
  openWindow(...size);
  const sheet = Object.assign(document.createElement("style"), { textContent: appStylesheet(NO_SAFE_AREA) });
  document.head.append(sheet);
  document.documentElement.dataset.size = "wide-short";
  onTestFinished(() => { sheet.remove(); delete document.documentElement.dataset.size; });
  const clock = manualTimers();
  const offer = { level, onShown: vi.fn(), onYes: vi.fn(), onNotNow: vi.fn(), startTimer: clock.startTimer };
  const props: PairsResultScreenProps = { language, pals: [], tries: 12, stars: 3, best: 12, beaten: 16, celebration: "new-best", levelUp: null, offer, onBack: vi.fn(), onHome: vi.fn(), onPlayAgain: vi.fn() };
  render(<PairsResultScreen {...props} />);
  act(() => clock.fire(0));
}

// The lines `words` take in type `font` within `width`, broken at spaces.
function linesOf(words: readonly string[], font: number, width: number) {
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const next = WORD_EMS[word]! * font;
    expect(next, word).toBeLessThanOrEqual(width);
    if (used && used + SPACE_EMS * font + next > width) { lines++; used = next; }
    else used += (used ? SPACE_EMS * font : 0) + next;
  }
  return lines;
}

const CASES = PHONES.flatMap((size) => LANGUAGES.flatMap((language) => (["explorer", "paleontologist"] as const).map((level) => [size[0], size[1], language, level] as const)));

describe("find the pair's level offer in a wide-short window", () => {
  it.each(CASES)("fits the window at %i by %i, in %s, offering %s", (width, height, language, level) => {
    const size: WindowSize = [width, height];
    openOffer(size, language, level);
    const text = TEXTS[language];
    const dialog = screen.getByRole("dialog", { name: text.levelOffer.question(text.ageLevels[level].name) });
    const at = (element: Element) => styleAt(element, size);
    const scrim = at(dialog.parentElement!);
    const card = at(dialog);
    expect([scrim.px("padding-top"), scrim.px("padding-left"), card.value("width"), card.px("padding-top"), card.px("padding-left"), card.px("padding-right"), card.px("padding-bottom"), card.rowGap()]).toEqual([12, 12, "min(520px, 100%)", 20, 16, 16, 16, 12]);
    const cardWidth = Math.min(520, width - 24);
    const inner = cardWidth - 32;
    const question = at(within(dialog).getByRole("heading"));
    const font = question.px("font-size");
    expect(font).toBe(22);
    const lines = linesOf(text.levelOffer.question(text.ageLevels[level].name).split(" "), font, inner);
    expect(lines).toBeLessThanOrEqual(2);
    const answers = at(dialog.querySelector(".pairs-offer-answers")!);
    expect(answers.value("flex-direction") || "row").toBe("row");
    const buttonWidth = (inner - answers.columnGap()) / 2;
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([text.levelOffer.yes, text.levelOffer.notNow]);
    for (const button of buttons) {
      const style = at(button);
      const symbol = at(button.querySelector("svg")!).px("width");
      expect(style.px("height")).toBeGreaterThanOrEqual(48);
      expect(style.px("padding-left") + symbol + style.columnGap() + ANSWER_EMS[button.textContent!]! * style.px("font-size") + style.px("padding-right")).toBeLessThanOrEqual(buttonWidth);
    }
    const picture = at(dialog.querySelector(".pairs-offer-picture")!).px("height");
    const cardHeight = card.px("padding-top") + picture + 2 * card.rowGap() + lines * font * Number(question.value("line-height")) + at(buttons[0]!).px("height") + card.px("padding-bottom");
    expect(cardHeight + 24).toBeLessThanOrEqual(height);
  });
});
