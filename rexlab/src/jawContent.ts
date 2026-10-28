import type { Jaw } from "./whoseJaw/index.ts";
import type { PictureFiles } from "./dinosaurPictures.ts";

type Words = { en: string; ru: string };
type JawRecord = { id: string; pair: string; fact: Words; hint: Words };

export function readJaws(records: readonly JawRecord[], dinosaurs: readonly { id: string; name: Words; diet: string }[]): Jaw[] {
  const jaws = records.map((record): Jaw => {
    const dinosaur = dinosaurs.find(({ id }) => id === record.id);
    if (!dinosaur || (dinosaur.diet !== "meat" && dinosaur.diet !== "plants")) throw new Error(`No jaw dinosaur with one diet: ${record.id}`);
    for (const words of [dinosaur.name, record.fact, record.hint]) {
      if (!words.en?.trim() || !words.ru?.trim()) throw new Error(`No localized jaw words: ${record.id}`);
    }
    return { ...record, name: dinosaur.name, diet: dinosaur.diet };
  });
  if (new Set(jaws.map(({ id }) => id)).size !== jaws.length) throw new Error("Duplicate jaw dinosaur");
  for (const jaw of jaws) {
    const pair = jaws.filter((other) => other.pair === jaw.pair);
    if (!jaw.pair || pair.length !== 2 || pair.some((other) => other.diet !== jaw.diet)) throw new Error(`Invalid jaw pair: ${jaw.pair}`);
  }
  return jaws;
}

export function jawPictures(files: PictureFiles, ids: readonly string[], kind: "jaw" | "gummy"): (id: string) => string {
  const pattern = kind === "jaw" ? /assets\/jaws\/([^/]+)\.webp$/ : /assets\/dinos\/([^/]+)\/gummy\.webp$/;
  const urls = new Map(Object.entries(files).flatMap(([path, url]) => {
    const id = pattern.exec(path)?.[1];
    return id ? [[id, url] as const] : [];
  }));
  for (const id of ids) if (!urls.has(id)) throw new Error(`No ${kind} picture for ${id}`);
  return (id) => {
    const url = urls.get(id);
    if (!url) throw new Error(`No ${kind} picture for ${id}`);
    return url;
  };
}
