import { describe, expect, it } from "vitest";
import records from "../src/data/dinosaurs.json";
import { readCatalogue } from "../src/dinosaurs.ts";
import { keptLines } from "../src/dinosaurPageLayout.ts";
import { TEXTS } from "../src/language/texts.ts";
import { NAME_EMS } from "./nameWidths.ts";

const DESCRIPTION_EMS: Record<string, number> = {
  " ": 0.3, A: 0.7, B: 0.69, C: 0.69, D: 0.76, E: 0.63, F: 0.61, G: 0.78, H: 0.77, I: 0.51, J: 0.61, K: 0.74, L: 0.61, M: 0.87, N: 0.8, O: 0.8, P: 0.65, Q: 0.8, R: 0.7, S: 0.63, T: 0.64, U: 0.75, V: 0.72, W: 1, X: 0.7, Y: 0.68, Z: 0.67,
  О: 0.77, Г: 0.55, Р: 0.62, М: 0.87, Н: 0.74, Ы: 0.86, Й: 0.73, Х: 0.68, Т: 0.62, И: 0.73, К: 0.66, С: 0.72, Б: 0.64, Л: 0.72, Ь: 0.63, Ш: 0.96, В: 0.64, Е: 0.59, Ч: 0.7, А: 0.68, П: 0.73, З: 0.62, У: 0.63, Д: 0.78, Я: 0.66, Ж: 0.99, Ю: 1, Э: 0.72, Ц: 0.78, Ё: 0.59, Щ: 1, Ф: 0.83, "«": 0.52, "»": 0.52, "—": 0.9,
  ".": 0.24, ",": 0.28, "-": 0.42, "'": 0.23, ":": 0.24, "!": 0.27, "2": 0.55, "7": 0.55
};

const catalogue = readCatalogue(records);
const lineCount = (text: string, width: number) => {
  let lines = 1;
  let current = 0;
  for (const word of text.trim().split(/\s+/)) {
    const wordWidth = [...word.toLocaleUpperCase("ru-RU")].reduce((sum, glyph) => sum + (DESCRIPTION_EMS[glyph] ?? 0.7), 0);
    const next = current === 0 ? wordWidth : current + DESCRIPTION_EMS[" "]! + wordWidth;
    if (current > 0 && next > width / 28) {
      lines++;
      current = wordWidth;
    } else current = next;
  }
  return lines;
};
const noteLineCount = (text: string, width: number) => {
  let lines = 1;
  let current = 0;
  for (const word of text.trim().split(/\s+/)) {
    const wordWidth = [...word].length * 0.55;
    const next = current === 0 ? wordWidth : current + 0.3 + wordWidth;
    if (current > 0 && next > width / 13) {
      lines++;
      current = wordWidth;
    } else current = next;
  }
  return lines;
};

describe("portrait dinosaur words fit the kept bands", () => {
  it.each([472, 520, 656])("fits every English and Russian description at %i pixels", (width) => {
    for (const dinosaur of catalogue) {
      for (const language of ["en", "ru"] as const) {
        expect(lineCount(dinosaur.description[language], width)).toBeLessThanOrEqual(keptLines(width).description);
      }
    }
  });

  it.each([472, 520, 656])("fits every name at the shared 7.8 percent size at %i pixels", (width) => {
    for (const dinosaur of catalogue) {
      for (const language of ["en", "ru"] as const) {
        const name = dinosaur.name[language].toLocaleUpperCase(language);
        const ems = NAME_EMS[name];
        expect(ems).toBeDefined();
        expect(ems! * Math.min(64, width * 0.078)).toBeLessThanOrEqual(width);
      }
    }
  });

  it.each([472, 520, 656])("fits the English and Russian source notes at %i pixels", (width) => {
    expect(noteLineCount(TEXTS.en.sourceNote, width)).toBeLessThanOrEqual(keptLines(width).note);
    expect(noteLineCount(TEXTS.ru.sourceNote, width)).toBeLessThanOrEqual(keptLines(width).note);
  });
});
