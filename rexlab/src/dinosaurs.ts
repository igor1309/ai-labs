import { AGE_LEVELS, isAgeLevel, type AgeLevel } from "./ageLevel.ts";
import type { Visitor } from "./care/index.ts";
import { isDiet, type CatalogueEntry } from "./catalogue.ts";
import { LANGUAGES, type Language } from "./language/language.ts";
import type { Pal } from "./pairs/index.ts";
import type { Dinosaur } from "./quiz/index.ts";
import { BODY_AREAS, type BodyArea, type Cut, type Distractor, type Place, type Skeleton } from "./skeletons/index.ts";
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
// outlines are drawn in, and each dinosaur's fact, cuts, each a list of
// pieces with its id, name and place, and distractors, each a piece of
// another skeleton with its name here, read as any values, as the JSON
// gives them.
export type SkeletonsFile = {
  frame: { width: number; height: number };
  dinosaurs: Readonly<Record<string, Readonly<{ fact?: unknown; cuts?: unknown; distractors?: unknown }>>>;
};

// The skeleton game needs each skeleton's dinosaur, named as in the
// list, its fact and its cuts, in the file's order. A skeleton of no
// dinosaur in the list, without its fact in every language, without
// Hatchling's cut, or with a cut of no level or not whole, fails here,
// when the app is put together, rather than as a puzzle no child can
// finish or a reveal with nothing to say. The other levels' cuts are
// optional: a level without one plays Hatchling's. So are the
// distractors, which must each be a piece of another skeleton's
// Paleontologist cut.
export function readSkeletons(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name">>, file: SkeletonsFile): Skeleton[] {
  const skeletons = readCuts(records, file);
  return skeletons.map((skeleton) => {
    const { distractors } = file.dinosaurs[skeleton.id] ?? {};
    return distractors === undefined ? skeleton : { ...skeleton, distractors: readDistractors(skeleton.id, distractors, skeletons) };
  });
}

function readCuts(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name">>, file: SkeletonsFile): Skeleton[] {
  const { width, height } = file.frame;
  return Object.entries(file.dinosaurs).map(([id, { fact, cuts }]) => {
    const record = records.find((each) => each.id === id);
    if (!record) throw new Error(`The skeleton ${id} is of no dinosaur in the list`);
    if (!isInEveryLanguage(fact)) throw new Error(`${id} has no fact in every language: ${JSON.stringify(fact)}`);
    const levels = typeof cuts === "object" && cuts !== null ? (cuts as Record<string, unknown>) : {};
    const stray = Object.keys(levels).find((level) => !isAgeLevel(level));
    if (stray !== undefined) throw new Error(`${id} has a cut of no level: ${stray}`);
    const cutOf = (level: AgeLevel) => readCut(id, level, levels[level], { width, height });
    return {
      id,
      name: { en: record.name.en, ru: record.name.ru },
      fact: { en: fact.en, ru: fact.ru },
      frame: { width, height },
      cuts: { hatchling: cutOf("hatchling"), ...Object.fromEntries(AGE_LEVELS.filter((level) => level !== "hatchling" && level in levels).map((level) => [level, cutOf(level)])) }
    };
  });
}

// A cut is the pieces of its level, at least one: each with an id of its
// own in the cut, never "skeleton", the name of the whole skeleton's
// picture, its name in every language, its body area and its place within
// the frame.
function readCut(id: string, level: string, pieces: unknown, frame: { width: number; height: number }): Cut {
  if (!Array.isArray(pieces) || pieces.length === 0) throw new Error(`${id} has no ${level} cut: ${JSON.stringify(pieces)}`);
  const ids = new Set<string>();
  return pieces.map((piece: unknown, at) => {
    const { id: own, name, area, ...place } = (typeof piece === "object" && piece !== null ? piece : {}) as Record<string, unknown>;
    if (!isText(own) || own === "skeleton" || ids.has(own)) throw new Error(`${id}'s ${level} piece ${at + 1} has no id of its own: ${JSON.stringify(own)}`);
    ids.add(own);
    if (!isInEveryLanguage(name)) throw new Error(`${id}'s ${own} has no name in every language: ${JSON.stringify(name)}`);
    if (!(BODY_AREAS as readonly unknown[]).includes(area)) throw new Error(`${id}'s ${own} has no body area: ${JSON.stringify(area)}`);
    if (!isPlace(place) || place.x + place.width > frame.width || place.y + place.height > frame.height) {
      throw new Error(`${id} has no ${own} in its ${frame.width}×${frame.height} frame: ${JSON.stringify(place)}`);
    }
    return { id: own, name: { en: name.en, ru: name.ru }, area: area as BodyArea, place: { x: place.x, y: place.y, width: place.width, height: place.height } };
  });
}

// Distractors are a list of other skeletons' pieces, at least one, each
// once: the skeleton and the piece of its Paleontologist cut, named here
// in every language with the dinosaur it belongs to.
function readDistractors(id: string, distractors: unknown, skeletons: readonly Skeleton[]): Distractor[] {
  if (!Array.isArray(distractors) || distractors.length === 0) throw new Error(`${id} has no distractors: ${JSON.stringify(distractors)}`);
  const seen = new Set<string>();
  return distractors.map((distractor: unknown, at) => {
    const { skeleton, piece, name } = (typeof distractor === "object" && distractor !== null ? distractor : {}) as Record<string, unknown>;
    const from = skeleton === id ? undefined : skeletons.find((each) => each.id === skeleton);
    const bone = from?.cuts.paleontologist?.find((each) => each.id === piece);
    if (!from || !bone || seen.has(`${from.id}/${bone.id}`)) {
      throw new Error(`${id}'s distractor ${at + 1} is no piece of another skeleton's paleontologist cut: ${JSON.stringify(distractor)}`);
    }
    seen.add(`${from.id}/${bone.id}`);
    if (!isInEveryLanguage(name)) throw new Error(`${id}'s distractor ${from.id}/${bone.id} has no name in every language: ${JSON.stringify(name)}`);
    return { ...bone, name: { en: name.en, ru: name.ru }, skeleton: from.id };
  });
}

const isInEveryLanguage = (value: unknown): value is Record<Language, string> => {
  const words = value as Partial<Record<Language, unknown>> | null;
  return typeof words === "object" && words !== null && LANGUAGES.every((language) => isText(words[language]));
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
