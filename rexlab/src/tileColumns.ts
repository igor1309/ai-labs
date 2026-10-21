// The upright home page's row of tiles starts at the page's 56-pixel left
// padding and runs to the window's right edge. A tall window has no side
// safe-area inset (an iPad upright has its insets at the top and bottom),
// so the row is the window's width short of that padding alone.
const ROW_START = 56;
// The columns' width, which the landscape row keeps, and the gap between
// them in either layout, as the stylesheet sets them.
export const TILE_COLUMN = 310;
export const TILE_GAP = 24;
// The least of the next column that shows at the row's edge, and the
// least of it that hides there.
const PEEK = 24;

// The width of each column of tiles, in whole CSS pixels, on the upright
// home page in a window `windowWidth` wide, for a row of `columns`
// columns: 310, narrowed just enough where the next column would show
// under 24 pixels or hide under 24, or, where it would hide under 24 and
// is the last, to show it whole.
export function tileColumnWidth(windowWidth: number, columns: number): number {
  const shown = windowWidth - ROW_START;
  const whole = Math.floor((shown + TILE_GAP) / (TILE_COLUMN + TILE_GAP));
  if (whole >= columns) return TILE_COLUMN;
  const peek = shown - whole * (TILE_COLUMN + TILE_GAP);
  if (peek < PEEK && whole > 0) return Math.floor((shown - PEEK) / whole - TILE_GAP);
  if (peek <= TILE_COLUMN - PEEK) return TILE_COLUMN;
  if (whole + 1 === columns) return Math.floor((shown - (columns - 1) * TILE_GAP) / columns);
  return Math.floor((shown - PEEK) / (whole + 1) - TILE_GAP);
}
