import { describe, expect, it } from "vitest";
import { formatHeight, formatMass } from "../src/formatValue.ts";
import type { Language } from "../src/language/language.ts";
import { SHIPPED_DINOSAURS } from "./support.ts";

describe("formatMass", () => {
  it.each<[number, string]>([
    [15, "15 KG"],
    [14.6, "15 KG"],
    [999, "999 KG"],
    [999.6, "1 T"],
    [1000, "1 T"],
    [6543, "6.5 T"],
    [6500, "6.5 T"],
    [7000, "7 T"]
  ])("writes a mass of %s as %s", (kilograms, text) => {
    expect(formatMass(kilograms, "en")).toBe(text);
  });
});

describe("formatHeight", () => {
  it.each<[number, string]>([
    [3, "3 M"],
    [0.5, "0.5 M"],
    [12.26, "12.3 M"]
  ])("writes a height of %s as %s", (metres, text) => {
    expect(formatHeight(metres, "en")).toBe(text);
  });
});

describe("values in the chosen language", () => {
  // The examples of "Values are written in the chosen language" in
  // docs/features/language.feature.
  it.each<[Language, "mass" | "height", number, string]>([
    ["en", "mass", 15, "15 KG"],
    ["ru", "mass", 15, "15 КГ"],
    ["ru", "mass", 1000, "1 Т"],
    ["en", "mass", 6500, "6.5 T"],
    ["ru", "mass", 6500, "6,5 Т"],
    ["en", "height", 3, "3 M"],
    ["ru", "height", 3, "3 М"]
  ])("writes in %s a %s of %s as %s", (language, measure, value, text) => {
    expect((measure === "mass" ? formatMass : formatHeight)(value, language)).toBe(text);
  });

  const formats: Record<Language, { point: string; mass: string; height: string }> = {
    en: { point: "\\.", mass: "(KG|T)", height: "M" },
    ru: { point: ",", mass: "(КГ|Т)", height: "М" }
  };

  it.each(["en", "ru"] as const)("writes every shipped mass and height in %s as a plain number and its unit", (language) => {
    const { point, mass, height } = formats[language];
    const plain = (unit: string) => new RegExp(`^(?:[1-9]\\d*(?:${point}[1-9])?|0${point}[1-9]) ${unit}$`);
    for (const { measures } of SHIPPED_DINOSAURS) {
      expect(formatMass(measures.mass, language)).toMatch(plain(mass));
      expect(formatHeight(measures.height, language)).toMatch(plain(height));
    }
  });
});
