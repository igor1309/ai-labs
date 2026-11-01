import { describe, expect, it } from "vitest";
import { AGE_LEVELS } from "../src/ageLevel.ts";
import {
  ATTRIBUTES,
  attributeOf,
  FAIR_RATIO,
  correctOf,
  ROUND_LENGTH,
  fairPairs,
  generateRound,
  isFair,
  measureOf,
  pairKey,
  questionKindsForLevel,
  type Dinosaur,
  type Round
} from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS, seededRandom } from "./support.ts";
import records from "../src/data/dinosaurs.json";

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);

const questionKeys = (round: Round) => round.map((q) => `${q.attribute}:${pairKey(q.left, q.right)}`);

function dinosaur(id: string, mass: number, height: number, length?: number): Dinosaur {
  return { id, name: { en: id, ru: id }, measures: { mass, height, ...(length === undefined ? {} : { length }) } };
}

describe("generateRound", () => {
  it.each(AGE_LEVELS)("asks %s ten different fair pairs, each of a kind the level asks", (level) => {
    for (const seed of SEEDS) {
      const round = generateRound(SHIPPED_DINOSAURS, seededRandom(seed), [], level);
      const unfit = round.filter(
        ({ kind, attribute, left, right }) => !questionKindsForLevel(level).includes(kind) || attribute !== attributeOf(kind) || !isFair(left, right, attribute)
      );

      expect(unfit).toEqual([]);
      expect(round).toHaveLength(ROUND_LENGTH);
      expect(new Set(round.map((q) => pairKey(q.left, q.right))).size).toBe(ROUND_LENGTH);
    }
  });

  it.each(SEEDS)("does not repeat the previous round's questions (seed %i)", (seed) => {
    const random = seededRandom(seed);
    const first = generateRound(SHIPPED_DINOSAURS, random);

    const second = generateRound(SHIPPED_DINOSAURS, random, first);

    const firstPairs = new Set(first.map((q) => pairKey(q.left, q.right)));
    expect(second.filter((q) => firstPairs.has(pairKey(q.left, q.right)))).toEqual([]);
    expect(questionKeys(second)).not.toEqual(questionKeys(first));
  });

  it("asks every attribute across rounds", () => {
    // Rounds are made only until every attribute is asked.
    const asked = new Set<string>();
    for (const seed of SEEDS) {
      if (asked.size === ATTRIBUTES.length) break;
      for (const { attribute } of generateRound(SHIPPED_DINOSAURS, seededRandom(seed), [], "paleontologist")) asked.add(attribute);
    }

    expect([...asked].sort()).toEqual([...ATTRIBUTES].sort());
  });

  it("lets Paleontologist rounds mix all five question kinds", () => {
    const asked = new Set<string>();
    for (const seed of SEEDS) {
      for (const question of generateRound(SHIPPED_DINOSAURS, seededRandom(seed), [], "paleontologist")) {
        asked.add(question.kind);
      }
      if (asked.size === 5) break;
    }

    expect([...asked].sort()).toEqual(["heavier", "lighter", "longer", "shorter", "taller"]);
    expect(questionKindsForLevel("paleontologist")).toEqual(["heavier", "taller", "lighter", "shorter", "longer"]);
  });

  it("lets Explorer rounds mix longer with today's two kinds", () => {
    const asked = new Set<string>();
    for (const seed of SEEDS) {
      for (const question of generateRound(SHIPPED_DINOSAURS, seededRandom(seed), [], "explorer")) asked.add(question.kind);
      if (asked.size === 3) break;
    }

    expect([...asked].sort()).toEqual(["heavier", "longer", "taller"]);
    expect(questionKindsForLevel("explorer")).toEqual(["heavier", "taller", "longer"]);
  });

  it("keeps Hatchling rounds to today's two kinds", () => {
    const level = "hatchling" as const;
    const kinds = new Set(generateRound(SHIPPED_DINOSAURS, seededRandom(1), [], level).map((question) => question.kind));

    expect(kinds).not.toContain("lighter");
    expect(kinds).not.toContain("shorter");
    expect(kinds).not.toContain("longer");
    expect([...kinds].sort()).toEqual(["heavier", "taller"]);
  });

  it("reuses a previous pair only when no other fair pair is left", () => {
    // Five dinosaurs each twice the one before: all ten pairs are fair, and
    // a round needs every one of them.
    const doubling = [1, 2, 4, 8, 16].map((size) => dinosaur(`d${size}`, size, size));
    const first = generateRound(doubling, seededRandom(1));

    const second = generateRound(doubling, seededRandom(2), first);

    expect(new Set(second.map((q) => pairKey(q.left, q.right))).size).toBe(ROUND_LENGTH);
  });

  it("fails on a list that cannot fill a round", () => {
    const four = [1, 2, 4, 8].map((size) => dinosaur(`d${size}`, size, size));

    expect(() => generateRound(four, seededRandom(1))).toThrow("The dinosaur list holds fewer than 10 fair pairs");
  });
});

describe("fairPairs", () => {
  it("holds a pair only when the larger value is at least 1.5 times the smaller", () => {
    const small = dinosaur("small", 100, 2);
    const atRatio = dinosaur("at-ratio", 150, 2.9);
    const below = dinosaur("below", 149, 2.95);

    expect(fairPairs([small, atRatio, below], "mass").map(([a, b]) => pairKey(a, b))).toEqual([
      pairKey(small, atRatio)
    ]);
    expect(fairPairs([small, atRatio, below], "height")).toEqual([]);
  });

  it("pairs a creature with no height on its mass alone", () => {
    const tall = dinosaur("tall", 100, 2);
    const flier: Dinosaur = { id: "flier", name: { en: "flier", ru: "flier" }, measures: { mass: 1000 } };

    expect(isFair(tall, flier, "mass")).toBe(true);
    expect(isFair(tall, flier, "height")).toBe(false);
    expect(fairPairs([tall, flier], "height")).toEqual([]);
    expect(() => measureOf(flier, "height")).toThrow("flier has no height");
  });
});

// The smaller of the pair answers LIGHTER and SHORTER, the larger every
// other kind, whichever side each dinosaur stands on.
describe("the right answer", () => {
  const small = dinosaur("small", 100, 2, 4);
  const large = dinosaur("large", 150, 3, 8);
  const cases = (["heavier", "taller", "longer", "lighter", "shorter"] as const).flatMap((kind) =>
    (["small left", "small right"] as const).map((order) => ({ kind, order }))
  );

  it.each(cases)("to $kind, with the $order, is the $kind one", ({ kind, order }) => {
    const [left, right] = order === "small left" ? [small, large] : [large, small];
    const expected = kind === "lighter" || kind === "shorter" ? small : large;

    expect(correctOf({ kind, attribute: attributeOf(kind), left, right })).toBe(expected);
  });
});

describe("lighter questions", () => {
  it("use a fair mass pair and make the smaller mass the right answer", () => {
    const small = dinosaur("small", 100, 2);
    const large = dinosaur("large", 150, 3);
    const question = { kind: "lighter" as const, attribute: "mass" as const, left: large, right: small };

    expect(isFair(small, large, "mass")).toBe(true);
    expect(correctOf(question)).toBe(small);
    expect(measureOf(large, "mass")).toBeGreaterThanOrEqual(FAIR_RATIO * measureOf(small, "mass"));
  });
});

describe("shorter questions", () => {
  it("use a fair height pair and make the smaller hip height the right answer", () => {
    const short = dinosaur("short", 100, 2);
    const tall = dinosaur("tall", 150, 3);
    const question = { kind: "shorter" as const, attribute: "height" as const, left: tall, right: short };

    expect(isFair(short, tall, "height")).toBe(true);
    expect(correctOf(question)).toBe(short);
    expect(measureOf(tall, "height")).toBeGreaterThanOrEqual(FAIR_RATIO * measureOf(short, "height"));
  });
});

describe("longer questions", () => {
  it("use a fair length pair and make the longer creature the right answer", () => {
    const short = dinosaur("short", 100, 2, 4);
    const long = dinosaur("long", 150, 3, 8);
    const question = { kind: "longer" as const, attribute: "length" as const, left: short, right: long };

    expect(isFair(short, long, "length")).toBe(true);
    expect(correctOf(question)).toBe(long);
    expect(measureOf(long, "length")).toBeGreaterThanOrEqual(FAIR_RATIO * measureOf(short, "length"));
  });

  it("pairs only fair lengths, never a flying reptile", () => {
    const pairs = fairPairs(SHIPPED_DINOSAURS, "length");
    const flying = new Set(records.filter(({ group }) => group === "flying-reptile").map(({ id }) => id));

    expect(pairs.length).toBeGreaterThanOrEqual(ROUND_LENGTH);
    expect(pairs.filter(([a, b]) => flying.has(a.id) || flying.has(b.id))).toEqual([]);
    for (const [a, b] of pairs) {
      const [x, y] = [measureOf(a, "length"), measureOf(b, "length")];
      expect(Math.max(x, y)).toBeGreaterThanOrEqual(FAIR_RATIO * Math.min(x, y));
    }
  });
});

describe("the shipped dinosaur list", () => {
  it.each(ATTRIBUTES)("holds at least 10 different fair pairs for %s", (attribute) => {
    const pairs = fairPairs(SHIPPED_DINOSAURS, attribute).map(([a, b]) => pairKey(a, b));

    expect(new Set(pairs).size).toBeGreaterThanOrEqual(ROUND_LENGTH);
  });

  it("names each creature once, with positive mass and a positive height for the dinosaurs alone", () => {
    const tall = SHIPPED_DINOSAURS.filter(({ measures }) => measures.height !== undefined);

    expect(new Set(SHIPPED_DINOSAURS.map((d) => d.id)).size).toBe(SHIPPED_DINOSAURS.length);
    expect(SHIPPED_DINOSAURS.filter(({ measures }) => !(measures.mass > 0))).toEqual([]);
    expect(tall.map(({ id }) => id)).toEqual(records.filter(({ group }) => group === "dinosaur").map(({ id }) => id));
    expect(tall.filter(({ measures }) => !((measures.height ?? 0) > 0))).toEqual([]);
  });
});
