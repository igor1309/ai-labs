// The portrait page keeps the same word bands for every creature in a
// window. Width is measured in CSS pixels; the tables are advances in ems.
const DESCRIPTION_EMS: Record<string, number> = {
  "2": 0.55, "7": 0.55, A: 0.7, H: 0.77, U: 0.75, G: 0.78, E: 0.63, N: 0.8, T: 0.64, R: 0.7, W: 1, I: 0.51, B: 0.69, D: 0.76, Y: 0.68, M: 0.87, S: 0.63, ".": 0.24, L: 0.61, O: 0.8, F: 0.61, V: 0.72, Z: 0.67, K: 0.74, ",": 0.28, C: 0.69, P: 0.65, J: 0.61, "-": 0.42, "'": 0.23, ":": 0.24, "!": 0.27, Q: 0.8,
  О: 0.77, Г: 0.55, Р: 0.62, М: 0.87, Н: 0.74, Ы: 0.86, Й: 0.73, Х: 0.68, Т: 0.62, И: 0.73, К: 0.66, С: 0.72, Б: 0.64, Л: 0.72, Ь: 0.63, Ш: 0.96, В: 0.64, Е: 0.59, Ч: 0.7, А: 0.68, П: 0.73, З: 0.62, У: 0.63, Д: 0.78, Я: 0.66, Ж: 0.99, Ю: 1, Э: 0.72, Ц: 0.78, Ё: 0.59, Щ: 1, Ф: 0.83, "«": 0.52, "»": 0.52, "—": 0.9
};

const NOTE_EMS: Record<string, number> = {
  " ": 0.3,
  ...Object.fromEntries(Object.keys(DESCRIPTION_EMS).map((glyph) => [glyph, 0.55]))
};

const widthOf = (word: string, table: Record<string, number>) =>
  [...word.toLocaleUpperCase("ru-RU")].reduce((width, glyph) => width + (table[glyph] ?? 0.7), 0);

function wrappedLines(text: string, width: number, fontSize: number, table: Record<string, number>): number {
  if (!text.trim() || width <= 0) return 1;
  const room = width / fontSize;
  let lines = 1;
  let current = 0;
  for (const word of text.trim().split(/\s+/)) {
    const wordWidth = widthOf(word, table);
    const withSpace = current === 0 ? wordWidth : current + (table[" "] ?? 0.3) + wordWidth;
    if (current > 0 && withSpace > room) {
      lines++;
      current = wordWidth;
    } else {
      current = withSpace;
    }
  }
  return lines;
}

export type KeptLines = { description: number; note: number };

// The minimum bands are the design's room guarantees. Measuring supplied
// words as well makes the function safe for content outside the shipped set.
export function keptLines(width: number, description = "", note = ""): KeptLines {
  const descriptionMinimum = width >= 656 ? 3 : width >= 520 ? 4 : 5;
  const noteMinimum = width >= 600 ? 3 : 4;
  return {
    description: Math.max(descriptionMinimum, wrappedLines(description, width, 28, DESCRIPTION_EMS)),
    note: Math.max(noteMinimum, wrappedLines(note, width, 13, NOTE_EMS))
  };
}

export const descriptionLines = (width: number, description = "") => keptLines(width, description).description;
export const noteLines = (width: number, note = "") => keptLines(width, "", note).note;

// The words' room is the window less safe-area insets and the page's 56px
// side padding. A browser's layout viewport already excludes a scrollbar.
export function dinosaurWordsWidth(windowWidth: number, leftInset: number, rightInset: number): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 112);
}
