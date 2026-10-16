import type { Dinosaur } from "./quiz/round.ts";

// One entry of the shipped dinosaur list, in the content model's format.
export type DinosaurRecord = {
  id: string;
  name: { en: string };
  attributes: { massKg: number; heightMeters: number };
};

export function readDinosaurs(records: readonly DinosaurRecord[]): Dinosaur[] {
  return records.map(({ id, name, attributes }) => ({
    id,
    name: name.en,
    measures: { mass: attributes.massKg, height: attributes.heightMeters }
  }));
}
