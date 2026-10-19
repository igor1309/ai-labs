import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { FRAME, startRound } from "../src/dig/index.ts";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { presentDigBoard } from "../src/presentation.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_DIG, contrast, fakeBodyPicture, seenOn, surfaceOf } from "./support.ts";

const pixels = (value: string) => Number.parseFloat(value);
const style = (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`No ${selector}`);
  return getComputedStyle(element);
};

// jsdom does not lay out: budget the delivered CSS at 1024 by 768,
// with a conservative 0.9 em per capital in either language.
describe.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))("Explorer's board in %s, %s", (language, theme) => {
  it("fits the board and three cards without scrolling, with readable single-line words", () => {
    document.documentElement.dataset.theme = theme;
    try {
      const dinosaur = SHIPPED_DIG.find(({ id }) => id === "tyrannosaurus")!;
      // The scenario's EYE, FOOT, TAIL, from the same shipped picture.
      const round = { ...startRound([dinosaur], [], undefined, () => 0, "explorer"), spots: dinosaur.spots.filter(({ kind }) => kind !== "claw") };
      render(<DigBoardScreen
        {...presentDigBoard(round, fakeBodyPicture, language)} language={language} level="explorer"
        brush={36} grains dugUp={0} total={42} sandContext={() => null} onBrush={() => {}} onHome={() => {}}
      />, withPictures);

      const outer = style(".dig-screen");
      const room = { width: 1024 - pixels(outer.paddingLeft) - pixels(outer.paddingRight), height: 768 - pixels(outer.paddingTop) - pixels(outer.paddingBottom) - 56 - pixels(outer.gap) };
      const body = style(".dig-body");
      const board = style(".dig-board");
      const column = style(".dig-find-cards");
      expect([body.display, board.height, board.minWidth, column.flexDirection]).toEqual(["flex", "auto", "0px", "column"]);
      expect(board.aspectRatio).toBe("var(--frame-width) / var(--frame-height)");
      expect(outer.height).toBe("100dvh");
      expect(outer.overflow).toBe("hidden");
      const cardsWidth = pixels(column.flexBasis);
      const boardWidth = room.width - pixels(body.gap) - cardsWidth;
      expect(boardWidth).toBeGreaterThan(600);
      expect(boardWidth * FRAME.height / FRAME.width).toBeLessThanOrEqual(room.height);

      const cards = [...document.querySelectorAll<HTMLElement>(".dig-find-card")];
      expect(cards.map((card) => card.textContent)).toEqual([TEXTS[language].spotKinds.eye, TEXTS[language].spotKinds.foot, TEXTS[language].spotKinds.tail]);
      const card = style(".dig-find-card");
      const word = style(".dig-find-word");
      const disc = style(".dig-find-card > .dig-spot-picture");
      const cardHeight = pixels(disc.height) + pixels(card.paddingTop) + pixels(card.paddingBottom) + pixels(card.borderTopWidth) + pixels(card.borderBottomWidth) + pixels(card.gap) + 1.5 * pixels(word.fontSize);
      expect(3 * cardHeight + 2 * pixels(column.gap)).toBeLessThanOrEqual(room.height);
      for (const card of cards) {
        const word = card.querySelector<HTMLElement>(".dig-find-word")!;
        const s = getComputedStyle(word);
        expect(s.whiteSpace).toBe("nowrap");
        expect(word.textContent!.length * 0.9 * pixels(s.fontSize) + 2 * pixels(getComputedStyle(card).paddingLeft) + 4).toBeLessThanOrEqual(cardsWidth);
        const surface = surfaceOf(word);
        expect(contrast(seenOn(s.color, surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
