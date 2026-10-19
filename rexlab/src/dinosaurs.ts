import type { Visitor } from "./care/index.ts";
import { isDiet, type CatalogueEntry } from "./catalogue.ts";
import { LANGUAGES, type Language } from "./language/language.ts";
import type { Pal } from "./pairs/index.ts";
import type { Dinosaur } from "./quiz/index.ts";
import type { Place, Skeleton } from "./skeletons/index.ts";
import type { Dinosaur as Sortable } from "./sorting/index.ts";

// One entry of the shipped dinosaur list, in the content model's format.
export type DinosaurRecord = {
  id: string;
  name: { en: string; ru: string };
  attributes: { massKg: number; heightMeters: number };
  // "meat", "plants" or "both"; read as any string, as the JSON gives it.
  diet: string;
  // Explicit uncertain values distinguish a third basket from a fact
  // left off every board (null); read as the JSON gives them.
  traits: { legs: number | string | null; size: string | null; horns: boolean | null; feathers: boolean | string | null };
  description: { en: string; ru: string };
  // The group of dinosaurs whose silhouettes look alike, such as
  // "duck-bill"; read as any value, as the JSON gives it.
  lookAlike: unknown;
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

const LEGS = [2, 4, "either", null] as const;
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
    if (feathers !== "unknown" && !isFact(feathers)) throw fail("feathers", feathers);
    return { id, name: { en: name.en, ru: name.ru }, legs: knownLegs, diet, size: knownSize, horns, feathers };
  });
}

const isFact = (value: unknown): value is boolean | null => value === null || typeof value === "boolean";

// Find the pair needs who is dealt and whose silhouettes look alike. A
// record with no look-alike group fails here, when the app is put
// together, rather than as two silhouettes no child can tell apart.
export function readPals(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name" | "lookAlike">>): Pal[] {
  return records.map(({ id, name, lookAlike }) => {
    if (typeof lookAlike !== "string" || !lookAlike.trim()) {
      throw new Error(`${id} has no look-alike group: ${JSON.stringify(lookAlike)}`);
    }
    return { id, name: { en: name.en, ru: name.ru }, lookAlike };
  });
}

// The skeletons' file, `skeletons.json`, in its own format: the frame the
// outlines are drawn in, and each dinosaur's fact and pieces by name, read
// as any values, as the JSON gives them.
export type SkeletonsFile = {
  frame: { width: number; height: number };
  dinosaurs: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
};

// The skeleton game needs each skeleton's dinosaur, named as in the
// list, its fact and where its pieces go, in the file's order. A skeleton
// of no dinosaur in the list, with a piece missing or outside its frame,
// or without its fact in every language, fails here, when the app is put
// together, rather than as a puzzle no child can finish or a reveal with
// nothing to say.
export function readSkeletons(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name">>, file: SkeletonsFile): Skeleton[] {
  const { width, height } = file.frame;
  return Object.entries(file.dinosaurs).map(([id, { fact, ...pieces }]) => {
    const record = records.find((each) => each.id === id);
    if (!record) throw new Error(`The skeleton ${id} is of no dinosaur in the list`);
    const placeOf = (piece: string): Place => {
      const place = pieces[piece];
      if (!isPlace(place) || place.x + place.width > width || place.y + place.height > height) {
        throw new Error(`${id} has no ${piece} in its ${width}×${height} frame: ${JSON.stringify(place)}`);
      }
      return { x: place.x, y: place.y, width: place.width, height: place.height };
    };
    if (!isSkeletonFact(fact)) throw new Error(`${id} has no fact in every language: ${JSON.stringify(fact)}`);
    return {
      id,
      name: { en: record.name.en, ru: record.name.ru },
      fact: { en: fact.en, ru: fact.ru },
      frame: { width, height },
      places: { skull: placeOf("skull"), spine: placeOf("spine"), legs: placeOf("legs"), tail: placeOf("tail") }
    };
  });
}

const isSkeletonFact = (value: unknown): value is Record<Language, string> => {
  const fact = value as Partial<Record<Language, unknown>> | null;
  return typeof fact === "object" && fact !== null && LANGUAGES.every((language) => isText(fact[language]));
};

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

const isPlace = (value: unknown): value is Place => {
  const place = value as Partial<Record<keyof Place, unknown>> | null;
  return (
    typeof place === "object" &&
    place !== null &&
    [place.x, place.y].every((at) => typeof at === "number" && at >= 0) &&
    [place.width, place.height].every((size) => typeof size === "number" && size > 0)
  );
};
