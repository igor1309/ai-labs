// The catalogue's API: every dinosaur as the child browses it, the food
// type the child chooses to see, and how a page steps to the next or
// previous one.
import type { Language } from "./language/language.ts";

// What a dinosaur ate: meat, plants, or both.
export type Diet = "meat" | "plants" | "both";

export const DIETS: readonly Diet[] = ["meat", "plants", "both"];

export function isDiet(value: unknown): value is Diet {
  return DIETS.includes(value as Diet);
}

// The kind of creature: a dinosaur, or a flying or sea reptile, which
// lived alongside the dinosaurs but was none.
export type Group = "dinosaur" | "flying-reptile" | "sea-reptile";

export const GROUPS: readonly Group[] = ["dinosaur", "flying-reptile", "sea-reptile"];

// How big a creature is measured: a dinosaur's height at the hip, a flying
// reptile's wingspan and a sea reptile's length, each its group's own.
export type Measure = "height" | "wingspan" | "length";

export function isGroup(value: unknown): value is Group {
  return GROUPS.includes(value as Group);
}

export const MEASURES: Record<Group, Measure> = { dinosaur: "height", "flying-reptile": "wingspan", "sea-reptile": "length" };

export type CatalogueEntry = {
  id: string;
  name: Record<Language, string>;
  group: Group;
  diet: Diet;
  description: Record<Language, string>;
  // In metres, by its group's measure.
  size: { measure: Measure; metres: number };
  // Kilograms.
  mass: number;
};

export type Step = "previous" | "next";

// The place a step takes a page at `at` to in a catalogue of `total`:
// next from the last is the first, and previous from the first the last,
// so the child can browse round and round.
export function stepFrom(at: number, step: Step, total: number): number {
  return (at + (step === "next" ? 1 : -1) + total) % total;
}

// The dinosaurs a child chooses to see: every one, or those of one food
// type.
export type Food = "all" | Diet;

// The choices, in the order their chips show them.
export const FOODS: readonly Food[] = ["all", ...DIETS];

// The entries of `food`, in the catalogue's order.
export function ofFood<Entry extends { diet: Diet }>(catalogue: readonly Entry[], food: Food): readonly Entry[] {
  return food === "all" ? catalogue : catalogue.filter(({ diet }) => diet === food);
}
