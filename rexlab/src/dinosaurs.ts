import type { Visitor } from "./care/index.ts";
import { isDiet, type CatalogueEntry } from "./catalogue.ts";
import type { Dinosaur } from "./quiz/index.ts";

// One entry of the shipped dinosaur list, in the content model's format.
export type DinosaurRecord = {
  id: string;
  name: { en: string; ru: string };
  attributes: { massKg: number; heightMeters: number };
  // "meat", "plants" or "both"; read as any string, as the JSON gives it.
  diet: string;
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
