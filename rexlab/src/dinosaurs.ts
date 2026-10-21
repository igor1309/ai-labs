import { AGE_LEVELS, isAgeLevel, type AgeLevel } from "./ageLevel.ts";
import type { Visitor } from "./care/index.ts";
import { isDiet, isGroup, MEASURES, type CatalogueEntry, type Group, type Measure } from "./catalogue.ts";
import { LANGUAGES, type Language } from "./language/language.ts";
import type { Pal } from "./pairs/index.ts";
import type { Dinosaur } from "./quiz/index.ts";
import { BODY_AREAS, type BodyArea, type Cut, type Distractor, type Place, type Skeleton } from "./skeletons/index.ts";
import type { Dinosaur as Sortable } from "./sorting/index.ts";

// One entry of the shipped dinosaur list, in the content model's format.
export type DinosaurRecord = {
  id: string;
  name: { en: string; ru: string };
  // "dinosaur", "flying-reptile" or "sea-reptile"; read as any string, as
  // the JSON gives it.
  group: string;
  // A size by the group's measure alone: a dinosaur's hip height, a flying
  // reptile's wingspan or a sea reptile's length.
  attributes: { massKg: number; heightMeters?: number | null; wingspanMeters?: number | null; lengthMeters?: number | null };
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

const SIZE_FIELDS = { height: "heightMeters", wingspan: "wingspanMeters", length: "lengthMeters" } as const;

const MEASURE_ORDER = Object.keys(SIZE_FIELDS) as Measure[];

// A record with no known group fails here, when the app is put together,
// rather than as a creature no game knows whether to show.
function groupOf(id: string, group: unknown): Group {
  if (!isGroup(group)) throw new Error(`${id} has no known group: ${JSON.stringify(group)}`);
  return group;
}

// A record's size by its group's measure. A record with no size by that
// measure, or with one by another, fails here, when the app is put
// together, rather than as a wingspan shown beside a dinosaur's height.
function sizeOf({ id, group, attributes }: Pick<DinosaurRecord, "id" | "group" | "attributes">): CatalogueEntry["size"] {
  const measure = MEASURES[groupOf(id, group)];
  const metres = attributes[SIZE_FIELDS[measure]];
  if (typeof metres !== "number" || !(metres > 0)) throw new Error(`${id} has no ${measure}: ${JSON.stringify(metres)}`);
  const other = MEASURE_ORDER.find((each) => each !== measure && attributes[SIZE_FIELDS[each]] != null);
  if (other !== undefined) throw new Error(`${id} is measured by its ${measure}, not its ${other}`);
  return { measure, metres };
}

// The quiz needs only what it compares: the mass of every creature, and
// the height of a dinosaur alone, as no other is measured standing.
export function readDinosaurs(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name" | "group" | "attributes">>): Dinosaur[] {
  return records.map((record) => {
    const { measure, metres } = sizeOf(record);
    return {
      id: record.id,
      name: { en: record.name.en, ru: record.name.ru },
      measures: { mass: record.attributes.massKg, ...(measure === "height" ? { height: metres } : {}) }
    };
  });
}

// Care needs only who visits and what it eats. Only dinosaurs visit: a
// visit asks for water and a bath, which mean nothing to a sea reptile.
// A record with no known food type fails here, when the app is put
// together, rather than as a visitor no food can feed.
export function readVisitors(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name" | "group" | "diet">>): Visitor[] {
  return records.filter(({ id, group }) => groupOf(id, group) === "dinosaur").map(({ id, name, diet }) => {
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
  return records.map((record) => {
    const { id, name, group, attributes, diet, description } = record;
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
      group: groupOf(id, group),
      diet,
      description: { en: description.en, ru: description.ru },
      size: sizeOf(record),
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

// Find the pair needs who is dealt, whose silhouettes look alike, and
// which of them has a whole skeleton drawn, by the ids in `skeletons`. A
// record with no look-alike group fails here, when the app is put
// together, rather than as two silhouettes no child can tell apart.
export function readPals(records: ReadonlyArray<Pick<DinosaurRecord, "id" | "name" | "lookAlike">>, skeletons: ReadonlySet<string>): Pal[] {
  return records.map(({ id, name, lookAlike }) => {
    if (typeof lookAlike !== "string" || !lookAlike.trim()) {
      throw new Error(`${id} has no look-alike group: ${JSON.stringify(lookAlike)}`);
    }
    return { id, name: { en: name.en, ru: name.ru }, lookAlike, skeleton: skeletons.has(id) };
  });
}

// The skeletons' file, `skeletons.json`, in its own format: the frame the
// outlines are drawn in, and each dinosaur's fact, clue, cuts, each a list of
// pieces with its id, name and place, and distractors, each a piece of
// another skeleton with its name here, read as any values, as the JSON
// gives them.
export type SkeletonsFile = {
  frame: { width: number; height: number };
  dinosaurs: Readonly<Record<string, Readonly<{ fact?: unknown; clue?: unknown; cuts?: unknown; distractors?: unknown }>>>;
};

// The skeleton game needs each skeleton's dinosaur, named as in the
// list, its fact, the clue its mystery gives and its cuts, in the file's
// order. A skeleton of no dinosaur in the list, without its fact or its
// clue in every language, without Hatchling's cut, or with a cut of no
// level or not whole, fails here, when the app is put together, rather
// than as a puzzle no child can finish or a reveal with nothing to say.
// The other levels' cuts are
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
  return Object.entries(file.dinosaurs).map(([id, { fact, clue, cuts }]) => {
    const record = records.find((each) => each.id === id);
    if (!record) throw new Error(`The skeleton ${id} is of no dinosaur in the list`);
    if (!isInEveryLanguage(fact)) throw new Error(`${id} has no fact in every language: ${JSON.stringify(fact)}`);
    if (!isInEveryLanguage(clue)) throw new Error(`${id} has no clue in every language: ${JSON.stringify(clue)}`);
    const levels = typeof cuts === "object" && cuts !== null ? (cuts as Record<string, unknown>) : {};
    const stray = Object.keys(levels).find((level) => !isAgeLevel(level));
    if (stray !== undefined) throw new Error(`${id} has a cut of no level: ${stray}`);
    const cutOf = (level: AgeLevel) => readCut(id, level, levels[level], { width, height });
    return {
      id,
      name: { en: record.name.en, ru: record.name.ru },
      fact: { en: fact.en, ru: fact.ru },
      clue: { en: clue.en, ru: clue.ru },
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
