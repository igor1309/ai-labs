// The upright question's CSS sizes; the stylesheet contract tests keep
// these in step with app.css.
export const PORTRAIT_QUESTION = {
  sidePadding: 56,
  topPadding: 36,
  bottomPadding: 70,
  barHeight: 48,
  barGap: 16,
  // From the prompt's foot to the cards: the sand's edge and its lead.
  sandLead: 68,
  promptSymbol: 60,
  promptGap: 16,
  promptMaximum: 40,
  cardsGap: 24,
  pocketTop: 22,
  pocketBottom: 14,
  pocketSide: 28,
  nameGap: 6,
  nameMaximum: 34,
  textLineHeight: 1.25,
  rowHeight: 87,
  minimumPicture: 150,
  // The widest prompt and the widest name in either language, in ems at
  // weight 800, as the fit tests measure the shipped words: "WHO IS
  // SHORTER?" and PACHYCEPHALOSAURUS. One type per window fits them all.
  widestPromptEms: 10.12,
  widestNameEms: 12.7
} as const;

// A tall-narrow question's sizes, an iPhone's upright: 20-pixel sides,
// and less room between its parts, so the two cards fit a phone's height.
export const NARROW_QUESTION = {
  ...PORTRAIT_QUESTION,
  sidePadding: 20,
  topPadding: 24,
  bottomPadding: 62,
  barHeight: 56,
  barGap: 14,
  sandLead: 44,
  promptSymbol: 46,
  promptGap: 12,
  promptMaximum: 27,
  cardsGap: 16,
  pocketTop: 14,
  pocketBottom: 10,
  pocketSide: 20,
  nameGap: 4,
  nameMaximum: 28,
  rowHeight: 76,
  minimumPicture: 110
} as const;

export type QuestionSizes = typeof PORTRAIT_QUESTION | typeof NARROW_QUESTION;

export type QuestionType = { prompt: number; name: number };

// The question's width is the window less safe-area insets, the screen's
// side padding and any scrollbar reserved by the layout viewport.
export function compareQuestionWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0, sizes: QuestionSizes = PORTRAIT_QUESTION): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * sizes.sidePadding - scrollbar);
}

// The prompt's and the names' type for a question `width` wide: as large
// as lets the widest fit, the prompt beside its symbol and a name inside
// its pocket, each at most its drawn size.
export function compareQuestionType(width: number, sizes: QuestionSizes = PORTRAIT_QUESTION): QuestionType {
  return {
    prompt: Math.min(sizes.promptMaximum, Math.max(0, width - sizes.promptSymbol - sizes.promptGap) / sizes.widestPromptEms),
    name: Math.min(sizes.nameMaximum, Math.max(0, width - 2 * sizes.pocketSide) / sizes.widestNameEms)
  };
}

// Upright geometry with no vertical safe-area insets: the type, each
// pocket's height and its picture's, and whether the screen scrolls. The
// two pockets share what the bar, the prompt and the row for NEXT leave; a
// pocket is never so short that its picture would be under its minimum.
export function compareQuestionGeometry(windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0, sizes: QuestionSizes = PORTRAIT_QUESTION) {
  const width = compareQuestionWidth(windowWidth, leftInset, rightInset, scrollbar, sizes);
  const type = compareQuestionType(width, sizes);
  const promptHeight = Math.max(sizes.promptSymbol, type.prompt * sizes.textLineHeight);
  const nameHeight = type.name * sizes.textLineHeight;
  const fixedHeight = sizes.topPadding + sizes.barHeight + sizes.barGap + promptHeight + sizes.sandLead + sizes.rowHeight + sizes.bottomPadding;
  const availableCard = (windowHeight - fixedHeight - sizes.cardsGap) / 2;
  const surround = sizes.pocketTop + sizes.pocketBottom + sizes.nameGap + nameHeight;
  const minimumCard = sizes.minimumPicture + surround;
  const cardHeight = Math.max(minimumCard, availableCard);
  return {
    width, type, nameHeight, cardHeight,
    picture: { width: width - 2 * sizes.pocketSide, height: cardHeight - surround },
    scrolls: availableCard < minimumCard
  };
}
