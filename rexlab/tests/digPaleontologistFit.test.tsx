import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DigBoardScreen } from "../src/DigBoardScreen.tsx";
import { startRound } from "../src/dig/index.ts";
import { LANGUAGES } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";
import { presentDigBoard } from "../src/presentation.ts";
import { withPictures } from "./pictures.tsx";
import { SHIPPED_DIG, contrast, fakeBodyPicture, seenOn, surfaceOf } from "./support.ts";

const px = (value: string) => Number.parseFloat(value);
const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
const pads = (s: CSSStyleDeclaration) => px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth);
const sizes = [[1024, 768], [1133, 744], [1366, 1024]] as const;

// jsdom does not lay out: derive the space from the delivered CSS and
// budget capital letters at a conservative 0.9 em, as Explorer's fit test.
describe.each(LANGUAGES.flatMap((language) => (["light", "dark"] as const).map((theme) => [language, theme] as const)))("Paleontologist's board in %s, %s", (language, theme) => {
  it.each([false, true])("fits both the clues and choice, choosing %s, on all three iPads", (choice) => {
    document.documentElement.dataset.theme = theme;
    try {
      const dinosaur = SHIPPED_DIG.find(({ id }) => id === "triceratops")!;
      const base = startRound([dinosaur, ...SHIPPED_DIG.filter(({ id }) => id !== dinosaur.id)], [], undefined, () => 0, "paleontologist");
      const found = base.spots.slice(0, choice ? 3 : 2).map(({ kind }) => kind);
      const round = { ...base, found };
      render(<DigBoardScreen
        {...presentDigBoard(round, fakeBodyPicture, language)} language={language} level="paleontologist"
        brush={36} grains dugUp={0} total={42} sandContext={() => null} onBrush={() => {}} onHome={() => {}}
      />, withPictures);
      const outer = style(".dig-screen");
      const body = style(".dig-body");
      const column = style(".dig-find-cards");
      const board = style(".dig-board");
      expect([outer.height, outer.overflow, body.display, column.flexBasis, board.height]).toEqual(["100dvh", "hidden", "flex", "232px", "auto"]);
      expect(board.aspectRatio).toBe("var(--frame-width) / var(--frame-height)");
      expect(document.querySelector(".dig-body")?.hasAttribute("data-choice")).toBe(choice);
      if (choice) expect(board.width).toContain("100dvh - 420px");
      const cards = [...document.querySelectorAll<HTMLElement>(".dig-find-card")];
      const cluesHeight = cards.reduce((total, card) => {
        const s = getComputedStyle(card);
        const word = getComputedStyle(card.querySelector(".dig-find-word")!);
        const disc = card.querySelector(".dig-spot-picture, .dig-clue-sand")!;
        const discHeight = px(getComputedStyle(disc).height);
        return total + pads(s) + (card.hasAttribute("data-found") ? Math.max(discHeight, 1.5 * px(word.fontSize)) : discHeight + 1.5 * px(word.fontSize) + 1.5 * px(style(".dig-clue-number").fontSize) + 2 * px(s.gap));
      }, 0) + (cards.length - 1) * px(column.gap);
      for (const card of cards) {
        const s = getComputedStyle(card);
        const word = card.querySelector<HTMLElement>(".dig-find-word")!;
        const ws = getComputedStyle(word);
        expect(ws.whiteSpace).toBe("nowrap");
        const row = card.hasAttribute("data-found");
        const usedWidth = word.textContent!.length * 0.9 * px(ws.fontSize) + px(s.paddingLeft) + px(s.paddingRight) + 4 + (row ? 44 + px(s.gap) : 0);
        expect(usedWidth).toBeLessThanOrEqual(px(column.flexBasis));
        const surface = surfaceOf(word);
        expect(contrast(seenOn(ws.color, surface), surface)).toBeGreaterThanOrEqual(4.5);
      }
      for (const [width, height] of sizes) {
        const roomWidth = width - px(outer.paddingLeft) - px(outer.paddingRight);
        const roomHeight = height - px(outer.paddingTop) - px(outer.paddingBottom) - 56 - px(outer.gap);
        const choiceHeight = choice ? px(style(".dig-choice-cards").flexBasis) + px(outer.gap) : 0;
        const boardWidth = Math.min(roomWidth - px(body.gap) - px(column.flexBasis), (height - (choice ? 420 : 180)) * 4 / 3);
        expect(Math.max(boardWidth * 3 / 4, cluesHeight) + choiceHeight).toBeLessThanOrEqual(roomHeight);
        if (choice) {
          const row = style(".dig-choice-cards");
          expect(row.display).toBe("flex");
          expect(document.querySelectorAll(".dig-choice-card")).toHaveLength(3);
          const card = style(".dig-choice-card");
          expect(card.flex).toBe("1 1 0px");
          expect(card.minWidth).toBe("200px");
          expect((roomWidth - 2 * px(row.gap)) / 3).toBeGreaterThanOrEqual(200);
        }
        const title = TEXTS[language].whoIsIt;
        expect(title.length * 0.9 * px(style(".dig-title").fontSize) + 66 + 180 + 110 + 48).toBeLessThanOrEqual(roomWidth);
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
