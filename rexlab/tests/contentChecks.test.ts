import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import dinosaurs from "../src/data/dinosaurs.json";
import type { Language } from "../src/language/language.ts";
import { TEXTS } from "../src/language/texts.ts";

// The mechanical part of the copy and science checks: what a rule can
// decide without judgement. Whether the Russian reads naturally and whether
// a value matches its source stay with the weekly reviews.

const LANGUAGES: Language[] = ["en", "ru"];

// Texts for parents, which are written in normal case.
const PARENT_TEXTS = [
  "languageMenu", "themeMenu", "themes.system", "themes.light", "themes.dark", "ageLevelMenu",
  "ageLevels.hatchling.age", "ageLevels.explorer.age", "ageLevels.paleontologist.age",
  "homeParentNote", "versionLabel", "portraitLayoutComing", "sourceNote"
];

// A text that is a function is called with sample arguments; a name
// argument gets a word in the language's own script.
const SAMPLE_WORD: Record<Language, string> = { en: "REX", ru: "РЕКС" };

function leaves(value: unknown, language: Language, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    const args = Array.from({ length: value.length }, (_, index) => (path === "otherBone" || path === "levelOffer.question" ? SAMPLE_WORD[language] : index + 2));
    return [[path, String(value(...args))]];
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, language, path ? `${path}.${key}` : key));
  }
  return [];
}

const texts = Object.fromEntries(LANGUAGES.map((language) => [language, new Map(leaves(TEXTS[language], language))])) as Record<Language, Map<string, string>>;
const childTexts = (language: Language) => [...texts[language]].filter(([key]) => !PARENT_TEXTS.includes(key));

const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;

describe("the copy", () => {
  it("has the same keys in English and Russian", () => {
    expect([...texts.ru.keys()].sort()).toEqual([...texts.en.keys()].sort());
  });

  it("has no empty text", () => {
    for (const language of LANGUAGES) {
      expect([...texts[language]].filter(([, text]) => text.trim() === "").map(([key]) => `${language}:${key}`)).toEqual([]);
    }
  });

  it("writes every text for children in capitals", () => {
    for (const language of LANGUAGES) {
      const lower = childTexts(language).filter(([, text]) => text !== text.toLocaleUpperCase(language));
      expect(lower.map(([key, text]) => `${language}:${key}: ${text}`)).toEqual([]);
    }
  });

  it("lists as parents. texts only keys that exist", () => {
    for (const language of LANGUAGES) {
      expect(PARENT_TEXTS.filter((key) => !texts[language].has(key))).toEqual([]);
    }
  });

  it("writes the units as KG, T and M in English and КГ, Т and М in Russian", () => {
    expect(TEXTS.en.units).toMatchObject({ kilograms: "KG", tonnes: "T", metres: "M" });
    expect(TEXTS.ru.units).toMatchObject({ kilograms: "КГ", tonnes: "Т", metres: "М" });
  });

  it("has no Cyrillic in English and no Latin in Russian texts for children", () => {
    expect([...texts.en].filter(([, text]) => CYRILLIC.test(text)).map(([key]) => key)).toEqual([]);
    expect(childTexts("ru").filter(([, text]) => LATIN.test(text)).map(([key]) => key)).toEqual([]);
  });

  it("names and describes every dinosaur in both languages, each in its own script", () => {
    const wrong = dinosaurs.flatMap(({ id, name, description }) => [
      !name.en.trim() || CYRILLIC.test(name.en) ? `${id}: en name` : "",
      !name.ru.trim() || LATIN.test(name.ru) ? `${id}: ru name` : "",
      !description.en.trim() || CYRILLIC.test(description.en) || description.en !== description.en.toLocaleUpperCase("en") ? `${id}: en description` : "",
      !description.ru.trim() || LATIN.test(description.ru) || description.ru !== description.ru.toLocaleUpperCase("ru") ? `${id}: ru description` : ""
    ]).filter(Boolean);
    expect(wrong).toEqual([]);
  });

  it("gives every dinosaur a name of its own in each language", () => {
    for (const language of LANGUAGES) {
      const names = dinosaurs.map(({ name }) => name[language].toLocaleLowerCase(language));
      expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    }
  });
});

// Plausible ranges, wide enough for every animal the app may add and
// narrow enough to catch a unit slip (tonnes for kilograms, centimetres
// for metres).
const RANGES = {
  heightMeters: [0.05, 8],
  lengthMeters: [0.2, 45],
  wingspanMeters: [0.2, 15],
  massKg: [0.05, 100_000]
} as const;

// Which size measures each group has: a flying reptile is measured by its
// wingspan, a sea reptile by its length, and neither has a hip height.
const MEASURES: Record<string, { required: string[]; forbidden: string[] }> = {
  dinosaur: { required: ["heightMeters", "lengthMeters", "massKg"], forbidden: ["wingspanMeters"] },
  "flying-reptile": { required: ["wingspanMeters", "massKg"], forbidden: ["heightMeters"] },
  "sea-reptile": { required: ["lengthMeters", "massKg"], forbidden: ["heightMeters", "wingspanMeters"] }
};

describe("the science", () => {
  it("gives every animal a unique lower-case id, a known group, a diet and the measures of its group", () => {
    const ids = dinosaurs.map(({ id }) => id);
    expect(ids.filter((id) => !/^[a-z][a-z0-9-]*$/.test(id))).toEqual([]);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    const wrong = dinosaurs.flatMap(({ id, group, diet, attributes }) => {
      const measures = MEASURES[group];
      if (!measures) return [`${id}: group ${group}`];
      const present = Object.keys(attributes);
      return [
        ...measures.required.filter((key) => !present.includes(key)).map((key) => `${id}: no ${key}`),
        ...measures.forbidden.filter((key) => present.includes(key)).map((key) => `${id}: has ${key}`),
        ...(["meat", "plants", "both"].includes(diet) ? [] : [`${id}: diet ${diet}`])
      ];
    });
    expect(wrong).toEqual([]);
  });

  it("keeps every measure a finite number in its plausible range", () => {
    const wrong = dinosaurs.flatMap(({ id, attributes }) =>
      Object.entries(attributes).flatMap(([key, value]) => {
        const range = RANGES[key as keyof typeof RANGES];
        if (!range) return [`${id}: unknown ${key}`];
        return typeof value === "number" && Number.isFinite(value) && value >= range[0] && value <= range[1] ? [] : [`${id}: ${key} ${value}`];
      })
    );
    expect(wrong).toEqual([]);
  });

  it("keeps a dinosaur's hip height below its length", () => {
    const wrong = dinosaurs.filter(({ attributes }) => "heightMeters" in attributes && "lengthMeters" in attributes && attributes.heightMeters! >= attributes.lengthMeters!);
    expect(wrong.map(({ id }) => id)).toEqual([]);
  });

  it("keeps hip heights to two figures", () => {
    const wrong = dinosaurs.filter(({ attributes }) => "heightMeters" in attributes && Number(attributes.heightMeters!.toPrecision(2)) !== attributes.heightMeters);
    expect(wrong.map(({ id }) => id)).toEqual([]);
  });

  it("has a source entry in docs/sources.md for every animal", () => {
    const sources = readFileSync(join(import.meta.dirname, "../docs/sources.md"), "utf8");
    expect(dinosaurs.map(({ id }) => id).filter((id) => !sources.includes(`\`${id}\``))).toEqual([]);
  });
});
