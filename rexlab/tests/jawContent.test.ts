import { describe, expect, it } from "vitest";
import jaws from "../src/data/jaws.json";
import dinosaurs from "../src/data/dinosaurs.json";
import { jawPictures, readJaws } from "../src/jawContent.ts";

describe("jaw content adapters", () => {
  it("joins all sixteen paired jaws to localized names and a single diet", () => {
    const read = readJaws(jaws, dinosaurs);
    expect(read).toHaveLength(16);
    for (const jaw of read) {
      expect(jaw.name).toEqual(dinosaurs.find(({ id }) => id === jaw.id)!.name);
      expect(jaw.fact).toEqual(jaws.find(({ id }) => id === jaw.id)!.fact);
      expect(["meat", "plants"]).toContain(jaw.diet);
    }
  });
  it.each(["absent", "both", "name", "fact", "pair", "diet", "duplicate"])("rejects %s content at composition", (bad) => {
    const records = structuredClone(jaws);
    const dinos = structuredClone(dinosaurs);
    if (bad === "absent") records[0]!.id = "absent";
    if (bad === "both") dinos.find(({ id }) => id === records[0]!.id)!.diet = "both";
    if (bad === "name") dinos.find(({ id }) => id === records[0]!.id)!.name.ru = "";
    if (bad === "fact") records[0]!.fact.en = "";
    if (bad === "pair") records[0]!.pair = "alone";
    if (bad === "diet") dinos.find(({ id }) => id === records[0]!.id)!.diet = "plants";
    if (bad === "duplicate") records.push(records[0]!);
    expect(() => readJaws(records, dinos)).toThrow();
  });
  it.each(["jaw", "gummy"] as const)("finds every %s asset and rejects missing pictures before play", (kind) => {
    const path = (id: string) => kind === "jaw" ? `./assets/jaws/${id}.webp` : `./assets/dinos/${id}/gummy.webp`;
    const files = Object.fromEntries(jaws.map(({ id }) => [path(id), `hashed-${kind}-${id}.webp`]));
    const picture = jawPictures(files, jaws.map(({ id }) => id), kind);
    for (const { id } of jaws) expect(picture(id)).toBe(`hashed-${kind}-${id}.webp`);
    expect(() => picture("absent")).toThrow(`No ${kind} picture`);
    delete files[path(jaws[0]!.id)];
    expect(() => jawPictures(files, jaws.map(({ id }) => id), kind)).toThrow(jaws[0]!.id);
  });
});
