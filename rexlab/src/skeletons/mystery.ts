import type { Language } from "../language/language.ts";
import type { Skeleton } from "./puzzle.ts";
import { shuffled } from "./shuffled.ts";

// The mystery skeleton (skeleton-assembly-mystery.feature): one of the
// skeletons already built, built again with its name hidden, then
// guessed from three dinosaurs' bodies.

// A dinosaur that can be guessed: its name, and the look-alike group it
// shares with the dinosaurs it is most easily taken for.
export type Kin = { id: string; name: Record<Language, string>; lookAlike: string };

// The mystery is one of the skeletons with a star, any of them as likely;
// none until one has its star.
export function pickMystery(skeletons: readonly Skeleton[], earned: readonly string[], random: () => number): Skeleton | undefined {
  const built = skeletons.filter(({ id }) => earned.includes(id));
  return built[Math.floor(random() * built.length)];
}

// The three dinosaurs the mystery is guessed from, in a random order: the
// mystery itself, one of its look-alikes when `lookAlike` asks for one and
// it has any, and dinosaurs unlike it, each of another skeleton's
// look-alike group, two of different groups where no look-alike is
// asked for or there is none. Every other skeleton's group is of
// dinosaurs, so a flying or sea reptile is never a choice.
export function mysteryChoices(mystery: string, skeletons: readonly Skeleton[], kin: readonly Kin[], lookAlike: boolean, random: () => number): string[] {
  const groupOf = (id: string) => kin.find((each) => each.id === id)?.lookAlike;
  const group = groupOf(mystery);
  const pick = <T>(items: readonly T[]): T | undefined => items[Math.floor(random() * items.length)];
  const alike = kin.filter((each) => each.lookAlike === group && each.id !== mystery);
  const otherGroups = skeletons.map(({ id }) => groupOf(id)).filter((each) => each !== undefined && each !== group);
  const unlike = kin.filter((each) => otherGroups.includes(each.lookAlike));
  const first = lookAlike ? (pick(alike) ?? pick(unlike)) : pick(unlike);
  const second = pick(unlike.filter((each) => each.lookAlike !== first?.lookAlike));
  return shuffled([mystery, ...[first, second].filter((each) => each !== undefined).map(({ id }) => id)], random);
}
