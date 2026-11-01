export type KeptLines = { description: number; note: number };

// Width-only bands keep every page in one window in the same vertical
// arrangement while its creature changes. A narrow page sets its
// description in smaller type, so its bands are its own.
export function keptLines(width: number, narrow = false): KeptLines {
  const description = narrow
    ? width >= 429 ? 4 : width >= 357 ? 5 : width >= 311 ? 6 : width >= 295 ? 7 : 8
    : width >= 656 ? 3 : width >= 520 ? 4 : 5;
  const note = width >= 600 ? 3 : width >= 448 ? 4 : width >= 403 ? 5 : width >= 305 ? 6 : width >= 286 ? 7 : 8;
  return { description, note };
}

export const descriptionLines = (width: number) => keptLines(width).description;
export const noteLines = (width: number) => keptLines(width).note;

// The upright CSS sizes; the stylesheet contract tests keep these in step
// with app.css, including the text whose normal line height varies by font.
export const PORTRAIT_PAGE = {
  sidePadding: 56,
  topPadding: 40,
  bottomPadding: 48,
  barHeight: 56,
  barGap: 28,
  stageGap: 32,
  stagePadding: 28,
  minimumStage: 248,
  arrowSize: 72,
  arrowGap: 16,
  pictureRatio: 4 / 3,
  wordsGap: 24,
  groupHeight: 22,
  groupMargin: -16,
  nameMaximum: 64,
  nameRatio: 0.078,
  textLineHeight: 1.25,
  dietHeight: 56,
  descriptionLineHeight: 41,
  factsGap: 16,
  factSidePadding: 24,
  factVerticalPadding: 20,
  factGap: 8,
  factLabelSize: 18,
  factValueMaximum: 44,
  factValueRatio: 0.26,
  noteLineHeight: 16.5
} as const;

// A tall-narrow page's own sizes: its sides, and its description's type.
export const NARROW_PAGE = {
  sidePadding: 20,
  descriptionSize: 24,
  descriptionLineHeight: 35
} as const;

// The words' room is the window less safe-area insets, the page's side
// padding, 56px or a narrow page's 20, and any scrollbar reserved by the
// layout viewport.
export function dinosaurWordsWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0, sidePadding: number = PORTRAIT_PAGE.sidePadding): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * sidePadding - scrollbar);
}

// Portrait geometry with no vertical safe-area insets. Side insets and the
// reserved scrollbar are inputs, so the kept bands and picture share the
// same width budget without relying on a browser's text measurements.
export function dinosaurPageGeometry(windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0) {
  const sizes = PORTRAIT_PAGE;
  const wordsWidth = dinosaurWordsWidth(windowWidth, leftInset, rightInset, scrollbar);
  const lines = keptLines(wordsWidth);
  const nameSize = Math.min(sizes.nameMaximum, wordsWidth * sizes.nameRatio);
  const factWidth = Math.max(0, (wordsWidth - sizes.factsGap) / 2 - 2 * sizes.factSidePadding);
  const factValueSize = Math.min(sizes.factValueMaximum, factWidth * sizes.factValueRatio);
  const factsHeight = 2 * sizes.factVerticalPadding + sizes.factLabelSize * sizes.textLineHeight
    + sizes.factGap + factValueSize * sizes.textLineHeight;
  // Five gaps run from group to note; the group's negative margin leaves
  // just eight pixels before the name.
  const wordsHeight = sizes.groupHeight + nameSize * sizes.textLineHeight + sizes.dietHeight
    + lines.description * sizes.descriptionLineHeight + factsHeight + lines.note * sizes.noteLineHeight
    + 5 * sizes.wordsGap + sizes.groupMargin;
  const fixedHeight = sizes.topPadding + sizes.bottomPadding + sizes.barHeight + sizes.barGap + sizes.stageGap;
  const availableStage = windowHeight - fixedHeight - wordsHeight;
  const stageHeight = Math.max(sizes.minimumStage, availableStage);
  const pictureWidth = Math.max(0, Math.min(
    wordsWidth - 2 * (sizes.stagePadding + sizes.arrowSize + sizes.arrowGap),
    (stageHeight - 2 * sizes.stagePadding) * sizes.pictureRatio
  ));
  return {
    wordsWidth, nameSize, wordsHeight, stageHeight,
    picture: { width: pictureWidth, height: pictureWidth / sizes.pictureRatio },
    scrolls: availableStage < sizes.minimumStage
  };
}
