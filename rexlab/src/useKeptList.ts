import { useLayoutEffect, useRef } from "react";
import { anchoredListScroll, listAnchor, type ListAnchor, type ListRows } from "./listAnchor.ts";

export type LayoutKeeping = {
  keep(keeper: { hold(): () => void; rest(): void }): () => void;
  isRunning(): boolean;
};

// Keeps where the catalogue's vertical list stands through a change of its
// columns (read when the list is put back, as the turn has applied them)
// or card height. Back from a page, the list scrolls the card come
// back to (`returning`, its index in the list) into view, and that card is
// where the list stands until the child scrolls it, so the shared picture
// has a whole card to shrink into even when a turn starts during the
// closing transition; neither a scroll during a turn nor one that only puts
// the list back counts as the child's.
export function useKeptList(keeping: LayoutKeeping, columns: () => number, returning?: number, listKey?: string) {
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<ListAnchor>(0);
  const columnsNow = useRef(columns);
  const restored = useRef<number>(undefined);
  const returnedTo = useRef<number>(undefined);

  columnsNow.current = columns;

  useLayoutEffect(() => {
    anchor.current = 0;
    restored.current = undefined;
    returnedTo.current = undefined;
  }, [listKey]);

  useLayoutEffect(() => {
    returnedTo.current = returning;
    const element = list.current;
    if (returning === undefined || !element) return;
    const card = [...element.children].filter((child) => !child.hasAttribute("data-turn-frame"))[returning];
    card?.scrollIntoView({ block: "nearest" });
    restored.current = element.scrollTop;
  }, [returning]);

  const rowsIn = (element: HTMLElement): ListRows => {
    const card = element.firstElementChild;
    const row = card instanceof HTMLElement ? card.getBoundingClientRect().height : 0;
    const style = getComputedStyle(element);
    const gap = Number.parseFloat(style.rowGap) || Number.parseFloat(style.gap) || 0;
    return { columns: columnsNow.current(), row, gap };
  };

  const standing = (element: HTMLElement) =>
    listAnchor(
      { scroll: element.scrollTop, height: element.clientHeight, scrollHeight: element.scrollHeight },
      rowsIn(element),
      returnedTo.current
    );

  useLayoutEffect(
    () =>
      keeping.keep({
        hold: () => {
          // The card come back to is kept without waiting for a scroll
          // event to have updated the anchor before the turn starts.
          const kept = returnedTo.current ?? anchor.current;
          return () => {
            const element = list.current;
            if (!element) return;
            element.scrollTop = anchoredListScroll(
              kept,
              { height: element.clientHeight, scrollHeight: element.scrollHeight },
              rowsIn(element)
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
    returnedTo.current = undefined;
    anchor.current = standing(element);
  };

  return { ref: list, onScroll };
}
