import type { Language } from "../language/language.ts";

// What a visitor asks for, in the order every visit asks.
export type Need = "hungry" | "thirsty" | "dirty" | "tired";

export const NEEDS: readonly Need[] = ["hungry", "thirsty", "dirty", "tired"];

// What the child can give.
export type Item = "plants" | "meat" | "water" | "bath" | "nest";

export const ITEMS: readonly Item[] = ["plants", "meat", "water", "bath", "nest"];

// What a dinosaur ate, as the shared dinosaur list says.
export type Diet = "meat" | "plants" | "both";

export type Visitor = {
  id: string;
  name: Record<Language, string>;
  diet: Diet;
};

// A random number in [0, 1), as Math.random gives.
export type Random = () => number;

// How a visitor takes an item: happily when it meets the need, gently
// turning it away when it does not.
export type Reaction = "happy" | "refusal";

export type Visit = {
  visitor: Visitor;
  // How many needs are met, in order: the next one asked is NEEDS[met].
  met: number;
  hearts: number;
  // The unsuitable items offered for the need now asked, in the order
  // first offered. Once one is, meeting the need earns one heart, not two.
  refused: readonly Item[];
  // The reaction to the last item given, while it plays, with the hearts
  // it earned. No item is taken meanwhile.
  reacting: { item: Item; reaction: Reaction; earned: number } | null;
};

// The hearts a whole visit can earn: two for each need met at the first
// try.
export const MOST_HEARTS = NEEDS.length * 2;

const FOODS: Record<Diet, readonly Item[]> = { meat: ["meat"], plants: ["plants"], both: ["plants", "meat"] };

// The items that meet `need` for `visitor`: its food follows its diet.
export function suitableItems(visitor: Visitor, need: Need): readonly Item[] {
  switch (need) {
    case "hungry":
      return FOODS[visitor.diet];
    case "thirsty":
      return ["water"];
    case "dirty":
      return ["bath"];
    case "tired":
      return ["nest"];
  }
}

export function startVisit(visitor: Visitor): Visit {
  return { visitor, met: 0, hearts: 0, refused: [], reacting: null };
}

// The need asked now, or undefined once all four are met.
export function currentNeed(visit: Visit): Need | undefined {
  return NEEDS[visit.met];
}

// An item is taken only when a need is asked and no reaction plays, so a
// second tap while the dinosaur eats or turns away gives nothing. A
// suitable item meets the need at once; the next need is asked once the
// reaction has played.
export function give(visit: Visit, item: Item): Visit {
  const need = currentNeed(visit);
  if (visit.reacting !== null || need === undefined) return visit;
  if (!suitableItems(visit.visitor, need).includes(item)) {
    const refused = visit.refused.includes(item) ? visit.refused : [...visit.refused, item];
    return { ...visit, refused, reacting: { item, reaction: "refusal", earned: 0 } };
  }
  const earned = visit.refused.length > 0 ? 1 : 2;
  return { ...visit, met: visit.met + 1, hearts: visit.hearts + earned, refused: [], reacting: { item, reaction: "happy", earned } };
}

// The reaction has played: items are taken again.
export function settle(visit: Visit): Visit {
  return visit.reacting === null ? visit : { ...visit, reacting: null };
}

// Every need is met: the visit is finished, whether or not its last
// reaction still plays.
export function isFinished(visit: Visit): boolean {
  return visit.met === NEEDS.length;
}

// A visitor at random from `visitors`, never the one with the id
// `previous`, so a new visitor is always another dinosaur, unless it is
// the only one that may visit.
export function pickVisitor(visitors: readonly Visitor[], random: Random, previous?: string): Visitor {
  const others = visitors.length > 1 ? visitors.filter(({ id }) => id !== previous) : visitors;
  const visitor = others[Math.min(others.length - 1, Math.floor(random() * others.length))];
  if (visitor === undefined) throw new Error("No dinosaur can visit");
  return visitor;
}
