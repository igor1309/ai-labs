import { describe, expect, it } from "vitest";
import records from "../src/data/dinosaurs.json";
import { DIETS } from "../src/catalogue.ts";
import { readCatalogue, readDinosaurs, readVisitors, type DinosaurRecord } from "../src/dinosaurs.ts";
import { SHIPPED_CATALOGUE, SHIPPED_DINOSAURS } from "./support.ts";

const STEGOSAURUS: DinosaurRecord = {
  id: "stegosaurus",
  name: { en: "Stegosaurus", ru: "Стегозавр" },
  attributes: { massKg: 5000, heightMeters: 4 },
  diet: "plants",
  description: { en: "PLATES ON ITS BACK.", ru: "ПЛАСТИНЫ НА СПИНЕ." }
};

describe("readDinosaurs", () => {
  it("reads each record's id, English and Russian names, mass and height", () => {
    const dinosaurs = readDinosaurs([
      { id: "stegosaurus", name: { en: "Stegosaurus", ru: "Стегозавр" }, attributes: { massKg: 5000, heightMeters: 4 } },
      { id: "compsognathus", name: { en: "Compsognathus", ru: "Компсогнат" }, attributes: { massKg: 3, heightMeters: 0.3 } }
    ]);

    expect(dinosaurs).toEqual([
      { id: "stegosaurus", name: { en: "Stegosaurus", ru: "Стегозавр" }, measures: { mass: 5000, height: 4 } },
      { id: "compsognathus", name: { en: "Compsognathus", ru: "Компсогнат" }, measures: { mass: 3, height: 0.3 } }
    ]);
  });
});

describe("readVisitors", () => {
  it("reads each record's id, names and food type", () => {
    expect(readVisitors([STEGOSAURUS])).toEqual([{ id: "stegosaurus", name: { en: "Stegosaurus", ru: "Стегозавр" }, diet: "plants" }]);
  });

  it.each([undefined, "", "fish", "Meat"])("fails on a record whose food type is %j", (diet) => {
    const record = { ...STEGOSAURUS, diet } as DinosaurRecord;

    expect(() => readVisitors([record])).toThrow(`stegosaurus has no known food type: ${JSON.stringify(diet)}`);
  });
});

describe("readCatalogue", () => {
  it("reads each record's id, names, food type, descriptions, height and mass", () => {
    expect(readCatalogue([STEGOSAURUS])).toEqual([
      {
        id: "stegosaurus",
        name: { en: "Stegosaurus", ru: "Стегозавр" },
        diet: "plants",
        description: { en: "PLATES ON ITS BACK.", ru: "ПЛАСТИНЫ НА СПИНЕ." },
        height: 4,
        mass: 5000
      }
    ]);
  });

  it.each([undefined, "", "fish", "Meat"])("fails on a record whose food type is %j", (diet) => {
    const record = { ...STEGOSAURUS, diet } as DinosaurRecord;

    expect(() => readCatalogue([record])).toThrow(`stegosaurus has no known food type: ${JSON.stringify(diet)}`);
  });

  it.each([
    [{ en: "PLATES ON ITS BACK." }, "ru"],
    [{ en: " ", ru: "ПЛАСТИНЫ НА СПИНЕ." }, "en"],
    [{}, "en, ru"],
    [undefined, "en, ru"]
  ])("fails on a record whose description is %j", (description, missing) => {
    const record = { ...STEGOSAURUS, description } as DinosaurRecord;

    expect(() => readCatalogue([record])).toThrow(`stegosaurus has no description in ${missing}`);
  });
});

describe("the shipped dinosaur list", () => {
  it("gives every dinosaur a food type of meat, plants or both", () => {
    expect(records.filter(({ diet }) => !DIETS.includes(diet as never)).map(({ id }) => id)).toEqual([]);
    expect(SHIPPED_CATALOGUE.map(({ id }) => id)).toEqual(SHIPPED_DINOSAURS.map(({ id }) => id));
  });

  // Descriptions are for children, so in capitals, each in its own script.
  it.each([
    ["en", /^[^a-zа-яёА-ЯЁ]*[A-Z][^a-zа-яёА-ЯЁ]*$/],
    ["ru", /^[^a-zA-Zа-яё]*[А-ЯЁ][^a-zA-Zа-яё]*$/]
  ] as const)("describes every dinosaur in %s, in capitals", (language, text) => {
    for (const { id, description } of records) {
      expect({ id, description: description[language] }).toEqual({ id, description: expect.stringMatching(text) });
    }
  });

  // Names are stored as words and shown in capitals, so each is written
  // like the English ones: a capital, then lower case, in its own script.
  it.each([
    ["en", /^[A-Z][a-z]+$/],
    ["ru", /^[А-ЯЁ][а-яё]+$/]
  ] as const)("names every dinosaur in %s, each name different", (language, word) => {
    const names = SHIPPED_DINOSAURS.map(({ name }) => name[language]);

    for (const name of names) {
      expect(name).toMatch(word);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
