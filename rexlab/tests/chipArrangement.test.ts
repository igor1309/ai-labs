import { describe, expect, it } from "vitest";
import { chipArrangement, type ChipContent } from "../src/chipArrangement.ts";
import { BASKET_EMS } from "./basketWidths.ts";
import { COUNT_EMS } from "./chipWidths.ts";

type Language = "English" | "Russian";

// The food chips' words, in 20-pixel type, and their counts, in 17, of
// the list of every dinosaur.
const WORDS: Record<Language, readonly string[]> = { English: ["MEAT", "PLANTS", "BOTH"], Russian: ["МЯСО", "РАСТЕНИЯ", "ВСЁ"] };
const COUNTS = ["26", "23", "3"];
// Each chip's symbols, 22 pixels each and 2 apart: "BOTH" has two.
const SYMBOLS = [22, 22, 46];

const ems = (table: Record<string, number>, word: string) => {
  const width = table[word];
  if (width === undefined) throw new Error(`no width for ${word}`);
  return width;
};

// A count's shade is 8 pixels each side of its digits, and at least 36.
const chipsIn = (language: Language): ChipContent[] =>
  WORDS[language].map((word, at) => ({
    symbols: SYMBOLS[at] ?? 0,
    word: 20 * ems(BASKET_EMS, word),
    count: Math.max(36, 17 * ems(COUNT_EMS, COUNTS[at] ?? "") + 16)
  }));

// The chips' row in a tall window: its width less the bar's 56-pixel
// padding on each side.
const rowIn = (windowWidth: number) => windowWidth - 2 * 56;

// A food chip at its landscape spacing: 20 before its symbols, 10 after
// its count and 10 between its parts.
const landscapeChip = ({ symbols, word, count }: ChipContent) => 20 + symbols + 10 + word + 10 + count + 10;

describe("how the food chips stand in a tall window", () => {
  it.each([
    ["English", 600, "stacked"],
    ["Russian", 600, "stacked"],
    ["Russian", 700, "stacked"],
    ["English", 744, "closed"],
    ["Russian", 744, "closed"],
    ["Russian", 820, "spaced"]
  ] as const)("in %s, %i wide, they are %s", (language, windowWidth, arrangement) => {
    expect(chipArrangement(rowIn(windowWidth), chipsIn(language))).toBe(arrangement);
  });

  it.each([
    [600, "stacked"],
    [744, "closed"],
    [768, "spaced"],
    [810, "spaced"],
    [820, "spaced"],
    [1024, "spaced"],
    [1400, "spaced"]
  ] as const)("in English, %i wide, as the list stands upright, they are %s", (windowWidth, arrangement) => {
    expect(chipArrangement(rowIn(windowWidth), chipsIn("English"))).toBe(arrangement);
  });

  it.each([
    ["English", 600],
    ["Russian", 600],
    ["Russian", 700]
  ] as const)("two by two in %s, %i wide, each row fits at landscape spacing", (language, windowWidth) => {
    const [meat, plants, both] = chipsIn(language).map(landscapeChip);

    expect(56 + 12 + (meat ?? Infinity)).toBeLessThanOrEqual(rowIn(windowWidth));
    expect((plants ?? Infinity) + 12 + (both ?? Infinity)).toBeLessThanOrEqual(rowIn(windowWidth));
  });

  // Whole-pixel parts, so the least widths are exact: "ALL" 56, then
  // each food chip and the gap before it.
  const WHOLE: ChipContent[] = [
    { symbols: 22, word: 58, count: 37 },
    { symbols: 22, word: 82, count: 37 },
    { symbols: 46, word: 60, count: 36 }
  ];
  const spaced = 56 + 3 * 12 + (50 + 22 + 58 + 37) + (50 + 22 + 82 + 37) + (50 + 46 + 60 + 36);
  // Closed up: 14 before the symbols, 8 after the count, 8 between the
  // parts and 8 between the chips.
  const closed = 56 + 3 * 8 + (38 + 22 + 58 + 37) + (38 + 22 + 82 + 37) + (38 + 46 + 60 + 36);

  it("stand spaced down to their least width at landscape spacing, then close up", () => {
    expect([spaced + 1, spaced, spaced - 0.5].map((row) => chipArrangement(row, WHOLE))).toEqual(["spaced", "spaced", "closed"]);
  });

  it("stand closed up down to their least width closed up, then two by two", () => {
    expect([closed, closed - 0.5, 0].map((row) => chipArrangement(row, WHOLE))).toEqual(["closed", "stacked", "stacked"]);
  });
});
