import { describe, expect, it } from "vitest";
import { formatValue } from "../src/formatValue.ts";
import { ATTRIBUTES, type Attribute } from "../src/quiz/round.ts";
import { SHIPPED_DINOSAURS } from "./support.ts";

describe("formatValue", () => {
  it.each<[Attribute, number, string]>([
    ["mass", 15, "15 kg"],
    ["mass", 14.6, "15 kg"],
    ["mass", 999, "999 kg"],
    ["mass", 999.6, "1 t"],
    ["mass", 1000, "1 t"],
    ["mass", 6543, "6.5 t"],
    ["mass", 6500, "6.5 t"],
    ["mass", 7000, "7 t"],
    ["height", 3, "3 m"],
    ["height", 0.5, "0.5 m"],
    ["height", 12.26, "12.3 m"]
  ])("writes a %s of %s as %s", (attribute, value, text) => {
    expect(formatValue(attribute, value)).toBe(text);
  });

  it.each(ATTRIBUTES)("writes every shipped %s as a plain number and its unit", (attribute) => {
    const unit = attribute === "height" ? "m" : "(kg|t)";
    for (const { measures } of SHIPPED_DINOSAURS) {
      expect(formatValue(attribute, measures[attribute])).toMatch(new RegExp(`^(?:[1-9]\\d*(?:\\.[1-9])?|0\\.[1-9]) ${unit}$`));
    }
  });
});
