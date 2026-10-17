// The sorting game's API: its use cases and the types the app speaks with
// it. Everything else under sorting/ is reached only through this file.
import { BASKETS, generateBoard, type Basket, type Dinosaur, type Property, type Random } from "./board.ts";
import { isFinished, startSorting, type Sorting } from "./play.ts";

export type { Basket, Diet, Dinosaur, Property, Random } from "./board.ts";
export type { Sorting };
export { drop, score } from "./play.ts";

// One card of the board, where it is now.
export type CardState = {
  dinosaur: Dinosaur;
  // The basket the dinosaur belongs in.
  basket: Basket;
  landed: boolean;
  // A drop on the wrong basket has missed with this card.
  missed: boolean;
};

export type BoardState = {
  property: Property;
  baskets: readonly [Basket, Basket];
  // Every card, in its place on the tray, landed or not.
  cards: CardState[];
  // The landed cards, in the order they landed.
  landed: CardState[];
  // The right basket of the last wrong drop, and how many wrong drops
  // there have been, so each one tells from the one before; undefined
  // before the first.
  lastMiss: { basket: Basket; misses: number } | undefined;
  finished: boolean;
};

// A new board sorting by any property but that of `previous`, so two
// boards in a row never sort by the same one.
export function startBoard(dinosaurs: readonly Dinosaur[], random: Random, previous?: Sorting): Sorting {
  return startSorting(generateBoard(dinosaurs, random, previous?.board.property));
}

export function boardState(sorting: Sorting): BoardState {
  const { board, landed, misses } = sorting;
  const cards = board.cards.map(({ dinosaur, basket }) => ({
    dinosaur,
    basket,
    landed: landed.includes(dinosaur.id),
    missed: misses.includes(dinosaur.id)
  }));
  const cardOf = (id: string | undefined) => cards.find(({ dinosaur }) => dinosaur.id === id);
  const missed = cardOf(misses.at(-1));
  return {
    property: board.property,
    baskets: BASKETS[board.property],
    cards,
    landed: landed.flatMap((id) => cardOf(id) ?? []),
    lastMiss: missed && { basket: missed.basket, misses: misses.length },
    finished: isFinished(sorting)
  };
}
