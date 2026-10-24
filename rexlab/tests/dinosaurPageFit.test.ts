import { describe, expect, it } from "vitest";
import records from "../src/data/dinosaurs.json";
import { readCatalogue } from "../src/dinosaurs.ts";
import { dinosaurWordsWidth, keptLines, NARROW_PAGE } from "../src/dinosaurPageLayout.ts";
import { TEXTS } from "../src/language/texts.ts";
import { formatLength, formatMass } from "../src/formatValue.ts";
import { NAME_EMS } from "./nameWidths.ts";

// Advances at 28 px, weight 500: Lexend for Latin and the system face for
// Cyrillic, rounded up to 0.01 em; the space reserves 0.3 em.
const DESCRIPTION_EMS: Record<string, number> = {
  " ": 0.3, A: 0.7, B: 0.69, C: 0.69, D: 0.76, E: 0.63, F: 0.61, G: 0.78, H: 0.77, I: 0.51, J: 0.61, K: 0.74, L: 0.61, M: 0.87, N: 0.8, O: 0.8, P: 0.65, Q: 0.8, R: 0.7, S: 0.63, T: 0.64, U: 0.75, V: 0.72, W: 1, X: 0.7, Y: 0.68, Z: 0.67,
  О: 0.77, Г: 0.55, Р: 0.62, М: 0.87, Н: 0.74, Ы: 0.86, Й: 0.73, Х: 0.68, Т: 0.62, И: 0.73, К: 0.66, С: 0.72, Б: 0.64, Л: 0.72, Ь: 0.63, Ш: 0.96, В: 0.64, Е: 0.59, Ч: 0.7, А: 0.68, П: 0.73, З: 0.62, У: 0.63, Д: 0.78, Я: 0.66, Ж: 0.99, Ю: 1, Э: 0.72, Ц: 0.78, Ё: 0.59, Щ: 1, Ф: 0.83, "«": 0.52, "»": 0.52, "—": 0.9,
  ".": 0.24, ",": 0.28, "-": 0.42, "'": 0.23, ":": 0.24, "!": 0.27, "2": 0.55, "7": 0.55
};

// At 13 px, weight 400: Latin advances from the shipped Lexend font and
// Cyrillic from the macOS system face through CoreText, rounded up to 0.01 em.
// Spaces use the larger Lexend advance, even between Cyrillic words.
const NOTE_EMS: Record<string, number> = {
  " ": 0.29,
  ",": 0.27,
  ".": 0.23,
  "A": 0.7,
  "B": 0.69,
  "C": 0.68,
  "E": 0.62,
  "F": 0.61,
  "H": 0.77,
  "L": 0.6,
  "M": 0.87,
  "N": 0.8,
  "P": 0.64,
  "S": 0.63,
  "U": 0.74,
  "a": 0.64,
  "c": 0.54,
  "d": 0.64,
  "e": 0.59,
  "f": 0.4,
  "g": 0.65,
  "h": 0.6,
  "i": 0.28,
  "k": 0.57,
  "l": 0.26,
  "m": 0.93,
  "n": 0.6,
  "o": 0.62,
  "p": 0.64,
  "r": 0.41,
  "s": 0.48,
  "t": 0.39,
  "u": 0.61,
  "v": 0.58,
  "w": 0.8,
  "y": 0.59,
  "А": 0.68,
  "Б": 0.63,
  "К": 0.67,
  "Л": 0.7,
  "М": 0.88,
  "Н": 0.75,
  "С": 0.72,
  "Ф": 0.83,
  "а": 0.56,
  "в": 0.55,
  "г": 0.46,
  "д": 0.61,
  "е": 0.58,
  "з": 0.53,
  "и": 0.6,
  "й": 0.6,
  "к": 0.54,
  "л": 0.58,
  "м": 0.75,
  "н": 0.6,
  "о": 0.6,
  "п": 0.59,
  "р": 0.62,
  "с": 0.57,
  "т": 0.5,
  "у": 0.55,
  "ф": 0.74,
  "ц": 0.62,
  "ы": 0.73,
  "ь": 0.52,
  "э": 0.57,
  "я": 0.53
};

// At weight 700, rounded up: the shipped Lexend advances for digits and
// Latin units, and the system face's bold Cyrillic units with 10% room
// for the iPad's face. The space reserves the wider Lexend advance.
const FACT_EMS: Record<string, number> = {
  "0": 0.68, "1": 0.57, "2": 0.55, "3": 0.6, "4": 0.67,
  "5": 0.6, "6": 0.58, "7": 0.56, "8": 0.6, "9": 0.58,
  ".": 0.26, ",": 0.29, " ": 0.32,
  M: 0.88, K: 0.74, G: 0.79, T: 0.66,
  М: 0.97, К: 0.76, Г: 0.62, Т: 0.69
};

const catalogue = readCatalogue(records);
// All widths of both portrait scenario outlines, plus both sides of each
// kept-band boundary. The 600 window reserves a 16-pixel scrollbar in the
// word-fit outline and no scrollbar in the page-size outline.
const WIDTHS = [...new Set([
  ...[600, 632, 712, 744, 768, 820, 1024].map((width) => dinosaurWordsWidth(width, 0, 0)),
  dinosaurWordsWidth(600, 0, 0, 16), 519, 599, 655
])].sort((a, b) => a - b);

const emWidth = (text: string, table: Record<string, number>) => [...text].reduce((sum, glyph) => {
  const advance = table[glyph];
  if (advance === undefined) throw new Error(`No advance for ${glyph} in ${text}`);
  return sum + advance;
}, 0);

function lineCount(text: string, width: number, fontSize: number, table: Record<string, number>) {
  let lines = 1;
  let current = 0;
  const space = emWidth(" ", table) * fontSize;
  for (const word of text.trim().split(/\s+/)) {
    const wordWidth = emWidth(word, table) * fontSize;
    // A word wider than its row cannot be hidden by counting it as one line.
    expect(wordWidth, word).toBeLessThanOrEqual(width);
    const next = current === 0 ? wordWidth : current + space + wordWidth;
    if (current > 0 && next > width) {
      lines++;
      current = wordWidth;
    } else current = next;
  }
  return lines;
}

describe("portrait dinosaur words fit the kept bands", () => {
  it.each(WIDTHS)("fits all 52 English and Russian descriptions at %i pixels", (width) => {
    expect(catalogue).toHaveLength(52);
    for (const dinosaur of catalogue) {
      for (const language of ["en", "ru"] as const) {
        expect(lineCount(dinosaur.description[language], width, 28, DESCRIPTION_EMS), `${dinosaur.id} ${language}`).toBeLessThanOrEqual(keptLines(width).description);
      }
    }
  });

  it.each(WIDTHS)("fits every name at the shared 7.8 percent size at %i pixels", (width) => {
    for (const dinosaur of catalogue) {
      for (const language of ["en", "ru"] as const) {
        const name = dinosaur.name[language].toLocaleUpperCase(language);
        const ems = NAME_EMS[name];
        expect(ems, name).toBeDefined();
        expect(ems! * Math.min(64, width * 0.078), name).toBeLessThanOrEqual(width);
      }
    }
  });

  it.each(WIDTHS)("fits each English and Russian fact value on one line at %i pixels", (width) => {
    // The two equal facts share a 16-pixel gap; each has 24-pixel side
    // padding. Its value is 26% of that content width, at most 44 pixels.
    const content = (width - 16) / 2 - 48;
    const size = Math.min(44, content * 0.26);
    for (const dinosaur of catalogue) {
      for (const language of ["en", "ru"] as const) {
        const values = [formatLength(dinosaur.size.metres, language), formatMass(dinosaur.mass, language)];
        for (const value of values) expect(emWidth(value, FACT_EMS) * size, `${dinosaur.id} ${language}: ${value}`).toBeLessThanOrEqual(content);
      }
    }
  });

  it.each(WIDTHS)("fits both source notes in their kept room at %i pixels", (width) => {
    for (const language of ["en", "ru"] as const) expect(lineCount(TEXTS[language].sourceNote, width, 13, NOTE_EMS), language).toBeLessThanOrEqual(keptLines(width).note);
  });

  it("keeps four lines for Russian throughout 520–599 pixels and three for both languages from 600", () => {
    for (let width = 520; width < 600; width++) {
      expect(keptLines(width).note).toBe(4);
      expect(lineCount(TEXTS.ru.sourceNote, width, 13, NOTE_EMS)).toBeLessThanOrEqual(4);
    }
    for (let width = 600; width <= 912; width++) {
      expect(keptLines(width).note).toBe(3);
      for (const language of ["en", "ru"] as const) expect(lineCount(TEXTS[language].sourceNote, width, 13, NOTE_EMS)).toBeLessThanOrEqual(3);
    }
    expect(lineCount(TEXTS.ru.sourceNote, 520, 13, NOTE_EMS)).toBe(4);
  });
});

// At 18 px, weight 600: the shipped Lexend advances for the English
// labels, and the macOS system face's for the Russian, rounded up.
const LABEL_EMS: Record<string, number> = {
  TALL: 2.54, WINGS: 3.74, LONG: 2.99, HEAVY: 3.5,
  РОСТ: 2.68, КРЫЛЬЯ: 4.12, ДЛИНА: 3.59, ВЕС: 1.93
};

// The words' width in every tall-narrow window, 320 to 599 wide, on its
// 20-pixel sides.
const NARROW_WIDTHS = Array.from({ length: 280 }, (_, step) => dinosaurWordsWidth(320 + step, 0, 0, 0, NARROW_PAGE.sidePadding));

describe("narrow dinosaur words fit their kept bands", () => {
  it("fits all 52 English and Russian descriptions in 24-pixel type, and both notes, at every narrow width", () => {
    expect([NARROW_WIDTHS[0], NARROW_WIDTHS.at(-1)]).toEqual([280, 559]);
    for (const width of NARROW_WIDTHS) {
      const kept = keptLines(width, true);
      for (const language of ["en", "ru"] as const) {
        for (const dinosaur of catalogue) {
          expect(lineCount(dinosaur.description[language], width, NARROW_PAGE.descriptionSize, DESCRIPTION_EMS), `${dinosaur.id} ${language} at ${width}`).toBeLessThanOrEqual(kept.description);
        }
        expect(lineCount(TEXTS[language].sourceNote, width, 13, NOTE_EMS), `${language} at ${width}`).toBeLessThanOrEqual(kept.note);
      }
    }
  });

  it("keeps no more lines than the longest takes at the narrowest width of each band", () => {
    const most = (width: number) => Math.max(...catalogue.flatMap((dinosaur) => (["en", "ru"] as const).map((language) => lineCount(dinosaur.description[language], width, NARROW_PAGE.descriptionSize, DESCRIPTION_EMS))));
    expect([280, 295, 311, 357, 429].map((width) => [keptLines(width, true).description, most(width)])).toEqual([[8, 8], [7, 7], [6, 6], [5, 5], [4, 4]]);
  });

  it.each(NARROW_WIDTHS.filter((width) => width % 20 === 0 || width === 280 || width === 335))("fits every name, and each fact's label and value with the facts one over the other, at %i pixels", (width) => {
    // A fact as wide as the words has 24-pixel side padding; its value is
    // 26% of the content width, at most 44 pixels, and its label a
    // 22-pixel symbol 8 from the word.
    const content = width - 48;
    const size = Math.min(44, content * 0.26);
    for (const language of ["en", "ru"] as const) {
      const texts = TEXTS[language];
      for (const label of [...Object.values(texts.measures), texts.heavy]) expect(22 + 8 + LABEL_EMS[label]! * 18, label).toBeLessThanOrEqual(content);
      for (const dinosaur of catalogue) {
        const name = dinosaur.name[language].toLocaleUpperCase(language);
        expect(NAME_EMS[name]! * Math.min(64, width * 0.078), name).toBeLessThanOrEqual(width);
        for (const value of [formatLength(dinosaur.size.metres, language), formatMass(dinosaur.mass, language)]) {
          expect(emWidth(value, FACT_EMS) * size, `${dinosaur.id} ${language}: ${value}`).toBeLessThanOrEqual(content);
        }
      }
    }
  });
});
