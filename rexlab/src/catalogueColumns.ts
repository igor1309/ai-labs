// The size classes of the window, as the viewport tells them.
export type CatalogueSizeClass = "wide" | "wide-short" | "tall" | "tall-narrow";

// A screen's content, its own padding included, is at most 1440 pixels
// wide and centred, as app.css's --screen-left and --screen-right set it.
const SCREEN_CAP = 1440;
// The list's padding on each side, 20 in a tall-narrow or wide-short
// window, and the
// gap between its cards, which keeps its landscape size upright.
const LIST_PADDING = 56;
const NARROW_LIST_PADDING = 20;
const CARD_GAP = 20;
// The card on a 1024 by 768 landscape iPad, four to a row: an upright
// card is never narrower, so its name is never smaller.
const LEAST_CARD = 213;
const MOST_COLUMNS = 4;

// The width of the catalogue's row in a window `windowWidth` wide: what
// the window's side insets, or the cap if it is wider, and the list's
// padding, `padding` on each side, leave. The upright chips' row, padded
// as the list is, is as wide.
export function catalogueRow(windowWidth: number, leftInset: number, rightInset: number, padding = LIST_PADDING): number {
  const beyondCap = windowWidth / 2 - SCREEN_CAP / 2;
  return windowWidth - Math.max(leftInset, beyondCap) - Math.max(rightInset, beyondCap) - 2 * padding;
}

// The cards in a row of the catalogue in a window `windowWidth` wide.
// Landscape keeps four. A tall window holds as many, up to four, as keep
// each card at least 213 wide, out of the catalogue's row, and so do a
// tall-narrow and a wide-short one out of their row on 20-pixel sides: a
// phone on its side holds two or three, each card standing whole in the
// height its bar leaves. Worked out in whole cards rather than from a card's width, so a
// row exactly wide enough, as 1024 is for four, holds them. The window's
// width counts, not the list's, so a scrollbar that takes room narrows
// the cards, never their count.
export function catalogueColumns(windowWidth: number, sizeClass: CatalogueSizeClass, leftInset: number, rightInset: number): number {
  if (sizeClass === "wide") return MOST_COLUMNS;
  const row = catalogueRow(windowWidth, leftInset, rightInset, sizeClass === "tall" ? LIST_PADDING : NARROW_LIST_PADDING);
  const whole = Math.floor((row + CARD_GAP) / (LEAST_CARD + CARD_GAP));
  return Math.min(MOST_COLUMNS, Math.max(1, whole));
}
