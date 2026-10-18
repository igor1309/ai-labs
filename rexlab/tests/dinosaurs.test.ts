import { describe, expect, it } from "vitest";
import records from "../src/data/dinosaurs.json";
import { DIETS } from "../src/catalogue.ts";
import { LEVELS, TOP_LEVEL } from "../src/pairs/index.ts";
import { readCatalogue, readDinosaurs, readPals, readSortables, readVisitors, type DinosaurRecord } from "../src/dinosaurs.ts";
import type { Dinosaur as Sortable, Property } from "../src/sorting/index.ts";
import { SHIPPED_CATALOGUE, SHIPPED_DINOSAURS, SHIPPED_PALS, SHIPPED_SORTABLES, SHIPPED_VISITORS } from "./support.ts";

const STEGOSAURUS: DinosaurRecord = {
  id: "stegosaurus",
  name: { en: "Stegosaurus", ru: "Стегозавр" },
  attributes: { massKg: 5000, heightMeters: 4 },
  diet: "plants",
  traits: { legs: 4, size: null, horns: null, feathers: false },
  description: { en: "PLATES ON ITS BACK.", ru: "ПЛАСТИНЫ НА СПИНЕ." },
  lookAlike: "plated-back"
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

describe("readSortables", () => {
  const STEGOSAURUS_SORTABLE: Sortable = {
    id: "stegosaurus",
    name: { en: "Stegosaurus", ru: "Стегозавр" },
    legs: 4,
    diet: "plants",
    size: null,
    horns: null,
    feathers: false
  };

  it("reads each record's id, names, food type and the facts the sorting game sorts by", () => {
    expect(readSortables([STEGOSAURUS])).toEqual([STEGOSAURUS_SORTABLE]);
  });

  // Every value each fact may take, null where the sources give no clear
  // answer, and each food type, "both" among them.
  it.each([
    ...(["meat", "plants", "both"] as const).map((diet) => ["diet", { diet }, { diet }] as const),
    ...([2, 4, null] as const).map((legs) => ["legs", { traits: { ...STEGOSAURUS.traits, legs } }, { legs }] as const),
    ...(["big", "small", null] as const).map((size) => ["size", { traits: { ...STEGOSAURUS.traits, size } }, { size }] as const),
    ...([true, false, null] as const).map((horns) => ["horns", { traits: { ...STEGOSAURUS.traits, horns } }, { horns }] as const),
    ...([true, false, null] as const).map((feathers) => ["feathers", { traits: { ...STEGOSAURUS.traits, feathers } }, { feathers }] as const)
  ])("reads %s as the record gives it: %j", (_, change, read) => {
    expect(readSortables([{ ...STEGOSAURUS, ...change }])).toEqual([{ ...STEGOSAURUS_SORTABLE, ...read }]);
  });

  it.each([
    ["food type", { diet: "fish" }, "fish"],
    ["number of legs", { traits: { ...STEGOSAURUS.traits, legs: 3 } }, 3],
    ["number of legs", { traits: { ...STEGOSAURUS.traits, legs: undefined } }, undefined],
    ["size", { traits: { ...STEGOSAURUS.traits, size: "huge" } }, "huge"],
    ["horns", { traits: { ...STEGOSAURUS.traits, horns: "yes" } }, "yes"],
    ["feathers", { traits: { ...STEGOSAURUS.traits, feathers: 0 } }, 0],
    ["number of legs", { traits: undefined }, undefined]
  ])("fails on a record with no known %s: %j", (fact, change, value) => {
    const record = { ...STEGOSAURUS, ...change } as DinosaurRecord;

    expect(() => readSortables([record])).toThrow(`stegosaurus has no known ${fact}: ${JSON.stringify(value)}`);
  });
});

describe("readPals", () => {
  it("reads each record's id, names and look-alike group", () => {
    expect(readPals([STEGOSAURUS])).toEqual([{ id: "stegosaurus", name: { en: "Stegosaurus", ru: "Стегозавр" }, lookAlike: "plated-back" }]);
  });

  it.each([undefined, "", " ", 3])("fails on a record whose look-alike group is %j", (lookAlike) => {
    const record = { ...STEGOSAURUS, lookAlike };

    expect(() => readPals([record])).toThrow(`stegosaurus has no look-alike group: ${JSON.stringify(lookAlike)}`);
  });
});

describe("the shipped dinosaur list", () => {
  // Each property the sorting game sorts by, with each basket's dinosaurs
  // by their facts.
  const BASKETS: Record<Property, [Sortable[], Sortable[]]> = {
    legs: [SHIPPED_SORTABLES.filter(({ legs }) => legs === 2), SHIPPED_SORTABLES.filter(({ legs }) => legs === 4)],
    diet: [SHIPPED_SORTABLES.filter(({ diet }) => diet === "plants"), SHIPPED_SORTABLES.filter(({ diet }) => diet === "meat")],
    size: [SHIPPED_SORTABLES.filter(({ size }) => size === "big"), SHIPPED_SORTABLES.filter(({ size }) => size === "small")],
    horns: [SHIPPED_SORTABLES.filter(({ horns }) => horns === true), SHIPPED_SORTABLES.filter(({ horns }) => horns === false)],
    feathers: [SHIPPED_SORTABLES.filter(({ feathers }) => feathers === true), SHIPPED_SORTABLES.filter(({ feathers }) => feathers === false)]
  };

  it.each(Object.entries(BASKETS))("fills a board sorting by %s: six dinosaurs with a clear value, at least two for each basket", (_, [first, second]) => {
    expect(first.length + second.length).toBeGreaterThanOrEqual(6);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(second.length).toBeGreaterThanOrEqual(2);
  });

  // A child who sees a dinosaur's mass in the catalogue sorts by it, so a
  // BIG one is heavy and a SMALL one light, with no close calls between.
  it("calls BIG only a dinosaur of 3000 kg or more, and SMALL only one of 500 kg or less", () => {
    const mass = (id: string) => SHIPPED_DINOSAURS.find((dinosaur) => dinosaur.id === id)?.measures.mass;
    const [big, small] = BASKETS.size;

    expect(big.filter(({ id }) => !((mass(id) ?? 0) >= 3000)).map(({ id }) => [id, mass(id)])).toEqual([]);
    expect(small.filter(({ id }) => !((mass(id) ?? Infinity) <= 500)).map(({ id }) => [id, mass(id)])).toEqual([]);
  });

  // The sorting game sorts each dinosaur by its own record's facts.
  it("gives every sortable the food type and traits of its own record", () => {
    expect(SHIPPED_SORTABLES).toEqual(
      records.map(({ id, name, diet, traits }) => ({ id, name, diet, legs: traits.legs, size: traits.size, horns: traits.horns, feathers: traits.feathers }))
    );
  });

  it("gives every dinosaur a food type of meat, plants or both", () => {
    expect(records.filter(({ diet }) => !DIETS.includes(diet as never)).map(({ id }) => id)).toEqual([]);
    expect(SHIPPED_CATALOGUE.map(({ id }) => id)).toEqual(SHIPPED_DINOSAURS.map(({ id }) => id));
  });

  // Care feeds each visitor by its diet, so the game teaches what each
  // dinosaur ate: every visitor's diet is its own record's.
  it("gives every visitor the food type of its own record", () => {
    const diets = (list: ReadonlyArray<{ id: string; diet: string }>) => Object.fromEntries(list.map(({ id, diet }) => [id, diet]));

    expect(SHIPPED_VISITORS.map(({ id }) => id)).toEqual(records.map(({ id }) => id));
    expect(diets(SHIPPED_VISITORS)).toEqual(diets(records));
  });

  // A silhouette board deals one dinosaur of each look-alike group, so the
  // biggest board needs that many groups even once the board before it
  // has taken its dinosaurs away.
  it("puts every dinosaur in one look-alike group, enough for two silhouette boards in a row", () => {
    const groups = new Set(SHIPPED_PALS.map(({ lookAlike }) => lookAlike));
    const { pairs } = LEVELS[TOP_LEVEL];

    expect(SHIPPED_PALS.map(({ id }) => id)).toEqual(records.map(({ id }) => id));
    expect(groups.size - pairs).toBeGreaterThanOrEqual(pairs);
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

  // Copy the copy check corrected, written out here so a revert fails.
  it.each([["apatosaurus", "ru", "ОГРОМНЫЙ ДИНОЗАВР С ДЛИННОЙ, ОЧЕНЬ ТОЛСТОЙ И КРЕПКОЙ ШЕЕЙ."]] as const)(
    "keeps the corrected description of %s in %s",
    (id, language, text) => {
      expect(records.find((record) => record.id === id)?.description[language]).toBe(text);
    }
  );

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
