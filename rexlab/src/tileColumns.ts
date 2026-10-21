// The upright home page's row of tiles starts at the page's 56-pixel left
// padding and runs to the window's right edge. A tall window has no side
// safe-area inset (an iPad upright has its insets at the top and bottom),
// so the row is the window's width short of that padding alone.
const ROW_START = 56;
const COLUMN = 310;
const GAP = 24;
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
  const whole = Math.floor((shown + GAP) / (COLUMN + GAP));
  if (whole >= columns) return COLUMN;
  const peek = shown - whole * (COLUMN + GAP);
  if (peek < PEEK && whole > 0) return Math.floor((shown - PEEK) / whole - GAP);
  if (peek <= COLUMN - PEEK) return COLUMN;
  if (whole + 1 === columns) return Math.floor((shown - (columns - 1) * GAP) / columns);
  return Math.floor((shown - PEEK) / (whole + 1) - GAP);
}
