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

export type CatalogueEntry = {
  id: string;
  name: Record<Language, string>;
  diet: Diet;
  description: Record<Language, string>;
  // Metres.
  height: number;
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
