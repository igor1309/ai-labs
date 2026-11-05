import { describe, expect, it } from "vitest";
import { compareQuestionType, compareQuestionWidth, NARROW_QUESTION, PORTRAIT_QUESTION } from "../src/compareQuestionLayout.ts";
import { formatLength, formatMass } from "../src/formatValue.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { SHIPPED_DINOSAURS } from "./support.ts";

// Advances at weight 800, rounded up to 0.01 em: shipped Lexend for Latin
// and the macOS system face for Cyrillic. Spaces reserve the wider advance.
const PROMPT_EMS: Record<string, number> = {
  " ": 0.34, "?": 0.55,
  A: 0.7, E: 0.66, G: 0.79, H: 0.79, I: 0.59, L: 0.62, N: 0.82, O: 0.83, R: 0.71, S: 0.64, T: 0.7, V: 0.72, W: 1,
  В: 0.66, Г: 0.56, Д: 0.78, Е: 0.59, Ж: 1.03, И: 0.73, К: 0.7, Л: 0.74, Н: 0.75, О: 0.77, Т: 0.62, Ч: 0.72, Ш: 0.99, Ы: 0.92, Я: 0.69
};

// At weight 700, rounded up: the shipped Lexend advances for digits and
// Latin units, and the system face's bold Cyrillic units with 10% room
// for the iPad's face. The space reserves the wider Lexend advance.
const VALUE_EMS: Record<string, number> = {
  "0": 0.68, "1": 0.57, "2": 0.55, "3": 0.6, "4": 0.67,
  "5": 0.6, "6": 0.58, "7": 0.56, "8": 0.6, "9": 0.58,
  ".": 0.26, ",": 0.29, " ": 0.32,
  M: 0.88, K: 0.74, G: 0.79, T: 0.66,
  М: 0.97, К: 0.76, Г: 0.62, Т: 0.69
};

// A value's chip: 16 pixels a side, its 22-pixel symbol and the 8-pixel
// gap before its 22-pixel value.
const chipWidth = (ems: number) => 16 + 22 + 8 + ems * 22 + 16;

const emWidth = (text: string, table: Record<string, number>) => [...text].reduce((sum, glyph) => {
  const advance = table[glyph];
  if (advance === undefined) throw new Error(`No advance for ${glyph} in ${text}`);
  return sum + Math.round(advance * 100);
}, 0) / 100;

const LANGUAGES = ["en", "ru"] as const;
const prompts = LANGUAGES.flatMap((language) => Object.values(TEXTS[language].prompts));
const names = LANGUAGES.flatMap((language) => SHIPPED_DINOSAURS.map((dinosaur) => dinosaur.name[language].toLocaleUpperCase(language)));
const nameEms = (name: string) => {
  const ems = NAME_EMS[name];
  if (ems === undefined) throw new Error(`No width for ${name}`);
  return ems;
};
const values = LANGUAGES.flatMap((language) => SHIPPED_DINOSAURS.flatMap(({ measures: { mass, height, length } }) => [
  formatMass(mass, language),
  ...[height, length].flatMap((metres) => (metres === undefined ? [] : [formatLength(metres, language)]))
]));

// Every example's width, and the narrowest window's with no scrollbar and
// with one taking 16 pixels.
const WIDTHS = [...new Set([
  ...[600, 744, 768, 820, 1024].map((width) => compareQuestionWidth(width, 0, 0)),
  compareQuestionWidth(600, 0, 0, 16)
])].sort((a, b) => a - b);

describe("an upright question's words fit", () => {
  it("sizes the type by the widest prompt and the widest name of either language", () => {
    expect(SHIPPED_DINOSAURS).toHaveLength(52);
    expect(prompts).toHaveLength(10);
    expect(Math.max(...prompts.map((prompt) => emWidth(prompt, PROMPT_EMS)))).toBeCloseTo(PORTRAIT_QUESTION.widestPromptEms, 6);
    expect(Math.max(...names.map(nameEms))).toBe(PORTRAIT_QUESTION.widestNameEms);
  });

  it.each(WIDTHS)("fits every English and Russian prompt on one line beside its symbol at %i pixels", (width) => {
    const { prompt } = compareQuestionType(width);
    for (const text of prompts) expect(emWidth(text, PROMPT_EMS) * prompt, text).toBeLessThanOrEqual(width - PORTRAIT_QUESTION.promptSymbol - PORTRAIT_QUESTION.promptGap);
  });

  it.each(WIDTHS)("fits every English and Russian name on one line in its pocket, in one type, at %i pixels", (width) => {
    const { name } = compareQuestionType(width);
    for (const text of names) expect(nameEms(text) * name, text).toBeLessThanOrEqual(width - 2 * 28);
  });

  it.each([0, 16])("keeps every name at least 32 pixels in a 600-pixel window with a %i-pixel scrollbar", (scrollbar) => {
    expect(compareQuestionType(compareQuestionWidth(600, 0, 0, scrollbar)).name).toBeGreaterThanOrEqual(32);
  });

  it.each(WIDTHS)("keeps every English and Russian value in its chip, on one line, inside the picture's area at %i pixels", (width) => {
    expect(values.length).toBeGreaterThan(104);
    // The chip stands 24 pixels from the area's right edge, and leaves the
    // area's 24-pixel padding at its left.
    for (const value of values) expect(chipWidth(emWidth(value, VALUE_EMS)), value).toBeLessThanOrEqual(width - 2 * 24);
  });
});

// A phone's widths, the narrowest 320 with no scrollbar.
const NARROW_WIDTHS = [320, 375, 393, 430].map((width) => compareQuestionWidth(width, 0, 0, 0, NARROW_QUESTION));

describe("a phone question's words fit", () => {
  it.each(NARROW_WIDTHS)("fits every English and Russian prompt on one line beside its symbol at %i pixels", (width) => {
    const { prompt } = compareQuestionType(width, NARROW_QUESTION);
    for (const text of prompts) expect(emWidth(text, PROMPT_EMS) * prompt, text).toBeLessThanOrEqual(width - NARROW_QUESTION.promptSymbol - NARROW_QUESTION.promptGap);
  });

  it.each(NARROW_WIDTHS)("fits every English and Russian name on one line in its 20-pixel-padded pocket at %i pixels", (width) => {
    const { name } = compareQuestionType(width, NARROW_QUESTION);
    for (const text of names) expect(nameEms(text) * name, text).toBeLessThanOrEqual(width - 2 * 20);
  });
});

// NEXT's labels at weight 700, rounded up: Lexend's advances for the
// English ones, and the system face's for the Russian with 10% room.
const NEXT_EMS: Record<string, number> = { NEXT: 2.82, "SEE RESULT": 6.18, ДАЛЬШЕ: 4.91, РЕЗУЛЬТАТ: 6.61 };

// NEXT in a wide-short window: 24 pixels before its label at 20, the
// 10-pixel gap, its 22-pixel symbol and 20 pixels after.
const shortNextWidth = (label: string) => 24 + NEXT_EMS[label]! * 20 + 10 + 22 + 20;

// Every width of a phone on its side, as the question has it: the window
// less 20 pixels a side past the insets, from 568, the narrowest the
// cards stand side by side in, with none, and from 812 with a notch's.
const SHORT_WIDTHS = [
  ...Array.from({ length: (932 - 568) / 4 + 1 }, (_, step) => 568 + 4 * step - 40),
  ...Array.from({ length: (932 - 812) / 4 + 1 }, (_, step) => 812 + 4 * step - 40 - 2 * 59)
];

// The type the stylesheet gives a question `width` wide: the prompt 24
// pixels, or what leaves 274 for its symbol, the gaps and NEXT; each card
// half the row short of "VS" and its gaps, its name at most 24 pixels, or what
// fits the longest in its pocket.
const shortType = (width: number) => {
  const compact = width <= 675;
  const side = compact ? 12 : 20;
  const card = (width - (compact ? 40 : 56) - 2 * (compact ? 8 : 16)) / 2;
  return { prompt: Math.min(24, (width - 274) / 10.12), card, side, chip: compact ? 17 : 22, name: Math.min(24, (card - 2 * side) / 12.7) };
};

describe("a question's words fit on a phone on its side", () => {
  it("leaves NEXT room for its widest label in either language", () => {
    for (const language of LANGUAGES) for (const label of [TEXTS[language].next, TEXTS[language].seeResult]) expect(shortNextWidth(label), label).toBeLessThanOrEqual(210);
  });

  it.each(SHORT_WIDTHS)("fits every English and Russian prompt beside its 40-pixel symbol and the widest NEXT at %i pixels", (width) => {
    const { prompt } = shortType(width);
    for (const text of prompts) expect(40 + 12 + emWidth(text, PROMPT_EMS) * prompt + 12 + 210, text).toBeLessThanOrEqual(width);
  });

  it.each(SHORT_WIDTHS)("fits every English and Russian name on one line in its card's pocket at %i pixels", (width) => {
    const { card, name, side } = shortType(width);
    // 20 pixels from a 612-pixel row up, and never under 16.
    expect(name).toBeGreaterThanOrEqual(width >= 612 ? 20 : 16);
    // The longest fills its pocket exactly where its type is cut to it.
    for (const text of names) expect(nameEms(text) * name, text).toBeLessThanOrEqual(card - 2 * side + 1e-9);
  });

  it.each(SHORT_WIDTHS)("keeps every English and Russian value in its chip inside the picture's area at %i pixels", (width) => {
    const { card, chip } = shortType(width);
    for (const value of values) expect(12 + 22 + 8 + emWidth(value, VALUE_EMS) * chip + 16, value).toBeLessThanOrEqual(card - 2 * 12);
  });
});
