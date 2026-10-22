import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { BRUSH_SIZES, brushRound, CHOICES, FRAME, startRound } from "../src/dig/index.ts";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { presentDigBoard } from "../src/presentation.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_DIG, fakeBodyPicture, fakeTreasurePicture } from "./support.ts";
import { openWindow, windowsAnd } from "./windowSizes.ts";

// jsdom does not lay out: each board title's width in ems of its face,
// rounded up, Lexend bold for the Latin and the iPad's own face for the
// Cyrillic, as digFieldGuideFit.test.tsx measures its words.
const EMS: Record<string, number> = { DIG: 2.2, "WHO IS IT?": 6.2, РАСКОПКИ: 5.7, "КТО ЭТО?": 4.9 };

const px = (value: string) => Number.parseFloat(value);
const style = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return getComputedStyle(element);
};
const pads = (s: CSSStyleDeclaration) => px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth);
const levels = ["explorer", "paleontologist"] as const;

function show(level: (typeof levels)[number] | "hatchling", asking: boolean, language: (typeof LANGUAGES)[number]) {
  const started = startRound(SHIPPED_DIG, [], undefined, () => 0, level);
  const round = asking ? brushRound(started, { from: { x: 400, y: 300 }, to: { x: 400, y: 300 }, radius: 1000 }) : started;
  render(<DigBoardScreen
    {...presentDigBoard(round, fakeBodyPicture, fakeTreasurePicture, (id) => id)} choiceCount={round.choices.length} language={language} level={level}
    brush={BRUSH_SIZES[level]} wide={false} onWide={() => {}} grains dugUp={0} total={SHIPPED_DIG.length} treasures={0} sandContext={() => null} onBrush={() => {}} onHome={() => {}}
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
    expect([board.aspectRatio, board.transform, board.translate]).toEqual(["var(--frame-width) / var(--frame-height)", "none", "none"]);
    // The board and the column sit side by side, centred together in the
    // body, the board first: nothing shifts the body or the board aside.
    expect([body.flexDirection, body.justifyContent, body.alignItems, body.transform, body.translate]).toEqual(["row", "center", "center", "none", "none"]);
    expect([board.marginLeft, board.marginRight, board.position, board.left]).toEqual(["0", "0", "relative", "auto"]);
    expect(document.querySelector(".dig-board")?.nextElementSibling).toBe(document.querySelector(".dig-choice-cards"));
    // The board is as wide as the body leaves beside the column, or as the
    // height the screen leaves it allows at the frame's 4:3.
    const sizing = /^min\(100% - 228px, 1\.3333333333333333 \* \(([\d.]+)px - 180px \+ ([\d.]+) \* ([\d.]+)px\)\)$/.exec(board.width);
    if (!sizing) throw new Error(`Unknown board width: ${board.width}`);
    expect(Number(sizing[1])).toBe(height);
    const boardHeight = height - 180 + Number(sizing[2]) * Number(sizing[3]);
    expect([column.flexBasis, column.flexDirection, px(body.gap) + px(column.flexBasis)]).toEqual(["200px", "column", 228]);
    expect(document.querySelectorAll(".dig-choice-card")).toHaveLength(asking ? CHOICES[level] : 0);
    expect(document.querySelectorAll(".dig-choice-slot .dig-empty-card")).toHaveLength(CHOICES[level]);
    expect(document.querySelector(".dig-choice-cards")?.getAttribute("aria-hidden")).toBe(asking ? null : "true");

    {
      const roomWidth = width - px(outer.paddingLeft) - px(outer.paddingRight);
      const roomHeight = height - px(outer.paddingTop) - px(outer.paddingBottom) - 56 - px(outer.rowGap);
      const boardWidth = Math.min(roomWidth - 228, boardHeight * 4 / 3);
      expect(boardWidth).toBeGreaterThan(680);
      expect(boardWidth * FRAME.height / FRAME.width).toBeLessThanOrEqual(roomHeight);
      expect(boardWidth + 228).toBeLessThanOrEqual(roomWidth);
      const boardLeft = (roomWidth - boardWidth - 228) / 2;
      expect(boardLeft + boardWidth + px(body.gap) + px(column.flexBasis)).toBeLessThanOrEqual(roomWidth);

      const slot = style(".dig-choice-slot");
      expect([slot.flex, slot.maxHeight]).toEqual(["1 1 0px", "170px"]);
      if (asking) {
        const card = style(".dig-choice-card");
        const picture = style(".dig-choice-picture");
        expect([card.display, card.flexDirection, picture.flex, picture.height, picture.objectFit]).toEqual(["flex", "column", "1 1 auto", "0px", "contain"]);
        // Each card shows its dinosaur at least 80 CSS pixels tall.
        const cardHeight = Math.min(px(slot.maxHeight), (roomHeight - (CHOICES[level] - 1) * px(column.gap)) / CHOICES[level]);
        const pictureWidth = px(column.flexBasis) - px(card.paddingLeft) - px(card.paddingRight) - px(card.borderLeftWidth) - px(card.borderRightWidth);
        const caption = style(".dig-choice-name");
        // The name is at most 14px, smaller only for a name too long for that.
        expect(caption.fontSize).toBe("min(14px, calc(100cqi / (var(--letters) * 0.75)))");
        const captionHeight = 14 * px(caption.lineHeight);
        const imageHeight = cardHeight - pads(card) - captionHeight - px(card.gap);
        expect(Math.min(imageHeight, pictureWidth * 3 / 4)).toBeGreaterThanOrEqual(80);
      }
      const title = TEXTS[language][asking ? "whoIsIt" : "dig"];
      expect(document.querySelector(".dig-title")?.textContent).toContain(title);
      // Beside DUG UP, the FIELD GUIDE's button: its book and a count of
      // up to three digits, and the bar's gap before it.
      const guide = style(".dig-field-guide-button");
      const guideWidth = Math.max(px(guide.minWidth), px(guide.paddingLeft) + 26 + px(guide.gap) + 3 * 0.75 * px(guide.fontSize) + px(guide.paddingRight)) + px(style(".dig-bar").gap);
      // Before it the brush picker, its two buttons and the bar's gap.
      const picker = style(".dig-brush-picker");
      const pickerWidth = px(picker.paddingLeft) + 2 * px(style(".dig-brush-option").width) + px(picker.gap) + px(picker.paddingRight) + px(style(".dig-bar").gap);
      // The title shrinks to the room left, its letters at most 0.75 of
      // its size wide, and stays at least 30 pixels large.
      const titleRoom = roomWidth - 180 - 110 - 48 - guideWidth - pickerWidth;
      const ems = EMS[title];
      if (ems === undefined) throw new Error(`No width for ${title}`);
      expect(style(".dig-title-words").fontSize).toBe("min(40px, (100cqi - 66px) / (var(--letters) * 0.75))");
      expect(ems).toBeLessThanOrEqual(title.length * 0.75);
      const size = Math.min(40, (titleRoom - 66) / (title.length * 0.75));
      expect([style(".dig-title").whiteSpace, size >= 30]).toEqual(["nowrap", true]);
      expect(66 + ems * size).toBeLessThanOrEqual(titleRoom);
    }
  });
});

describe.each(LANGUAGES)("Hatchling in %s", (language) => {
  it("centres its board in the body, with no column beside it", () => {
    show("hatchling", false, language);
    const body = style(".dig-body");
    const board = style(".dig-board");
    expect(document.querySelector(".dig-body")?.hasAttribute("data-asks")).toBe(false);
    expect(document.querySelector(".dig-choice-cards")).toBeNull();
    expect([body.display, body.flexDirection, body.justifyContent, body.alignItems, body.transform, body.translate]).toEqual(["flex", "row", "center", "center", "none", "none"]);
    expect([board.marginLeft, board.marginRight, board.transform, board.translate, board.left]).toEqual(["0", "0", "none", "none", "auto"]);
    expect(document.querySelector(".dig-body")?.children).toHaveLength(1);
  });
});
