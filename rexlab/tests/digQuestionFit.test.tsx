import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { BRUSH_SIZES, brushRound, CHOICES, FRAME, startRound } from "../src/dig/index.ts";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { presentDigBoard } from "../src/presentation.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_DIG, fakeBodyPicture } from "./support.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

const px = (value: string) => Number.parseFloat(value);
const style = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return getComputedStyle(element);
};
const pads = (s: CSSStyleDeclaration) => px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth);
const levels = ["explorer", "paleontologist"] as const;

function show(level: (typeof levels)[number], asking: boolean, language: (typeof LANGUAGES)[number]) {
  const started = startRound(SHIPPED_DIG, [], undefined, () => 0, level);
  const round = asking ? brushRound(started, { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 }) : started;
  render(<DigBoardScreen
    {...presentDigBoard(round, fakeBodyPicture)} language={language} level={level}
    brush={BRUSH_SIZES[level]} grains dugUp={0} total={SHIPPED_DIG.length} sandContext={() => null} onBrush={() => {}} onHome={() => {}}
  />, withPictures);
}

// jsdom does not lay out: budget the delivered CSS in each window,
// capitals at a conservative 0.9 em.
describe.each(LANGUAGES.flatMap((language) => levels.map((level) => [language, level] as const)))("the question in %s at %s", (language, level) => {
  it.each(windowsAnd([1366, 1024]).flatMap(([width, height]) => [false, true].map((asking) => [asking, width, height] as const)))("keeps the board's size and the choices' column, asking %s, in a %i by %i window", (asking, width, height) => {
    openWindow(width, height);
    show(level, asking, language);
    const outer = style(".dig-screen");
    const body = style(".dig-body");
    const board = style(".dig-board");
    const column = style(".dig-choice-cards");
    expect([outer.height, outer.overflow, body.display, board.height, board.maxHeight]).toEqual([`${height}px`, "hidden", "flex", "auto", "100%"]);
    expect(board.aspectRatio).toBe("var(--frame-width) / var(--frame-height)");
    // The board is as wide as the body leaves beside the column, or as the
    // height the screen leaves it allows at the frame's 4:3.
    const sizing = /^min\(100% - 228px, 1\.3333333333333333 \* \(([\d.]+)px - 180px \+ ([\d.]+) \* ([\d.]+)px\)\)$/.exec(board.width);
    if (!sizing) throw new Error(`Unknown board width: ${board.width}`);
    expect(Number(sizing[1])).toBe(height);
    const boardHeight = height - 180 + Number(sizing[2]) * Number(sizing[3]);
    expect([column.flexBasis, column.flexDirection, px(body.gap) + px(column.flexBasis)]).toEqual(["200px", "column", 228]);
    const cards = document.querySelectorAll(".dig-choice-card");
    expect(cards).toHaveLength(asking ? CHOICES[level] : 0);
    expect(document.querySelector(".dig-choice-cards")?.getAttribute("aria-hidden")).toBe(asking ? null : "true");

    {
      const roomWidth = width - px(outer.paddingLeft) - px(outer.paddingRight);
      const roomHeight = height - px(outer.paddingTop) - px(outer.paddingBottom) - 56 - px(outer.rowGap);
      const boardWidth = Math.min(roomWidth - 228, boardHeight * 4 / 3);
      expect(boardWidth).toBeGreaterThan(680);
      expect(boardWidth * FRAME.height / FRAME.width).toBeLessThanOrEqual(roomHeight);
      expect(boardWidth + 228).toBeLessThanOrEqual(roomWidth);
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
