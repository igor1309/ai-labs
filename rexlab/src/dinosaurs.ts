import type { Visitor } from "./care/index.ts";
import { isDiet, type CatalogueEntry } from "./catalogue.ts";
import type { Dinosaur } from "./quiz/index.ts";
import type { Dinosaur as Sortable } from "./sorting/index.ts";

// One entry of the shipped dinosaur list, in the content model's format.
export type DinosaurRecord = {
  id: string;
  name: { en: string; ru: string };
  attributes: { massKg: number; heightMeters: number };
  // "meat", "plants" or "both"; read as any string, as the JSON gives it.
  diet: string;
  // Each null where the sources give no clear answer; read as the JSON
  // gives them.
  traits: { legs: number | null; size: string | null; horns: boolean | null; feathers: boolean | null };
  description: { en: string; ru: string };
};

// The quiz needs only what it compares.
export function readDinosaurs(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name" | "attributes">>): Dinosaur[] {
  return records.map(({ id, name, attributes }) => ({
    id,
    name: { en: name.en, ru: name.ru },
    measures: { mass: attributes.massKg, height: attributes.heightMeters }
  }));
}

// Care needs only who visits and what it eats. A record with no known
// food type fails here, when the app is put together, rather than as a
// visitor no food can feed.
export function readVisitors(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name" | "diet">>): Visitor[] {
  return records.map(({ id, name, diet }) => {
    if (!isDiet(diet)) {
      throw new Error(`${id} has no known food type: ${JSON.stringify(diet)}`);
    }
    return { id, name: { en: name.en, ru: name.ru }, diet };
  });
}

// A record with no food type the catalogue knows, or with no description
// in a language, fails here, when the app is put together, rather than as
// a blank on a dinosaur's page.
export function readCatalogue(records: readonly DinosaurRecord[]): CatalogueEntry[] {
  return records.map(({ id, name, attributes, diet, description }) => {
    if (!isDiet(diet)) {
      throw new Error(`${id} has no known food type: ${JSON.stringify(diet)}`);
    }
    const missing = (["en", "ru"] as const).filter((language) => !description?.[language]?.trim());
    if (missing.length > 0) {
      throw new Error(`${id} has no description in ${missing.join(", ")}`);
    }
    return {
      id,
      name: { en: name.en, ru: name.ru },
      diet,
      description: { en: description.en, ru: description.ru },
      height: attributes.heightMeters,
      mass: attributes.massKg
    };
  });
}

const LEGS = [2, 4, null] as const;
const SIZES = ["big", "small", null] as const;

// The sorting game needs the facts it sorts by. A record whose fact is
// none the game knows fails here, when the app is put together, rather
// than as a card no basket takes.
export function readSortables(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name" | "diet" | "traits">>): Sortable[] {
  return records.map(({ id, name, diet, traits }) => {
    const fail = (fact: string, value: unknown) => new Error(`${id} has no known ${fact}: ${JSON.stringify(value)}`);
    if (!isDiet(diet)) throw fail("food type", diet);
    const { legs, size, horns, feathers } = traits ?? {};
    const knownLegs = LEGS.find((each) => each === legs);
    if (knownLegs === undefined) throw fail("number of legs", legs);
    const knownSize = SIZES.find((each) => each === size);
    if (knownSize === undefined) throw fail("size", size);
    if (!isFact(horns)) throw fail("horns", horns);
    if (!isFact(feathers)) throw fail("feathers", feathers);
    return { id, name: { en: name.en, ru: name.ru }, legs: knownLegs, diet, size: knownSize, horns, feathers };
  });
}

const isFact = (value: unknown): value is boolean | null => value === null || typeof value === "boolean";
