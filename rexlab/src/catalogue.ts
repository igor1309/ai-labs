// The catalogue's API: every dinosaur as the child browses it, and how a
// page steps to the next or previous one.
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
