// The sorting game's API: its use cases and the types the app speaks with
// it. Everything else under sorting/ is reached only through this file.
import type { AgeLevel } from "../ageLevel.ts";
import { generateBoard, type Basket, type Baskets, type Dinosaur, type Property, type Random } from "./board.ts";
import { isFinished, score, startSorting, type Sorting } from "./play.ts";
import { bestForLevel, finishRound, type BeatBest, type Celebration, type SortingProgress } from "./progress.ts";

export type { Basket, Baskets, Diet, Dinosaur, Property, Random } from "./board.ts";
export type { BeatBest, Celebration, Sorting, SortingProgress };
export type { Beaten } from "./progress.ts";
export { drop, score } from "./play.ts";
export { bestForLevel, NO_SORTING } from "./progress.ts";

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
  baskets: Baskets;
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

export type SortingResult = {
  level: AgeLevel;
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to
  // compare with, so the board is neither celebrated nor saved over it.
  progress: SortingProgress | undefined;
  // The best score before this board, undefined when there was none or it
  // cannot be read.
  previousBest: number | undefined;
  celebration: Celebration | null;
};

// A new board sorting by any property but that of `previous`, so two
// boards in a row never sort by the same one.
export function startBoard(dinosaurs: readonly Dinosaur[], level: AgeLevel, random: Random, previous?: Sorting): Sorting {
  return startSorting(generateBoard(dinosaurs, level, random, previous?.board.property));
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
    baskets: board.baskets,
    cards,
    landed: landed.flatMap((id) => cardOf(id) ?? []),
    lastMiss: missed && { basket: missed.basket, misses: misses.length },
    finished: isFinished(sorting)
  };
}

// The finished board's score, set against the progress kept so far by the
// best-score rule.
export function finishBoard(sorting: Sorting, stored: SortingProgress | undefined, beatBest: BeatBest): SortingResult {
  const right = score(sorting);
  const outcome = stored === undefined ? undefined : finishRound(stored, sorting.board.level, right, beatBest);
  return {
    level: sorting.board.level,
    score: right,
    total: sorting.board.cards.length,
    progress: outcome?.progress,
    previousBest: stored === undefined ? undefined : bestForLevel(stored, sorting.board.level) ?? undefined,
    celebration: outcome?.celebration ?? null
  };
}
