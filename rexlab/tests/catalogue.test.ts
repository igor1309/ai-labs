import { describe, expect, it } from "vitest";
import { stepFrom } from "../src/catalogue.ts";

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
