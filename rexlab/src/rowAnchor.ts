// Where a row of columns that scrolls sideways stands: at its end, or at
// the column standing at its left edge. Its columns start at the row's
// own left edge, `column` wide, or a share of the row's width, and `gap`
// apart, so where it stands is
// worked out from their widths rather than from layout, and is kept
// through a change of their width.
export type RowAnchor = "end" | number;

export type RowColumns = { column: number | ((width: number) => number); gap: number };

const columnIn = (column: RowColumns["column"], width: number) => (typeof column === "number" ? column : column(width));

// The row as the browser reports it: how far it is scrolled, how wide it
// shows and how wide its columns run.
export type RowScroll = { scroll: number; width: number; scrollWidth: number };

// The row's widths are whole pixels and its scroll may be a fraction of
// one, so a row less than a pixel short of its end stands at it.
const END_SLACK = 1;

// Where the row stands: at its end where it scrolls and is at its end,
// else at the leftmost column showing at least half of itself. A row that
// does not scroll stands at its start.
export function rowAnchor({ scroll, width, scrollWidth }: RowScroll, { column, gap }: RowColumns): RowAnchor {
  const end = scrollWidth - width;
  if (end <= 0) return 0;
  if (scroll >= end - END_SLACK) return "end";
  const wide = columnIn(column, width);
  return Math.max(0, Math.ceil((scroll - wide / 2) / (wide + gap)));
}

// How far to scroll the row so it stands at `anchor`: its end, or its
// column at the left edge, as far as the row scrolls.
export function anchoredScroll(anchor: RowAnchor, { width, scrollWidth }: Omit<RowScroll, "scroll">, { column, gap }: RowColumns): number {
  const end = Math.max(0, scrollWidth - width);
  return anchor === "end" ? end : Math.min(anchor * (columnIn(column, width) + gap), end);
}
