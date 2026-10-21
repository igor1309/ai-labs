import type { ChipWidths } from "../src/FoodChips.tsx";
import { BASKET_EMS } from "./basketWidths.ts";

// jsdom lays nothing out, so the width of each count a food chip shows is
// given here in ems of Lexend's bold face, rounded up, in either language:
// its digits are Latin. The chips' words are in BASKET_EMS. A count
// missing here fails the test that reads it.
export const COUNT_EMS: Record<string, number> = {
  "3": 0.6,
  "23": 1.2,
  "26": 1.2
};

const px = (value: string | null) => Number.parseFloat(value ?? "") || 0;

// The width of a chip's part as the stylesheet lays it out: its symbols
// side by side at their size and gap, or its word or count from the em
// tables at the size of its type, inside its padding and no narrower
// than its least width. A word or count missing from the tables fails.
export function laidOutWidth(part: Element): number {
  const style = getComputedStyle(part);
  const symbols = [...part.querySelectorAll("svg")];
  if (symbols.length > 0) return symbols.reduce((sum, symbol) => sum + px(symbol.getAttribute("width")), 0) + px(style.columnGap || style.gap) * (symbols.length - 1);
  const words = part.textContent ?? "";
  const ems = BASKET_EMS[words] ?? COUNT_EMS[words];
  if (ems === undefined) throw new Error(`No width in ems for ${words}`);
  const content = ems * px(style.fontSize) + px(style.letterSpacing) * words.length;
  return Math.max(px(style.minWidth), content + px(style.paddingLeft) + px(style.paddingRight));
}

// The chips' parts measured as the stylesheet lays them out, in a test
// whose fonts never change.
export const emChipWidths = (): ChipWidths => ({ width: laidOutWidth, subscribe: () => () => {} });
