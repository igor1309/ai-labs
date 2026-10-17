import { describe, expect, it } from "vitest";
import { FOODS, ofFood, stepFrom, type Diet } from "../src/catalogue.ts";

describe("stepFrom", () => {
  it.each([
    [0, "next", 1],
    [28, "next", 29],
    [29, "next", 0],
    [1, "previous", 0],
    [0, "previous", 29]
  ] as const)("goes from %i to the %s at %i in a list of 30, round from either end", (at, step, to) => {
    expect(stepFrom(at, step, 30)).toBe(to);
  });
});

describe("ofFood", () => {
  const entry = (id: string, diet: Diet) => ({ id, diet });
  const LIST = [entry("rex", "meat"), entry("trike", "plants"), entry("raptor", "meat"), entry("gallimimus", "both"), entry("stego", "plants")];

  it("offers every dinosaur first, then each food type", () => {
    expect(FOODS).toEqual(["all", "meat", "plants", "both"]);
  });

  it.each([
    ["all", ["rex", "trike", "raptor", "gallimimus", "stego"]],
    ["meat", ["rex", "raptor"]],
    ["plants", ["trike", "stego"]],
    ["both", ["gallimimus"]]
  ] as const)("keeps for %s only its dinosaurs, in the list's order", (food, ids) => {
    expect(ofFood(LIST, food).map(({ id }) => id)).toEqual(ids);
  });
});
