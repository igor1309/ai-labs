import { useLayoutEffect, useRef } from "react";
import { anchoredScroll, rowAnchor, type RowAnchor, type RowColumns } from "./rowAnchor.ts";

// What a screen keeps through a change of its layout: each keeper holds
// what it keeps before every change, puts it back after it, and takes it
// afresh once the page has settled at rest, until its stop is called.
// While a motion runs, nothing the child does counts.
export type LayoutKeeping = {
  keep(keeper: { hold(): () => void; rest(): void }): () => void;
  isRunning(): boolean;
};

// Keeps where a row that scrolls sideways stands, as its scroll events
// report it, through every change of the page's layout or of its
// columns' width. Where it stands is judged from before a motion began:
// neither a scroll during one nor one that only puts the row back moves
// it, and changes that cut one short all put it back from there. Once
// the page settles, it stands where the row was put back, which may be
// at its start where the row no longer scrolls.
// `columns` are the row's columns as the page now lays them out. Gives
// the row's ref and its scroll handler.
export function useKeptRow(keeping: LayoutKeeping, columns: RowColumns) {
  const row = useRef<HTMLDivElement>(null);
  const anchor = useRef<RowAnchor>(0);
  const laidOut = useRef(columns);
  // Where the row was last put back, which says nothing new of where the
  // child left it.
  const restored = useRef<number>(undefined);

  // Set before the page's change of layout runs its keepers, which a
  // parent starts after this page has drawn its new columns.
  useLayoutEffect(() => {
    laidOut.current = columns;
  });

  const standing = (element: HTMLElement) => rowAnchor({ scroll: element.scrollLeft, width: element.clientWidth, scrollWidth: element.scrollWidth }, laidOut.current);

  useLayoutEffect(
    () =>
      keeping.keep({
        hold: () => {
          const kept = anchor.current;
          return () => {
            const element = row.current;
            if (!element) return;
            element.scrollLeft = anchoredScroll(kept, { width: element.clientWidth, scrollWidth: element.scrollWidth }, laidOut.current);
            restored.current = element.scrollLeft;
          };
        },
        rest: () => {
          const element = row.current;
          if (element) anchor.current = standing(element);
        }
      }),
    [keeping]
  );

  const onScroll = () => {
    const element = row.current;
    if (!element || keeping.isRunning() || element.scrollLeft === restored.current) return;
    restored.current = undefined;
    anchor.current = standing(element);
  };

  return { ref: row, onScroll };
}
