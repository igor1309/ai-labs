import { describe, expect, it } from "vitest";
import { readDinosaurs } from "../src/dinosaurs.ts";
import { SHIPPED_DINOSAURS } from "./support.ts";

describe("readDinosaurs", () => {
  it("reads each record's id, English and Russian names, mass and height", () => {
    const dinosaurs = readDinosaurs([
      { id: "stegosaurus", name: { en: "Stegosaurus", ru: "Стегозавр" }, attributes: { massKg: 5000, heightMeters: 4 } },
      { id: "compsognathus", name: { en: "Compsognathus", ru: "Компсогнат" }, attributes: { massKg: 3, heightMeters: 0.3 } }
    ]);

    expect(dinosaurs).toEqual([
      { id: "stegosaurus", name: { en: "Stegosaurus", ru: "Стегозавр" }, measures: { mass: 5000, height: 4 } },
      { id: "compsognathus", name: { en: "Compsognathus", ru: "Компсогнат" }, measures: { mass: 3, height: 0.3 } }
    ]);
  });
});

describe("the shipped dinosaur list", () => {
  // Names are stored as words and shown in capitals, so each is written
  // like the English ones: a capital, then lower case, in its own script.
  it.each([
    ["en", /^[A-Z][a-z]+$/],
    ["ru", /^[А-ЯЁ][а-яё]+$/]
  ] as const)("names every dinosaur in %s, each name different", (language, word) => {
    const names = SHIPPED_DINOSAURS.map(({ name }) => name[language]);

    for (const name of names) {
      expect(name).toMatch(word);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
