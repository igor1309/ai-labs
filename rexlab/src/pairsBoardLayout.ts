// Find the pair's upright board's CSS sizes; the stylesheet contract
// tests keep these in step with app.css.
export const PORTRAIT_BOARD = {
  topPadding: 40,
  bottomPadding: 48,
  sidePadding: 32,
  bar: 56,
  gap: 28,
  cardsGap: 16,
  cardRatio: 3 / 3.2
} as const;

// A board as it is dealt: its rows and columns as landscape stands them,
// and the smallest a card may be.
export type UprightBoard = { rows: number; columns: number; floor: number };

// The board's width is the window less safe-area insets, the screen's
// 32px padding a side and any scrollbar reserved by the layout viewport.
export function pairsBoardWidth(windowWidth: number, leftInset: number, rightInset: number, scrollbar = 0): number {
  return Math.max(0, windowWidth - leftInset - rightInset - 2 * PORTRAIT_BOARD.sidePadding - scrollbar);
}

// The widest a card may be on a board `width` wide with `rows` rows in
// landscape: upright, those rows stand across it as its columns.
export function pairsBoardCardWidth(width: number, rows: number): number {
  return Math.max(0, width - (rows - 1) * PORTRAIT_BOARD.cardsGap) / rows;
}

// Upright geometry with no vertical safe-area insets: the width, the grid
// on its side, each card's size and whether the screen scrolls. A card
// keeps its 3:3.2 and is as wide as lets the grid fit the width and the
// height under the bar; it is never narrower than the board's floor:
// below that the whole screen scrolls.
export function pairsBoardGeometry(board: UprightBoard, windowWidth: number, windowHeight: number, leftInset: number, rightInset: number, scrollbar = 0) {
  const sizes = PORTRAIT_BOARD;
  const width = pairsBoardWidth(windowWidth, leftInset, rightInset, scrollbar);
  const [rows, columns] = [board.columns, board.rows];
  const room = windowHeight - sizes.topPadding - sizes.bottomPadding - sizes.bar - sizes.gap;
  const byHeight = (sizes.cardRatio * (room - (rows - 1) * sizes.cardsGap)) / rows;
  const card = Math.max(board.floor, Math.min(pairsBoardCardWidth(width, board.rows), byHeight));
  return {
    width, rows, columns,
    card: { width: card, height: card / sizes.cardRatio },
    scrolls: byHeight < card
  };
}
