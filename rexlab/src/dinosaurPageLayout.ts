export type KeptLines = { description: number; note: number };

// These bands are deliberately a function of width alone. The shipped words
// fit within the measured em budgets at each boundary, so every page in one
// window keeps the same vertical arrangement while its creature changes.
export function keptLines(width: number): KeptLines {
  return { description: width >= 656 ? 3 : width >= 520 ? 4 : 5, note: width >= 600 ? 3 : 4 };
}

export const descriptionLines = (width: number) => keptLines(width).description;
export const noteLines = (width: number) => keptLines(width).note;

// The words' room is the window less safe-area insets, the page's 56px side
// padding and any scrollbar reserved by the layout viewport.
export function dinosaurWordsWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 112 - scrollbar);
}
