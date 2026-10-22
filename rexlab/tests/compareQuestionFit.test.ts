import { describe, expect, it } from "vitest";
import { compareQuestionType, compareQuestionWidth, PORTRAIT_QUESTION } from "../src/compareQuestionLayout.ts";
import { formatLength, formatMass } from "../src/formatValue.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NAME_EMS } from "./nameWidths.ts";
import { SHIPPED_DINOSAURS } from "./support.ts";

// Advances at weight 700, rounded up to 0.01 em: the shipped Lexend font
// for Latin and the question mark, and the macOS system face through
// CoreText for Cyrillic, which Lexend has no letters for. The space
// reserves the wider Lexend advance, even between Cyrillic words.
const PROMPT_EMS: Record<string, number> = {
  " ": 0.33, "?": 0.54,
  A: 0.7, E: 0.65, G: 0.79, H: 0.78, I: 0.56, L: 0.61, N: 0.81, O: 0.82, R: 0.71, S: 0.64, T: 0.66, V: 0.72, W: 1,
  В: 0.65, Г: 0.55, Д: 0.77, Е: 0.59, Ж: 1.01, И: 0.73, К: 0.68, Л: 0.73, Н: 0.74, О: 0.76, Т: 0.61, Ч: 0.71, Ш: 0.97, Ы: 0.89, Я: 0.67
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
  return sum + advance;
}, 0);

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
    for (const text of prompts) expect(emWidth(text, PROMPT_EMS) * prompt, text).toBeLessThanOrEqual(width - 56 - 16);
  });

  it.each(WIDTHS)("fits every English and Russian name on one line in its footer, in one type, at %i pixels", (width) => {
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
