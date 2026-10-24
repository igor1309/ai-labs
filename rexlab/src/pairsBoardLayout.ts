// Find the pair's upright board's CSS sizes; the stylesheet contract
// tests keep these in step with app.css.
export const PORTRAIT_BOARD = {
  topPadding: 40,
  bottomPadding: 48,
  sidePadding: 32,
  bar: 56,
  gap: 28,
  cardsGap: 16,
  cardRatio: 3 / 3.2,
  // The floor a card keeps in place of the board's own, if any.
  phoneFloor: undefined as number | undefined
} as const;

// A tall-narrow board's sizes, an iPhone's upright: 20-pixel sides, the
// cards 8 apart, and a card never wider than the width lets the grid be
// and never under 56, the boards' floors, kept for the names, set aside;
// a name, too small there, is left to screen readers.
export const NARROW_BOARD = {
  ...PORTRAIT_BOARD,
  topPadding: 24,
  bottomPadding: 32,
  sidePadding: 20,
  gap: 20,
  cardsGap: 8,
  phoneFloor: 56
} as const;

export type BoardSizes = typeof PORTRAIT_BOARD | typeof NARROW_BOARD;

// A board as it is dealt: its rows and columns as landscape stands them,
// and the smallest a card may be.
export type UprightBoard = { rows: number; columns: number; floor: number };

// The board's width is the window less safe-area insets, the screen's
// side padding and any scrollbar reserved by the layout viewport.
export function pairsBoardWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0, sizes: BoardSizes = PORTRAIT_BOARD): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * sizes.sidePadding - scrollbar);
}

// The widest a card may be on a board `width` wide with `rows` rows in
// landscape: upright, those rows stand across it as its columns.
export function pairsBoardCardWidth(width: number, rows: number, sizes: BoardSizes = PORTRAIT_BOARD): number {
  return Math.max(0, width - (rows - 1) * sizes.cardsGap) / rows;
}

// Upright geometry with no vertical safe-area insets: the width, the grid
// on its side, each card's size and whether the screen scrolls. A card
// keeps its 3:3.2 and is as wide as lets the grid fit the width and the
// height under the bar; it is never narrower than the board's floor, or
// in a tall-narrow window than 56, though never wider than the width
// allows: below that the whole screen scrolls.
export function pairsBoardGeometry(board: UprightBoard, windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0, sizes: BoardSizes = PORTRAIT_BOARD) {
  const width = pairsBoardWidth(windowWidth, leftInset, rightInset, scrollbar, sizes);
  const [rows, columns] = [board.columns, board.rows];
  const room = windowHeight - sizes.topPadding - sizes.bottomPadding - sizes.bar - sizes.gap;
  const byHeight = (sizes.cardRatio * (room - (rows - 1) * sizes.cardsGap)) / rows;
  const byWidth = pairsBoardCardWidth(width, board.rows, sizes);
  const card = sizes.phoneFloor === undefined ? Math.max(board.floor, Math.min(byWidth, byHeight)) : Math.min(byWidth, Math.max(sizes.phoneFloor, byHeight));
  return {
    width, rows, columns,
    card: { width: card, height: card / sizes.cardRatio },
    scrolls: byHeight < card
  };
}
