import { describe, expect, it } from "vitest";
import records from "../src/data/dinosaurs.json";
import { mysteryChoices, pickMystery } from "../src/skeletons/index.ts";
import { SHIPPED_PALS, SHIPPED_SKELETONS, seededRandom } from "./support.ts";

// skeleton-assembly-mystery.feature

const groupOf = (id: string) => SHIPPED_PALS.find((each) => each.id === id)?.lookAlike;
const kindOf = (id: string) => records.find((each) => each.id === id)?.group;
const SKELETON_GROUPS = SHIPPED_SKELETONS.map(({ id }) => groupOf(id));
const SEEDS = Array.from({ length: 40 }, (_, seed) => seed);

describe("pickMystery", () => {
  it("picks none until a skeleton has its star", () => {
    expect(pickMystery(SHIPPED_SKELETONS, [], () => 0)).toBeUndefined();
  });

  it("picks only skeletons with a star, each of them in turn as the draw grows", () => {
    expect([0, 0.49, 0.5, 0.99].map((draw) => pickMystery(SHIPPED_SKELETONS, ["triceratops", "tyrannosaurus"], () => draw)?.id)).toEqual([
      "tyrannosaurus",
      "tyrannosaurus",
      "triceratops",
      "triceratops"
    ]);
  });
});

describe("mysteryChoices", () => {
  it.each(SHIPPED_SKELETONS.map(({ id }) => id))("guesses %s from three dinosaurs, itself among them, all dinosaurs of the skeletons' groups", (id) => {
    for (const seed of SEEDS) {
      for (const lookAlike of [false, true]) {
        const choices = mysteryChoices(id, SHIPPED_SKELETONS, SHIPPED_PALS, lookAlike, seededRandom(seed));

        expect(choices).toHaveLength(3);
        expect(new Set(choices).size).toBe(3);
        expect(choices).toContain(id);
        expect(choices.map(kindOf)).toEqual(["dinosaur", "dinosaur", "dinosaur"]);
        expect(choices.every((each) => SKELETON_GROUPS.includes(groupOf(each)))).toBe(true);
      }
    }
  });

  it("gives one of the mystery's look-alikes and one dinosaur unlike it when asked for a look-alike", () => {
    for (const seed of SEEDS) {
      const others = mysteryChoices("triceratops", SHIPPED_SKELETONS, SHIPPED_PALS, true, seededRandom(seed)).filter((each) => each !== "triceratops");

      expect(others.map(groupOf).filter((group) => group === "horned-face")).toHaveLength(1);
    }
  });

  it.each<[string, string, boolean]>([
    ["Hatchling, which asks for no look-alike", "triceratops", false],
    ["Spinosaurus, which has no look-alike", "spinosaurus", true]
  ])("gives two dinosaurs unlike the mystery, of different groups, for %s", (_, id, lookAlike) => {
    for (const seed of SEEDS) {
      const others = mysteryChoices(id, SHIPPED_SKELETONS, SHIPPED_PALS, lookAlike, seededRandom(seed)).filter((each) => each !== id);
      const groups = others.map(groupOf);

      expect(groups).not.toContain(groupOf(id));
      expect(new Set(groups).size).toBe(2);
    }
  });

  it("puts the mystery anywhere among the three, as the draws fall", () => {
    const places = new Set(SEEDS.map((seed) => mysteryChoices("stegosaurus", SHIPPED_SKELETONS, SHIPPED_PALS, true, seededRandom(seed)).indexOf("stegosaurus")));

    expect([...places].sort()).toEqual([0, 1, 2]);
  });
});
