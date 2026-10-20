import type { Language } from "../language/language.ts";

export type Attribute = "mass" | "height";

export const ATTRIBUTES: readonly Attribute[] = ["mass", "height"];

export type Dinosaur = {
  id: string;
  name: Record<Language, string>;
  // Every dinosaur's mass; a height only where it is measured standing.
  measures: { mass: number; height?: number };
};

export type Question = {
  attribute: Attribute;
  left: Dinosaur;
  right: Dinosaur;
};

export type Round = readonly Question[];

// A number in [0, 1), as Math.random gives.
export type Random = () => number;

export const ROUND_LENGTH = 10;

// Dinosaur sizes are estimates: a pair is asked only when the larger value
// is clearly larger, so the answer does not rest on a disputed figure.
export const FAIR_RATIO = 1.5;

// A pair is fair only when both have the measure.
export function isFair(a: Dinosaur, b: Dinosaur, attribute: Attribute): boolean {
  const [x, y] = [a.measures[attribute], b.measures[attribute]];
  if (x === undefined || y === undefined) return false;
  const small = Math.min(x, y);
  const large = Math.max(x, y);
  return a.id !== b.id && small > 0 && large >= FAIR_RATIO * small;
}

// A question asks only of a fair pair, so both of its dinosaurs have the
// measure it compares.
export function measureOf(dinosaur: Dinosaur, attribute: Attribute): number {
  const value = dinosaur.measures[attribute];
  if (value === undefined) throw new Error(`${dinosaur.id} has no ${attribute}`);
  return value;
}

// The question always asks which has more. A fair pair's values are never
// equal, so one dinosaur is always the larger.
export function largerOf({ attribute, left, right }: Question): Dinosaur {
  return measureOf(left, attribute) > measureOf(right, attribute) ? left : right;
}

// Two dinosaurs are the same pair whichever side each is on and whatever
// the question compares.
export function pairKey(a: Dinosaur, b: Dinosaur): string {
  return [a.id, b.id].sort().join("|");
}

export function fairPairs(dinosaurs: readonly Dinosaur[], attribute: Attribute): Array<[Dinosaur, Dinosaur]> {
  const pairs: Array<[Dinosaur, Dinosaur]> = [];
  dinosaurs.forEach((a, i) => {
    for (const b of dinosaurs.slice(i + 1)) {
      if (isFair(a, b, attribute)) {
        pairs.push([a, b]);
      }
    }
  });
  return pairs;
}

// Each question picks its attribute at random and a fair pair not yet in
// this round. Pairs from the previous round are taken only when no other
// pair is left, so two rounds in a row do not ask the same questions.
export function generateRound(dinosaurs: readonly Dinosaur[], random: Random, previous: Round = []): Round {
  const pairsByAttribute = new Map(ATTRIBUTES.map((attribute) => [attribute, fairPairs(dinosaurs, attribute)]));
  const previousPairs = new Set(previous.map((question) => pairKey(question.left, question.right)));
  const used = new Set<string>();
  const round: Question[] = [];

  while (round.length < ROUND_LENGTH) {
    const first = pick(random, ATTRIBUTES);
    const order = [first, ...ATTRIBUTES.filter((attribute) => attribute !== first)];
    const unused = (attribute: Attribute) =>
      (pairsByAttribute.get(attribute) ?? []).filter(([a, b]) => !used.has(pairKey(a, b)));
    const tiers = [
      ...order.map((attribute) => ({
        attribute,
        pairs: unused(attribute).filter(([a, b]) => !previousPairs.has(pairKey(a, b)))
      })),
      ...order.map((attribute) => ({ attribute, pairs: unused(attribute) }))
    ];
    const tier = tiers.find(({ pairs }) => pairs.length > 0);
    if (!tier) {
      throw new Error(`The dinosaur list holds fewer than ${ROUND_LENGTH} fair pairs`);
    }
    const [a, b] = pick(random, tier.pairs);
    used.add(pairKey(a, b));
    const [left, right] = random() < 0.5 ? [a, b] : [b, a];
    round.push({ attribute: tier.attribute, left, right });
  }
  return round;
}

function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list");
  }
  return item;
}
