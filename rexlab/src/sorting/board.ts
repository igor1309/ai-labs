import type { Language } from "../language/language.ts";

// What a board sorts by.
export type Property = "legs" | "diet" | "size" | "horns" | "feathers";

export const PROPERTIES: readonly Property[] = ["legs", "diet", "size", "horns", "feathers"];

export type Basket = "two-legs" | "four-legs" | "plants" | "meat" | "big" | "small" | "horns" | "no-horns" | "feathers" | "no-feathers";

// The two baskets of each property, in the order the board shows them.
export const BASKETS: Record<Property, readonly [Basket, Basket]> = {
  legs: ["two-legs", "four-legs"],
  diet: ["plants", "meat"],
  size: ["big", "small"],
  horns: ["horns", "no-horns"],
  feathers: ["feathers", "no-feathers"]
};

// What a dinosaur ate: meat, plants, or both.
export type Diet = "meat" | "plants" | "both";

// A dinosaur as the sorting game knows it: the facts it sorts by, each
// null where the sources give no clear answer.
export type Dinosaur = {
  id: string;
  name: Record<Language, string>;
  legs: 2 | 4 | null;
  diet: Diet;
  size: "big" | "small" | null;
  horns: boolean | null;
  feathers: boolean | null;
};

export type Card = {
  dinosaur: Dinosaur;
  // The basket the dinosaur belongs in.
  basket: Basket;
};

export type Board = {
  property: Property;
  // The cards in their places on the tray.
  cards: readonly Card[];
};

// A number in [0, 1), as Math.random gives.
export type Random = () => number;

export const BOARD_SIZE = 6;

// Each basket gets at least this many cards, so neither is a giveaway.
export const LEAST_PER_BASKET = 2;

// The basket a dinosaur belongs in when sorting by `property`, or null
// when the facts give no clear answer: a dinosaur that ate both plants and
// meat belongs in neither diet basket.
export function basketOf(dinosaur: Dinosaur, property: Property): Basket | null {
  switch (property) {
    case "legs":
      return dinosaur.legs === null ? null : dinosaur.legs === 2 ? "two-legs" : "four-legs";
    case "diet":
      return dinosaur.diet === "both" ? null : dinosaur.diet;
    case "size":
      return dinosaur.size;
    case "horns":
      return dinosaur.horns === null ? null : dinosaur.horns ? "horns" : "no-horns";
    case "feathers":
      return dinosaur.feathers === null ? null : dinosaur.feathers ? "feathers" : "no-feathers";
  }
}

// A board of six different dinosaurs, each with a clear basket, at least
// two in each basket. It sorts by any property but `previous`, so two
// boards in a row never sort by the same one.
export function generateBoard(dinosaurs: readonly Dinosaur[], random: Random, previous?: Property): Board {
  const property = pick(random, PROPERTIES.filter((each) => each !== previous));
  const [first, second] = BASKETS[property];
  const belonging = (basket: Basket) => dinosaurs.filter((dinosaur) => basketOf(dinosaur, property) === basket);
  const [firsts, seconds] = [belonging(first), belonging(second)];
  // How many cards the first basket gets: from two to four, as the list
  // allows.
  const counts = Array.from({ length: BOARD_SIZE - 2 * LEAST_PER_BASKET + 1 }, (_, at) => LEAST_PER_BASKET + at).filter(
    (count) => count <= firsts.length && BOARD_SIZE - count <= seconds.length
  );
  if (counts.length === 0) {
    throw new Error(`The dinosaur list cannot fill a board sorting by ${property}`);
  }
  const count = pick(random, counts);
  const cards = [
    ...sample(random, firsts, count).map((dinosaur) => ({ dinosaur, basket: first })),
    ...sample(random, seconds, BOARD_SIZE - count).map((dinosaur) => ({ dinosaur, basket: second }))
  ];
  return { property, cards: sample(random, cards, cards.length) };
}

// `count` different items of `items`, in a random order.
function sample<T>(random: Random, items: readonly T[], count: number): T[] {
  const left = [...items];
  const taken: T[] = [];
  while (taken.length < count) {
    const at = Math.min(left.length - 1, Math.floor(random() * left.length));
    const [item] = left.splice(at, 1);
    if (item === undefined) throw new Error("Cannot take more items than there are");
    taken.push(item);
  }
  return taken;
}

function pick<T>(random: Random, items: readonly T[]): T {
  const [item] = sample(random, items, 1);
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}
