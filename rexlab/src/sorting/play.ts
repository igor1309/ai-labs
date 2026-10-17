import type { Basket, Board } from "./board.ts";

// A board being sorted: the cards in their baskets, in the order they
// landed, and the card of each wrong drop, in order, so a card dropped
// wrong twice is there twice.
export type Sorting = {
  board: Board;
  landed: readonly string[];
  misses: readonly string[];
};

export function startSorting(board: Board): Sorting {
  return { board, landed: [], misses: [] };
}

// Only the card's right basket takes it; a drop on the other one is a
// miss and leaves the card on the tray. A card already in its basket, or
// not on the board, does not move.
export function drop(sorting: Sorting, id: string, basket: Basket): Sorting {
  const card = sorting.board.cards.find(({ dinosaur }) => dinosaur.id === id);
  if (!card || sorting.landed.includes(id)) {
    return sorting;
  }
  if (card.basket === basket) {
    return { ...sorting, landed: [...sorting.landed, id] };
  }
  return { ...sorting, misses: [...sorting.misses, id] };
}

export function isFinished(sorting: Sorting): boolean {
  return sorting.landed.length === sorting.board.cards.length;
}

// A card counts as right only when its first drop on a basket is.
export function score(sorting: Sorting): number {
  return sorting.landed.filter((id) => !sorting.misses.includes(id)).length;
}
