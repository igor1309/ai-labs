import type { Language } from "../language/language.ts";

export type SortingLevel = "hatchling" | "explorer" | "paleontologist";

// What a board sorts by.
export type Property = "legs" | "diet" | "size" | "horns" | "feathers";

export const PROPERTIES: readonly Property[] = ["legs", "diet", "size", "horns", "feathers"];

export type Basket =
  | "two-legs"
  | "four-legs"
  | "plants"
  | "meat"
  | "big"
  | "small"
  | "horns"
  | "no-horns"
  | "feathers"
  | "no-feathers"
  | "both"
  | "two-or-four"
  | "not-known-yet";

// The baskets of a board, in the order it shows them: two, or three where
// a level adds a third.
export type Baskets = readonly [Basket, Basket] | readonly [Basket, Basket, Basket];

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
// null where the dinosaur must stay off that property’s boards.
export type Dinosaur = {
  id: string;
  name: Record<Language, string>;
  legs: 2 | 4 | "either" | null;
  diet: Diet;
  size: "big" | "small" | null;
  horns: boolean | null;
  feathers: boolean | "unknown" | null;
};

export type Card = {
  dinosaur: Dinosaur;
  // The basket the dinosaur belongs in.
  basket: Basket;
};

export type Board = {
  level: SortingLevel;
  property: Property;
  baskets: Baskets;
  // The cards in their places on the tray.
  cards: readonly Card[];
};

// A number in [0, 1), as Math.random gives.
export type Random = () => number;

const BOARD_SIZES: Record<SortingLevel, number> = { hatchling: 6, explorer: 8, paleontologist: 10 };

// Each basket gets at least this many cards, so neither is a giveaway.
export const LEAST_PER_BASKET = 2;

// A fact has a basket only on a level that can explain it. Paleontologist
// asks about fossil evidence for feathers, rather than unfeathered art.
export function basketOf(dinosaur: Dinosaur, property: Property, level: SortingLevel): Basket | null {
  switch (property) {
    case "legs":
      if (dinosaur.legs === null) return null;
      if (dinosaur.legs === "either") return level === "paleontologist" ? "two-or-four" : null;
      return dinosaur.legs === 2 ? "two-legs" : "four-legs";
    case "diet":
      return dinosaur.diet === "both" ? (level === "explorer" ? "both" : null) : dinosaur.diet;
    case "size":
      return dinosaur.size;
    case "horns":
      return dinosaur.horns === null ? null : dinosaur.horns ? "horns" : "no-horns";
    case "feathers":
      if (dinosaur.feathers === null) return null;
      if (dinosaur.feathers === "unknown") return level === "paleontologist" ? "not-known-yet" : null;
      if (level === "paleontologist" && !dinosaur.feathers && dinosaur.diet === "plants") return null;
      return dinosaur.feathers ? "feathers" : "no-feathers";
  }
}

function basketsFor(property: Property, level: SortingLevel): Baskets {
  const pair = BASKETS[property];
  if (level === "explorer" && property === "diet") return [...pair, "both"];
  if (level === "paleontologist") return [...pair, property === "legs" ? "two-or-four" : "not-known-yet"];
  return pair;
}

// Different dinosaurs, at least two per basket, sorting by a property
// other than the last board's even when the level changes.
export function generateBoard(dinosaurs: readonly Dinosaur[], level: SortingLevel, random: Random, previous?: Property): Board {
  const properties: readonly Property[] = level === "paleontologist" ? ["legs", "feathers"] : PROPERTIES;
  const property = pick(random, properties.filter((each) => each !== previous));
  const baskets = basketsFor(property, level);
  const groups = baskets.map((basket) => ({ basket, dinosaurs: dinosaurs.filter((dinosaur) => basketOf(dinosaur, property, level) === basket) }));
  const size = BOARD_SIZES[level];
  // Choose only distributions the list can fill, including a scarce third
  // basket, so randomness cannot make an otherwise fair board impossible.
  const distributions = (at: number, remaining: number): number[][] => {
    if (at === groups.length) return remaining === 0 ? [[]] : [];
    const max = Math.min(groups[at]?.dinosaurs.length ?? 0, remaining - LEAST_PER_BASKET * (groups.length - at - 1));
    return Array.from({ length: Math.max(0, max - LEAST_PER_BASKET + 1) }, (_, i) => i + LEAST_PER_BASKET)
      .flatMap((count) => distributions(at + 1, remaining - count).map((rest) => [count, ...rest]));
  };
  const counts = distributions(0, size);
  if (counts.length === 0) throw new Error(`The dinosaur list cannot fill a board sorting by ${property}`);
  const chosen = pick(random, counts);
  const cards = groups.flatMap(({ basket, dinosaurs }, at) => sample(random, dinosaurs, chosen[at] ?? 0).map((dinosaur) => ({ dinosaur, basket })));
  return { level, property, baskets, cards: sample(random, cards, cards.length) };
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
