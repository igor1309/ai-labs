import { describe, expect, it } from "vitest";
import {
  ATTRIBUTES,
  FAIR_RATIO,
  ROUND_LENGTH,
  fairPairs,
  generateRound,
  pairKey,
  type Dinosaur,
  type Round
} from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS, seededRandom } from "./support.ts";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

const questionKeys = (round: Round) => round.map((q) => `${q.attribute}:${pairKey(q.left, q.right)}`);

function dinosaur(id: string, mass: number, height: number): Dinosaur {
  return { id, name: { en: id, ru: id }, measures: { mass, height } };
}

describe("generateRound", () => {
  it.each(SEEDS)("makes every question of a round a fair pair (seed %i)", (seed) => {
    const round = generateRound(SHIPPED_DINOSAURS, seededRandom(seed));

    expect(round).toHaveLength(ROUND_LENGTH);
    for (const { attribute, left, right } of round) {
      expect(ATTRIBUTES).toContain(attribute);
      expect(left.id).not.toBe(right.id);
      const small = Math.min(left.measures[attribute], right.measures[attribute]);
      const large = Math.max(left.measures[attribute], right.measures[attribute]);
      expect(large).toBeGreaterThanOrEqual(FAIR_RATIO * small);
    }
    const pairs = round.map((q) => pairKey(q.left, q.right));
    expect(new Set(pairs).size).toBe(ROUND_LENGTH);
  });

  it.each(SEEDS)("does not repeat the previous round's questions (seed %i)", (seed) => {
    const random = seededRandom(seed);
    const first = generateRound(SHIPPED_DINOSAURS, random);

    const second = generateRound(SHIPPED_DINOSAURS, random, first);

    const firstPairs = new Set(first.map((q) => pairKey(q.left, q.right)));
    expect(second.filter((q) => firstPairs.has(pairKey(q.left, q.right)))).toEqual([]);
    expect(questionKeys(second)).not.toEqual(questionKeys(first));
  });

  it("asks both attributes across rounds", () => {
    // Rounds are made only until both attributes are asked: making all of
    // them takes longer than a test may.
    const asked = new Set<string>();
    for (const seed of SEEDS) {
      if (asked.size === ATTRIBUTES.length) break;
      for (const { attribute } of generateRound(SHIPPED_DINOSAURS, seededRandom(seed))) asked.add(attribute);
    }

    expect([...asked].sort()).toEqual([...ATTRIBUTES].sort());
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
});

describe("the shipped dinosaur list", () => {
  it.each(ATTRIBUTES)("holds at least 10 different fair pairs for %s", (attribute) => {
    const pairs = fairPairs(SHIPPED_DINOSAURS, attribute).map(([a, b]) => pairKey(a, b));

    expect(new Set(pairs).size).toBeGreaterThanOrEqual(ROUND_LENGTH);
  });

  it("names each dinosaur once, with positive mass and height", () => {
    expect(new Set(SHIPPED_DINOSAURS.map((d) => d.id)).size).toBe(SHIPPED_DINOSAURS.length);
    for (const { measures } of SHIPPED_DINOSAURS) {
      expect(measures.mass).toBeGreaterThan(0);
      expect(measures.height).toBeGreaterThan(0);
    }
  });
});
