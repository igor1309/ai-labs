import { useLayoutEffect, useRef } from "react";
import { anchoredListScroll, listAnchor, type ListAnchor, type ListRows } from "./listAnchor.ts";

export type LayoutKeeping = {
  keep(keeper: { hold(): () => void; rest(): void }): () => void;
  isRunning(): boolean;
};

// Keeps where the catalogue's vertical list stands through a change of its
// columns or card height. The returning card takes precedence until the
// catalogue has settled, so the shared picture has a whole card to shrink
// into even when a turn starts during the closing transition.
export function useKeptList(keeping: LayoutKeeping, columns: number, returning?: number) {
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<ListAnchor>(0);
  const laidOut = useRef<ListRows>({ columns, row: 0, gap: 0 });
  const restored = useRef<number>(undefined);
  const returningNow = useRef<number>(returning);

  returningNow.current = returning;

  const rowsIn = (element: HTMLElement): ListRows => {
    const card = element.firstElementChild;
    const row = card instanceof HTMLElement ? card.getBoundingClientRect().height : 0;
    const gap = Number.parseFloat(getComputedStyle(element).rowGap) || 0;
    return { columns, row, gap };
  };

  // Set before the parent starts its layout change, after the new cards have
  // been laid out, so the inverse uses the rows the browser will show.
  useLayoutEffect(() => {
    const element = list.current;
    if (element) laidOut.current = rowsIn(element);
  });

  const standing = (element: HTMLElement) =>
    listAnchor(
      { scroll: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight },
      laidOut.current,
      returningNow.current
    );

  useLayoutEffect(
    () =>
      keeping.keep({
        hold: () => {
          const kept = anchor.current;
          return () => {
            const element = list.current;
            if (!element) return;
            element.scrollTop = anchoredListScroll(
              kept,
              { height: element.clientHeight, scrollHeight: element.scrollHeight },
              laidOut.current
            );
            restored.current = element.scrollTop;
          };
        },
        rest: () => {
          const element = list.current;
          if (element) anchor.current = standing(element);
        }
      }),
    [keeping]
  );

  const onScroll = () => {
    const element = list.current;
    if (!element || keeping.isRunning() || element.scrollTop === restored.current) return;
    restored.current = undefined;
    anchor.current = standing(element);
  };

  return { ref: list, onScroll };
}
