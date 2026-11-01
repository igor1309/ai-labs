import { describe, expect, it } from "vitest";
import { compareQuestionGeometry, compareQuestionType, compareQuestionWidth, PORTRAIT_QUESTION } from "../src/compareQuestionLayout.ts";

describe("an upright question's width and type", () => {
  it.each([
    [600, 0, 0, 0, 488],
    [600, 0, 0, 16, 472],
    [744, 19, 13, 0, 600],
    [1024, 0, 0, 0, 912]
  ])("takes side insets, padding and scrollbar from a %i pixel window (%i left, %i right, %i scrollbar)", (windowWidth, left, right, scrollbar, expected) => {
    expect(compareQuestionWidth(windowWidth, left, right, scrollbar)).toBe(expected);
  });

  it.each([
    [472, 400 / 9.97, 416 / 12.7],
    [488, 416 / 9.97, 34],
    [600, 44, 34],
    [912, 44, 34]
  ])("at %i pixels sizes the prompt to fit beside its symbol and the names their footer, each at most its landscape size", (width, prompt, name) => {
    const type = compareQuestionType(width);
    expect(type.prompt).toBeCloseTo(prompt, 6);
    expect(type.name).toBeCloseTo(name, 6);
  });
});

describe("an upright question's geometry", () => {
  it.each([
    [600, 800, 281, 200, 150, true],
    [744, 1133, 370, 320, 240, false],
    [768, 1024, 316, 247, 186, false],
    [820, 1180, 394, 351, 264, false],
    [1024, 1366, 487, 475, 356, false]
  ] as const)("at %i by %i keeps the example's %i-pixel cards, %i by %i pictures and scrolling", (width, height, card, pictureWidth, pictureHeight, scrolls) => {
    const question = compareQuestionGeometry(width, height, 0, 0);
    expect(Math.abs(question.cardHeight - card)).toBeLessThanOrEqual(1);
    expect(Math.abs(question.picture.width - pictureWidth)).toBeLessThanOrEqual(4);
    expect(Math.abs(question.picture.height - pictureHeight)).toBeLessThanOrEqual(4);
    expect(question.scrolls).toBe(scrolls);
  });

  it.each([
    [600, 800, 0, 0, 16, 472, 150 + 48 + 40 + (416 / 12.7) * 1.25, true],
    [744, 1133, 19, 13, 0, 600, 370.5, false],
    [820, 1180, 0, 0, 16, 692, 394, false]
  ] as const)("at %i by %i counts insets %i / %i and scrollbar %i in every size", (width, height, left, right, scrollbar, questionWidth, card, scrolls) => {
    const question = compareQuestionGeometry(width, height, left, right, scrollbar);
    expect(question.width).toBe(questionWidth);
    expect(question.type).toEqual(compareQuestionType(questionWidth));
    expect(question.footerHeight).toBeCloseTo(40 + question.type.name * 1.25, 6);
    expect(question.cardHeight).toBeCloseTo(card, 6);
    expect(question.picture.height).toBeCloseTo(Math.min(420, card - question.footerHeight - 48, (questionWidth - 48) * 0.75), 6);
    expect(question.picture.width).toBeCloseTo(question.picture.height * 4 / 3, 6);
    expect(question.scrolls).toBe(scrolls);
  });

  it("shares the height between the cards equally, the bar, the prompt, the row for NEXT and the gaps taking the rest", () => {
    const { topPadding, bottomPadding, barHeight, promptSymbol, rowHeight, gap, cardsGap } = PORTRAIT_QUESTION;
    const question = compareQuestionGeometry(820, 1180, 0, 0);
    expect(topPadding + barHeight + gap + promptSymbol + gap + 2 * question.cardHeight + cardsGap + gap + rowHeight + bottomPadding).toBe(1180);
  });

  it("scrolls only below the height that leaves each card its 150-pixel picture, the cards keeping that least height", () => {
    // At 1024 wide a card's least height is 150 + 48 + 82.5, and the rest
    // of the screen 392 pixels.
    const least = 150 + 48 + 82.5;
    const [below, exact, above] = [-0.5, 0, 0.5].map((more) => compareQuestionGeometry(1024, 392 + 2 * least + more, 0, 0));
    expect([below!.scrolls, exact!.scrolls, above!.scrolls]).toEqual([true, false, false]);
    expect([below!.cardHeight, exact!.cardHeight, above!.cardHeight]).toEqual([least, least, least + 0.25]);
    expect([below!.picture.height, exact!.picture.height]).toEqual([150, 150]);
  });

  it.each([
    [1024, 2000, 560, 420],
    [600, 2000, 440, 330]
  ])("at %i by %i keeps the picture at 4:3 within its 560 by 420 and its area's width", (width, height, pictureWidth, pictureHeight) => {
    const { picture } = compareQuestionGeometry(width, height, 0, 0);
    expect(picture.width).toBeCloseTo(pictureWidth, 6);
    expect(picture.height).toBeCloseTo(pictureHeight, 6);
  });
});
