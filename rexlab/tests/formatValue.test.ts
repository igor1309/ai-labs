import { describe, expect, it } from "vitest";
import { formatValue } from "../src/formatValue.ts";
import type { Language } from "../src/language/language.ts";
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
    expect(formatValue(attribute, value, "en")).toBe(text);
  });

  // The examples of "Values are written in the chosen language" in
  // docs/features/language.feature.
  it.each<[Language, Attribute, number, string]>([
    ["en", "mass", 15, "15 kg"],
    ["ru", "mass", 15, "15 кг"],
    ["ru", "mass", 1000, "1 т"],
    ["en", "mass", 6500, "6.5 t"],
    ["ru", "mass", 6500, "6,5 т"],
    ["en", "height", 3, "3 m"],
    ["ru", "height", 3, "3 м"]
  ])("writes in %s a %s of %s as %s", (language, attribute, value, text) => {
    expect(formatValue(attribute, value, language)).toBe(text);
  });

  const formats: Record<Language, { point: string; units: Record<Attribute, string> }> = {
    en: { point: "\\.", units: { mass: "(kg|t)", height: "m" } },
    ru: { point: ",", units: { mass: "(кг|т)", height: "м" } }
  };

  it.each(ATTRIBUTES.flatMap((attribute) => (["en", "ru"] as const).map((language) => [attribute, language] as const)))(
    "writes every shipped %s in %s as a plain number and its unit",
    (attribute, language) => {
      const { point, units } = formats[language];
      const plain = new RegExp(`^(?:[1-9]\\d*(?:${point}[1-9])?|0${point}[1-9]) ${units[attribute]}$`);
      for (const { measures } of SHIPPED_DINOSAURS) {
        expect(formatValue(attribute, measures[attribute], language)).toMatch(plain);
      }
    }
  );
});
