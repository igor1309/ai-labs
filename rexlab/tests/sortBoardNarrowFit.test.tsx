import { render } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NARROW_SORT, sortBoardWidth } from "../src/sortBoardLayout.ts";
import { SortScreen, type Basket, type BasketView } from "../src/SortScreen.tsx";
import { MARK_EMS } from "./basketWidths.ts";
import { withPictures } from "./pictures.tsx";
import { openWindow, styleAt, type WindowSize } from "./windowSizes.ts";

// sort-dinosaurs-board-narrow-portrait.feature's "Every mark and the
// prompt fit the narrowest phone". jsdom lays nothing out, so the marks
// and the prompt are budgeted from the stylesheet in ems of their bold
// face.

// The prompt in either language in ems, rounded up: SORT THEM ALL is the
// wider.
const PROMPT_EMS = 8.8;

// Every set of baskets a board deals.
const BASKETS: readonly (readonly Basket[])[] = [
  ["two-legs", "four-legs"],
  ["plants", "meat"],
  ["big", "small"],
  ["horns", "no-horns"],
  ["feathers", "no-feathers"],
  ["plants", "meat", "both"],
  ["two-legs", "four-legs", "two-or-four"],
  ["feathers", "no-feathers", "not-known-yet"]
];

const SIZE: WindowSize = [320, 568];

const element = (selector: string, within: ParentNode = document) => {
  const found = within.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`No ${selector}`);
  return found;
};

describe.each(LANGUAGES)("sort's board on a 320 phone in %s", (language) => {
  it.each(BASKETS.map((baskets) => [baskets.join(", "), baskets] as const))("fits the marks of %s and the prompt", (_, baskets) => {
    openWindow(...SIZE);
    document.documentElement.dataset.size = "tall-narrow";
    onTestFinished(() => void delete document.documentElement.dataset.size);
    const width = sortBoardWidth(320, 0, 0, 0, NARROW_SORT);
    render(
      <SortScreen
        language={language}
        tray={Array.from({ length: 10 }, () => null)}
        baskets={baskets.map((basket) => ({ basket, cards: [] })) as unknown as readonly [BasketView, BasketView]}
        sorted={0} total={10} glow={undefined}
        onDrop={() => {}} onHome={() => {}} onSeeResult={() => {}}
        width={width} sizes={NARROW_SORT}
      />,
      withPictures
    );
    const at = (target: Element) => styleAt(target, SIZE);
    const gap = at(element(".baskets")).columnGap();
    const inside = (width - (baskets.length - 1) * gap) / baskets.length - 2 * NARROW_SORT.basketPadding;
    for (const basket of document.querySelectorAll<HTMLElement>(".basket")) {
      const mark = element(".basket-mark", basket);
      const style = at(mark);
      const parts = [...mark.children].map((part) =>
        part instanceof SVGElement ? at(part).px("width") || Number(part.getAttribute("width")) : (MARK_EMS[part.textContent ?? ""] ?? Number.NaN) * at(part).px("font-size")
      );
      const across = Math.max(style.px("min-width"), parts.reduce((sum, each) => sum + each, 0) + style.columnGap() * (parts.length - 1) + style.px("padding-left") + style.px("padding-right"));
      expect(across, basket.getAttribute("aria-label") ?? "").toBeLessThanOrEqual(inside);
      expect(style.px("height")).toBeGreaterThanOrEqual(44);
    }
    // The big footprint stays bigger than the small one.
    if (baskets.includes("big")) expect(at(element('[data-basket="big"] svg')).px("width")).toBeGreaterThan(at(element('[data-basket="small"] svg')).px("width"));

    // The prompt on one line beside its symbol.
    const prompt = at(element(".prompt"));
    expect(TEXTS[language].sortPrompt === TEXTS.en.sortPrompt || TEXTS[language].sortPrompt.length <= TEXTS.en.sortPrompt.length).toBe(true);
    expect(PROMPT_EMS * prompt.px("font-size") + at(element(".prompt-symbol")).px("width") + prompt.columnGap()).toBeLessThanOrEqual(width);
  });
});
