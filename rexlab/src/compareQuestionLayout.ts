// The upright question's CSS sizes; the stylesheet contract tests keep
// these in step with app.css.
export const PORTRAIT_QUESTION = {
  sidePadding: 56,
  topPadding: 40,
  bottomPadding: 48,
  barHeight: 56,
  gap: 32,
  promptSymbol: 56,
  promptGap: 16,
  promptMaximum: 44,
  cardsGap: 24,
  artPadding: 24,
  footerVerticalPadding: 20,
  footerSidePadding: 28,
  nameMaximum: 34,
  textLineHeight: 1.25,
  rowHeight: 72,
  pictureRatio: 4 / 3,
  pictureMaximum: { width: 560, height: 420 },
  minimumPicture: 150,
  // The widest prompt and the widest name in either language, in ems of
  // their bold faces, as the fit tests measure the shipped words: "WHO IS
  // SHORTER?" and PACHYCEPHALOSAURUS. One type per window fits them all.
  widestPromptEms: 9.97,
  widestNameEms: 12.7
} as const;

export type QuestionType = { prompt: number; name: number };

// The question's width is the window less safe-area insets, the screen's
// 56px side padding and any scrollbar reserved by the layout viewport.
export function compareQuestionWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * PORTRAIT_QUESTION.sidePadding - scrollbar);
}

// The prompt's and the names' type for a question `width` wide: as large
// as lets the widest fit, the prompt beside its symbol and a name in its
// footer, each at most its landscape size.
export function compareQuestionType(width: number): QuestionType {
  const sizes = PORTRAIT_QUESTION;
  return {
    prompt: Math.min(sizes.promptMaximum, Math.max(0, width - sizes.promptSymbol - sizes.promptGap) / sizes.widestPromptEms),
    name: Math.min(sizes.nameMaximum, Math.max(0, width - 2 * sizes.footerSidePadding) / sizes.widestNameEms)
  };
}

// Upright geometry with no vertical safe-area insets: the type, each
// card's height and its picture, and whether the screen scrolls. The two
// cards share what the bar, the prompt and the row for NEXT leave; a card
// is never so short that its picture would be under its minimum.
export function compareQuestionGeometry(windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0) {
  const sizes = PORTRAIT_QUESTION;
  const width = compareQuestionWidth(windowWidth, leftInset, rightInset, scrollbar);
  const type = compareQuestionType(width);
  const promptHeight = Math.max(sizes.promptSymbol, type.prompt * sizes.textLineHeight);
  const footerHeight = 2 * sizes.footerVerticalPadding + type.name * sizes.textLineHeight;
  const fixedHeight = sizes.topPadding + sizes.bottomPadding + sizes.barHeight + promptHeight + sizes.rowHeight + 3 * sizes.gap;
  const availableCard = (windowHeight - fixedHeight - sizes.cardsGap) / 2;
  const minimumCard = sizes.minimumPicture + 2 * sizes.artPadding + footerHeight;
  const cardHeight = Math.max(minimumCard, availableCard);
  const pictureHeight = Math.max(0, Math.min(
    sizes.pictureMaximum.height,
    cardHeight - footerHeight - 2 * sizes.artPadding,
    (width - 2 * sizes.artPadding) / sizes.pictureRatio
  ));
  return {
    width, type, footerHeight, cardHeight,
    picture: { width: pictureHeight * sizes.pictureRatio, height: pictureHeight },
    scrolls: availableCard < minimumCard
  };
}
