// Find the pair's upright result's CSS sizes; the stylesheet contract
// tests keep these in step with app.css.
export const PORTRAIT_PAIRS_RESULT = {
  padding: 32,
  foundGap: 20,
  gap: 16,
  foundMaximum: 648,
  cardsGap: 16,
  cardMinimum: 90,
  artRatio: 4 / 3,
  namePadding: 8,
  nameMaximum: 18,
  nameEms: 13,
  nameLineHeight: 1.25,
  badge: 60,
  triesShare: 0.15,
  triesMaximum: 180,
  hand: 96,
  stars: 48,
  title: 48,
  best: 48,
  actions: 72,
  actionMaximum: 26,
  actionIcon: 28,
  actionInnerGap: 8,
  actionSidePadding: 12,
  actionsGap: 10,
  // PLAY AGAIN, BACK and HOME together in ems of their bold face, the
  // wider of either language: Russian's, as the result's fit test
  // measures them. One type per window fits both.
  actionsEms: 13.6
} as const;

// What the stylesheet cannot work out itself, as each depends on the
// width the window leaves: the tallest a card may stand, its landscape
// shape, and the actions' type.
export type PairsResultType = { cardMaximum: number; action: number };

// A result as it is shown: its dinosaurs, and the rows its celebration
// and new level take, none where it shows neither.
export type UprightResult = { count: number; badgeRows: 0 | 1 | 2 };

// The result's width is the window less safe-area insets, the screen's
// 32px padding a side and any scrollbar reserved by the layout viewport.
export function pairsResultWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * PORTRAIT_PAIRS_RESULT.padding - scrollbar);
}

// The dinosaurs stand three across, two across for four.
export const pairsResultColumns = (count: number) => (count === 4 ? 2 : 3);

// A card's width when `count` dinosaurs stand across a result `width`
// wide, the grid at most its maximum.
function cardWidth(width: number, count: number): number {
  const sizes = PORTRAIT_PAIRS_RESULT;
  const columns = pairsResultColumns(count);
  return Math.max(0, Math.min(sizes.foundMaximum, width) - (columns - 1) * sizes.cardsGap) / columns;
}

// The sizes for a result `width` wide: a card at most its landscape
// shape, its picture at 4:3 over its name, the name sized from the card's
// width as app.css sizes it; and the type that lets the three actions,
// their symbols, gaps and sides fit the width in either language, at
// most its maximum.
export function pairsResultType(width: number, count: number): PairsResultType {
  const sizes = PORTRAIT_PAIRS_RESULT;
  const card = cardWidth(width, count);
  const name = Math.min(sizes.nameMaximum, Math.max(0, card - 2 * sizes.namePadding) / sizes.nameEms);
  const actionsRoom = width - 3 * (sizes.actionIcon + sizes.actionInnerGap + 2 * sizes.actionSidePadding) - 2 * sizes.actionsGap;
  return {
    cardMaximum: card / sizes.artRatio + 2 * sizes.namePadding + sizes.nameLineHeight * name,
    action: Math.min(sizes.actionMaximum, Math.max(0, actionsRoom) / sizes.actionsEms)
  };
}

// Upright geometry with no vertical safe-area insets: the width, the
// sizes, the dinosaurs' columns and rows, the tries', the column under
// the dinosaurs, each card's size and whether the screen scrolls. The
// column holds the badges, the tries beside the hand, the stars earned,
// "WELL DONE!", the best and the actions; the cards' rows share the height
// it leaves, each card within its landscape shape and never under its
// minimum: below that the whole screen scrolls.
export function pairsResultGeometry(result: UprightResult, windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0) {
  const sizes = PORTRAIT_PAIRS_RESULT;
  const width = pairsResultWidth(windowWidth, leftInset, rightInset, scrollbar);
  const type = pairsResultType(width, result.count);
  const columns = pairsResultColumns(result.count);
  const rows = Math.ceil(result.count / columns);
  const tries = Math.min(sizes.triesMaximum, sizes.triesShare * windowHeight);
  const badges = result.badgeRows === 0 ? 0 : result.badgeRows * sizes.badge + (result.badgeRows - 1) * sizes.gap + sizes.gap;
  const column = badges + Math.max(tries, sizes.hand) + sizes.stars + sizes.title + sizes.best + sizes.actions + 4 * sizes.gap;
  const available = windowHeight - 2 * sizes.padding - sizes.foundGap - column;
  const byHeight = (available - (rows - 1) * sizes.cardsGap) / rows;
  return {
    width, type, columns, rows, tries, column,
    card: { width: cardWidth(width, result.count), height: Math.max(sizes.cardMinimum, Math.min(type.cardMaximum, byHeight)) },
    scrolls: byHeight < sizes.cardMinimum
  };
}
