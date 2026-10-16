import { describe, expect, it } from "vitest";
import { readDinosaurs } from "../src/dinosaurs.ts";

describe("readDinosaurs", () => {
  it("reads each record's id, English name, mass and height", () => {
    const dinosaurs = readDinosaurs([
      { id: "stegosaurus", name: { en: "Stegosaurus" }, attributes: { massKg: 5000, heightMeters: 4 } },
      { id: "compsognathus", name: { en: "Compsognathus" }, attributes: { massKg: 3, heightMeters: 0.3 } }
    ]);

    expect(dinosaurs).toEqual([
      { id: "stegosaurus", name: "Stegosaurus", measures: { mass: 5000, height: 4 } },
      { id: "compsognathus", name: "Compsognathus", measures: { mass: 3, height: 0.3 } }
    ]);
  });
});
