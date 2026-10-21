// The size classes of the window, as the viewport tells them.
export type CatalogueSizeClass = "wide" | "wide-short" | "tall" | "tall-narrow";

// The safe-area insets at the window's left and right edges.
export type SideInsets = { left: number; right: number };

// A screen's content, its own padding included, is at most 1440 pixels
// wide and centred, as app.css's --screen-left and --screen-right set it.
const SCREEN_CAP = 1440;
// The list's padding on each side and the gap between its cards, which
// keep their landscape sizes upright.
const LIST_PADDING = 56;
const CARD_GAP = 20;
// The card on a 1024 by 768 landscape iPad, four to a row: an upright
// card is never narrower, so its name is never smaller.
const LEAST_CARD = 213;
const MOST_COLUMNS = 4;

// The cards in a row of the catalogue in a window `windowWidth` wide.
// Landscape keeps four, and so does a tall-narrow window, whose list
// stands under the picture asking to turn. A tall window holds as many,
// up to four, as keep each card at least 213 wide, out of the row the
// window's side insets, or the cap if it is wider, and the list's padding
// leave. Worked out in whole cards rather than from a card's width, so a
// row exactly wide enough, as 1024 is for four, holds them. The window's
// width counts, not the list's, so a scrollbar that takes room narrows
// the cards, never their count.
export function catalogueColumns(windowWidth: number, sizeClass: CatalogueSizeClass, insets: SideInsets): number {
  if (sizeClass !== "tall") return MOST_COLUMNS;
  const beyondCap = windowWidth / 2 - SCREEN_CAP / 2;
  const row = windowWidth - Math.max(insets.left, beyondCap) - Math.max(insets.right, beyondCap) - 2 * LIST_PADDING;
  const whole = Math.floor((row + CARD_GAP) / (LEAST_CARD + CARD_GAP));
  return Math.min(MOST_COLUMNS, Math.max(1, whole));
}
