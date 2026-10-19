import { describe, expect, it } from "vitest";
import digFile from "../src/data/dig.json";
import records from "../src/data/dinosaurs.json";
import { FRAME, readDig, SPOT_KINDS, spotCells, TELLING_KINDS, type DigFile, type Spot } from "../src/dig/index.ts";
import { en } from "../src/language/en.ts";
import { ru } from "../src/language/ru.ts";
import { alphaOf, bodyPicture, cellsOf } from "../scripts/digGrid.ts";

const IDS = records.map(({ id }) => id);
const DUG = readDig(IDS, digFile as DigFile);

const ROW = "0".repeat(40);
const FULL = "1".repeat(40);

// A file of one dinosaur with every cell its own, and the spots given.
const oneDinosaur = (spots: unknown, traits: unknown = []): DigFile => ({ rex: { traits, spots, cells: Array.from({ length: 30 }, () => FULL) } });

const spot = (kind: string, x = 200, y = 200, r = 50) => ({ kind, x, y, r });

describe("the dig data", () => {
  it("gives every shipped dinosaur three to five spots, and names no other dinosaur", () => {
    expect(DUG.map(({ id }) => id)).toEqual(IDS);
    for (const { id, spots } of DUG) expect([id, spots.length >= 3 && spots.length <= 5]).toEqual([id, true]);
  });

  it("gives every spot a kind a child can name, at most one of each, with a radius of 40 to 90 wholly in the frame", () => {
    for (const { id, spots } of DUG) {
      expect([id, new Set(spots.map(({ kind }) => kind)).size]).toEqual([id, spots.length]);
      for (const { kind, x, y, r } of spots) {
        expect([id, kind, SPOT_KINDS.includes(kind), r >= 40 && r <= 90]).toEqual([id, kind, true, true]);
        expect([id, kind, x - r >= 0 && y - r >= 0 && x + r <= FRAME.width && y + r <= FRAME.height]).toEqual([id, kind, true]);
      }
    }
  });

  it("puts at least 4 of the dinosaur's cells in every spot", () => {
    for (const { id, spots, cells } of DUG) {
      for (const each of spots) expect([id, each.kind, spotCells(each, cells).length >= 4]).toEqual([id, each.kind, true]);
    }
  });

  it("lets two spots of one dinosaur share less than half of the smaller's cells", () => {
    for (const { id, spots, cells } of DUG) {
      const counted = spots.map((each) => new Set(spotCells(each, cells).map(([column, row]) => `${column},${row}`)));
      counted.forEach((one, at) =>
        counted.slice(at + 1).forEach((other, past) => {
          const shared = [...one].filter((cell) => other.has(cell)).length;
          expect([id, spots[at]?.kind, spots[at + 1 + past]?.kind, shared * 2 < Math.min(one.size, other.size)]).toEqual([id, spots[at]?.kind, spots[at + 1 + past]?.kind, true]);
        })
      );
    }
  });

  it("lists among a dinosaur's telling traits every telling kind of its spots", () => {
    for (const { id, traits, spots } of DUG) {
      for (const trait of traits) expect(TELLING_KINDS).toContain(trait);
      for (const { kind } of spots) if (TELLING_KINDS.includes(kind)) expect([id, traits]).toEqual([id, expect.arrayContaining([kind])]);
    }
  });

  it("marks a cell as the dinosaur's exactly when its picture shows in more than a tenth of it", async () => {
    for (const { id } of DUG) expect([id, (digFile as DigFile)[id]?.cells]).toEqual([id, cellsOf(await alphaOf(bodyPicture(id)))]);
  }, 60_000);
});

describe("a spot's cells", () => {
  const cells = Array.from({ length: 30 }, (_, row) => Array.from({ length: 40 }, (_, column) => row < 15 && column < 20));
  const at = (x: number, y: number, r: number): Spot => ({ kind: "eye", x, y, r });

  it("are the dinosaur's cells whose middle lies in the circle", () => {
    expect(spotCells(at(30, 30, 15), cells)).toEqual([[1, 1]]);
    expect(spotCells(at(20, 20, 15), cells).sort()).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1]
    ]);
  });

  it("leave out cells past the dinosaur", () => {
    expect(spotCells(at(600, 450, 40), cells)).toEqual([]);
    expect(spotCells(at(400, 300, 15), cells)).toEqual([[19, 14]]);
  });
});

describe("reading the dig file", () => {
  it.each([
    ["two spots", [spot("eye"), spot("foot")], /3 to 5 spots/],
    ["six spots", ["eye", "foot", "tail", "claw", "horn", "beak"].map((kind) => spot(kind)), /3 to 5 spots/],
    ["a kind twice", [spot("eye"), spot("eye"), spot("tail")], /no kind of its own/],
    ["an unknown kind", [spot("eye"), spot("wing"), spot("tail")], /no kind of its own/],
    ["a spot past the frame", [spot("eye", 780), spot("foot"), spot("tail")], /frame/]
  ])("fails on %s", (_, spots, message) => {
    expect(() => readDig(["rex"], oneDinosaur(spots))).toThrow(message);
  });

  it("fails on a telling spot that is not among the traits", () => {
    expect(() => readDig(["rex"], oneDinosaur([spot("horn"), spot("eye", 400), spot("tail", 600)]))).toThrow(/no horn among its traits/);
  });

  it.each([
    ["a kind every dinosaur shows", ["eye"]],
    ["a trait twice", ["horn", "horn"]],
    ["no list", "horn"]
  ])("fails on traits of %s", (_, traits) => {
    expect(() => readDig(["rex"], oneDinosaur([spot("eye"), spot("foot", 400), spot("tail", 600)], traits))).toThrow(/telling traits/);
  });

  it("fails on a dinosaur with no entry and an entry of no dinosaur", () => {
    expect(() => readDig(["rex", "stego"], oneDinosaur([spot("eye"), spot("foot", 400), spot("tail", 600)]))).toThrow(/stego has no dig entry/);
    expect(() => readDig([], oneDinosaur([]))).toThrow(/rex is of no dinosaur/);
  });

  it("fails on cells not of the grid", () => {
    const file = { rex: { traits: [], spots: [spot("eye"), spot("foot", 400), spot("tail", 600)], cells: [ROW] } };
    expect(() => readDig(["rex"], file)).toThrow(/40×30 cells/);
  });
});

describe("the spot kinds' words", () => {
  it("are in capitals in either language", () => {
    expect(SPOT_KINDS.map((kind) => en.spotKinds[kind])).toEqual(["EYE", "FOOT", "TAIL", "CLAW", "HORN", "PLATE", "CREST", "SAIL", "FRILL", "BEAK"]);
    expect(SPOT_KINDS.map((kind) => ru.spotKinds[kind])).toEqual(["ГЛАЗ", "ЛАПА", "ХВОСТ", "КОГОТЬ", "РОГ", "ПЛАСТИНА", "ГРЕБЕНЬ", "ПАРУС", "ВОРОТНИК", "КЛЮВ"]);
  });
});
