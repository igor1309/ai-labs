// Where a list of cards that scrolls down stands: at its end, or at a
// card, which stands in its top row. Its rows start at the list's own top
// edge, `row` tall and `gap` apart, `columns` cards to a row, so where it
// stands is worked out from their geometry rather than from layout, and is
// kept through a change of how many cards stand in a row and how tall.
export type ListAnchor = "end" | number;

export type ListRows = { columns: number; row: number; gap: number };

// The list as the browser reports it: how far it is scrolled, how tall it
// shows and how tall its rows run.
export type ListScroll = { scroll: number; height: number; scrollHeight: number };

// The list's heights are whole pixels and its scroll may be a fraction of
// one, so a list less than a pixel short of its end stands at it.
const END_SLACK = 1;

// Where the list stands: at the card `returning`, the one the child has
// just come back to from its page, where there is one, since its picture
// shrinks into it and so it must stay whole in view, even where the list
// was at its end; else at its end where it scrolls and is at its end;
// else at the first card of the topmost row showing at least half of
// itself. A list that does not scroll stands at its first card.
export function listAnchor({ scroll, height, scrollHeight }: ListScroll, { columns, row, gap }: ListRows, returning?: number): ListAnchor {
  if (returning !== undefined) return returning;
  const end = scrollHeight - height;
  if (end <= 0) return 0;
  if (scroll >= end - END_SLACK) return "end";
  return Math.max(0, Math.ceil((scroll - row / 2) / (row + gap))) * columns;
}

// How far to scroll the list so it stands at `anchor`: its end, or the
// card's row at the top edge, as far as the list scrolls. A card come
// back to stands in the top row too, so it shows whole wherever a row
// fits the list's height: where the list cannot scroll that far, it is in
// a lower row of the list at its end, which shows whole down to its
// padding.
export function anchoredListScroll(anchor: ListAnchor, { height, scrollHeight }: Omit<ListScroll, "scroll">, { columns, row, gap }: ListRows): number {
  const end = Math.max(0, scrollHeight - height);
  return anchor === "end" ? end : Math.min(Math.floor(anchor / columns) * (row + gap), end);
}
