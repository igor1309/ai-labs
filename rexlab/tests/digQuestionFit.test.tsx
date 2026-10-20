import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { BRUSH_SIZES, brushRound, CHOICES, FRAME, startRound } from "../src/dig/index.ts";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { presentDigBoard } from "../src/presentation.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_DIG, fakeBodyPicture } from "./support.ts";

const px = (value: string) => Number.parseFloat(value);
const style = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return getComputedStyle(element);
};
const pads = (s: CSSStyleDeclaration) => px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth);
const sizes = [[1024, 768], [1133, 744], [1366, 1024]] as const;
const levels = ["explorer", "paleontologist"] as const;

function show(level: (typeof levels)[number], asking: boolean, language: (typeof LANGUAGES)[number]) {
  const started = startRound(SHIPPED_DIG, [], undefined, () => 0, level);
  const round = asking ? brushRound(started, { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 }) : started;
  render(<DigBoardScreen
    {...presentDigBoard(round, fakeBodyPicture)} language={language} level={level}
    brush={BRUSH_SIZES[level]} grains dugUp={0} total={SHIPPED_DIG.length} sandContext={() => null} onBrush={() => {}} onHome={() => {}}
  />, withPictures);
}

// jsdom does not lay out: budget the delivered CSS on the three iPads,
// capitals at a conservative 0.9 em.
describe.each(LANGUAGES.flatMap((language) => levels.map((level) => [language, level] as const)))("the question in %s at %s", (language, level) => {
  it.each([false, true])("keeps the board's size and the choices' column, asking %s, on all three iPads", (asking) => {
    show(level, asking, language);
    const outer = style(".dig-screen");
    const body = style(".dig-body");
    const board = style(".dig-board");
    const column = style(".dig-choice-cards");
    expect([outer.height, outer.overflow, body.display, board.height, board.maxHeight]).toEqual(["100dvh", "hidden", "flex", "auto", "100%"]);
    expect(board.aspectRatio).toBe("var(--frame-width) / var(--frame-height)");
    expect(board.width).toBe("min(100% - 228px, 1.3333333333333333 * (100dvh - 180px))");
    expect([column.flexBasis, column.flexDirection, px(body.gap) + px(column.flexBasis)]).toEqual(["200px", "column", 228]);
    const cards = document.querySelectorAll(".dig-choice-card");
    expect(cards).toHaveLength(asking ? CHOICES[level] : 0);
    expect(document.querySelector(".dig-choice-cards")?.getAttribute("aria-hidden")).toBe(asking ? null : "true");

    for (const [width, height] of sizes) {
      const roomWidth = width - px(outer.paddingLeft) - px(outer.paddingRight);
      const roomHeight = height - px(outer.paddingTop) - px(outer.paddingBottom) - 56 - px(outer.gap);
      const boardWidth = Math.min(roomWidth - 228, (height - 180) * 4 / 3);
      expect(boardWidth).toBeGreaterThan(680);
      expect(boardWidth * FRAME.height / FRAME.width).toBeLessThanOrEqual(roomHeight);
      expect(boardWidth + 228).toBeLessThanOrEqual(roomWidth);
      const offset = asking ? 0 : Number(/translateX\(calc\((\d+)px/.exec(board.transform)?.[1]);
      const boardLeft = (roomWidth - boardWidth - 228) / 2;
      if (!asking) expect(boardLeft + offset + boardWidth / 2).toBeCloseTo(roomWidth / 2);
      else expect(boardLeft + boardWidth + px(body.gap) + px(column.flexBasis)).toBeLessThanOrEqual(roomWidth);

      if (asking) {
        const card = style(".dig-choice-card");
        expect([card.flex, card.maxHeight]).toEqual(["1 1 0px", "170px"]);
        // Each card shows its dinosaur at least 80 CSS pixels tall.
        const cardHeight = Math.min(px(card.maxHeight), (roomHeight - (CHOICES[level] - 1) * px(column.gap)) / CHOICES[level]);
        const pictureWidth = px(column.flexBasis) - px(card.paddingLeft) - px(card.paddingRight) - px(card.borderLeftWidth) - px(card.borderRightWidth);
        expect(Math.min(cardHeight - pads(card), pictureWidth * 3 / 4)).toBeGreaterThanOrEqual(80);
      }
      const title = TEXTS[language][asking ? "whoIsIt" : "dig"];
      expect(document.querySelector(".dig-title")?.textContent).toContain(title);
      expect(title.length * 0.9 * px(style(".dig-title").fontSize) + 66 + 180 + 110 + 48).toBeLessThanOrEqual(roomWidth);
    }
  });
});
