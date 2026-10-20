import { describe, expect, it } from "vitest";
import {
  asking,
  brushRound,
  drawTreasure,
  GRID,
  roundShare,
  roundTreasureFound,
  startRound,
  TREASURE_CHANCES,
  TREASURE_KINDS,
  TREASURE_ROUNDS,
  treasureCells,
  treasureFound,
  treasureKind,
  treasurePlaces,
  type Cells,
  type DigDinosaur,
  type DigRound,
  type Random,
  type Treasure
} from "../src/dig/index.ts";
import { SHIPPED_DIG } from "./support.ts";

const cellsWhere = (holds: (column: number, row: number) => boolean): Cells =>
  Array.from({ length: GRID.rows }, (_, row) => Array.from({ length: GRID.columns }, (_, column) => holds(column, row)));
// A dinosaur on the frame's left half, leaving the right half to a treasure.
const leftHalf = cellsWhere((column) => column < GRID.columns / 2);
const dinosaur: DigDinosaur = {
  id: "rex", traits: [], cells: leftHalf,
  spots: [{ kind: "eye", x: 100, y: 100, r: 30 }, { kind: "foot", x: 300, y: 500, r: 30 }]
};
// Enough look-alikes for Paleontologist's question.
const herd = ["rex", "raptor", "allo", "stego"].map((id) => ({ ...dinosaur, id }));

// Gives `draws` in turn, then `rest`, counting every draw taken.
function drawsOf(draws: number[], rest = 0.5): Random & { count: number } {
  const random = Object.assign(() => draws[random.count++] ?? rest, { count: 0 });
  return random;
}

describe("a round's treasure", () => {
  it("is hidden by a draw in the first third, at every level, and by none past it", () => {
    expect(TREASURE_ROUNDS).toBe(1 / 3);
    for (const draw of [0, 0.2, 0.333]) expect(drawTreasure(leftHalf, drawsOf([draw]))).toBeDefined();
    for (const draw of [1 / 3, 0.5, 0.999]) {
      const random = drawsOf([draw]);
      expect(drawTreasure(leftHalf, random)).toBeUndefined();
      expect(random.count).toBe(1);
    }
    for (const level of ["hatchling", "explorer", "paleontologist"] as const) {
      expect(startRound(herd, [], undefined, () => 0, level).treasure).toBeDefined();
      expect(startRound(herd, [], undefined, () => 0.5, level).treasure).toBeUndefined();
    }
  });

  it("is a golden fossil 1 in 20, an egg nest 1 in 8, and a shell, tooth or amber at an equal share of the rest", () => {
    const share = (1 - 1 / 20 - 1 / 8) / 3;
    expect(TREASURE_KINDS).toEqual(["shell", "tooth", "amber", "egg-nest", "golden-fossil"]);
    expect(Object.values(TREASURE_CHANCES).reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1, 12);
    const steps = 100_000;
    const drawn = new Map<string, number>();
    for (let step = 0; step < steps; step++) {
      const kind = treasureKind((step + 0.5) / steps);
      drawn.set(kind, (drawn.get(kind) ?? 0) + 1);
    }
    const chances = Object.fromEntries(TREASURE_KINDS.map((kind) => [kind, (drawn.get(kind) ?? 0) / steps]));
    expect(chances["golden-fossil"]).toBeCloseTo(1 / 20, 4);
    expect(chances["egg-nest"]).toBeCloseTo(1 / 8, 4);
    for (const kind of ["shell", "tooth", "amber"]) expect(chances[kind]).toBeCloseTo(share, 4);
    expect([treasureKind(0), treasureKind(0.999_999)]).toEqual(["shell", "golden-fossil"]);
  });

  it("lies wholly off every shipped dinosaur, at least one cell from the board's edge", () => {
    for (const shipped of SHIPPED_DIG) {
      expect(treasurePlaces(shipped.cells).length).toBeGreaterThan(0);
      for (const draw of [0, 0.25, 0.5, 0.75, 0.999]) {
        const treasure = drawTreasure(shipped.cells, drawsOf([0, 0, draw]));
        if (!treasure) throw new Error(`No treasure beside ${shipped.id}`);
        for (const [column, row] of treasureCells(treasure)) {
          expect(shipped.cells[row]?.[column]).toBe(false);
          expect([column >= 1, column <= GRID.columns - 2, row >= 1, row <= GRID.rows - 2]).toEqual([true, true, true, true]);
        }
      }
    }
  });

  it("is placed and kinded by the round's draws", () => {
    expect(drawTreasure(leftHalf, drawsOf([0, 0, 0]))).toEqual({ kind: "shell", column: 20, row: 1 });
    expect(drawTreasure(leftHalf, drawsOf([0, 0.99, 0.999]))).toEqual({ kind: "golden-fossil", column: 36, row: 26 });
  });

  it("is hidden by no dinosaur that leaves it no room", () => {
    expect(treasurePlaces(cellsWhere(() => true))).toEqual([]);
    expect(drawTreasure(cellsWhere(() => true), drawsOf([0, 0, 0]))).toBeUndefined();
    // A gap one cell short, or touching the edge, is no room.
    expect(treasurePlaces(cellsWhere((column, row) => !(column >= 5 && column < 7 && row >= 5 && row < 8)))).toEqual([]);
    expect(treasurePlaces(cellsWhere((column, row) => !(column < 3 && row >= 5 && row < 8)))).toEqual([]);
  });

  it("is found once more than half of its cells are clear", () => {
    const treasure: Treasure = { kind: "tooth", column: 30, row: 10 };
    const clearing = (count: number) => {
      const own = treasureCells(treasure).slice(0, count);
      return cellsWhere((column, row) => own.some(([x, y]) => x === column && y === row));
    };
    expect(treasureFound(treasure, clearing(4))).toBe(false);
    expect(treasureFound(treasure, clearing(5))).toBe(true);
    expect(treasureFound(treasure, cellsWhere((column) => column < 30))).toBe(false);
  });
});

describe("a round with a treasure", () => {
  it("draws its dinosaur, spots and question as one without, its treasure from the draws after", () => {
    for (const level of ["hatchling", "explorer", "paleontologist"] as const) {
      const without = drawsOf([], 0.6);
      const plain = startRound(herd, [], undefined, without, level);
      expect(plain.treasure).toBeUndefined();
      const before = Array<number>(without.count - 1).fill(0.6);
      const round = startRound(herd, [], undefined, drawsOf([...before, 0, 0.9, 0.999]), level);
      expect({ ...round, treasure: undefined }).toEqual(plain);
      expect(round.treasure).toEqual({ kind: "egg-nest", column: 36, row: 26 });
    }
  });

  it.each(["hatchling", "explorer"] as const)("plays at %s as if it were not there: its sand counts toward neither the question nor the gust", (level) => {
    const treasure: Treasure = { kind: "amber", column: 30, row: 10 };
    const round = { ...startRound(herd, [], undefined, () => 0.5, level), treasure };
    const y = (treasure.row + 1.5) * 20;
    const found = brushRound(round, { from: { x: treasure.column * 20, y }, to: { x: (treasure.column + 3) * 20, y }, radius: 30 });
    expect(roundTreasureFound(round)).toBe(false);
    expect(roundTreasureFound(found)).toBe(true);
    expect([roundShare(found), found.blown, asking(found), found.found, found.quietMs]).toEqual([0, false, false, [], round.quietMs]);
  });

  it("is not found by the gust, and brushing it after the gust changes nothing", () => {
    const treasure: Treasure = { kind: "amber", column: 30, row: 10 };
    let round: DigRound = { ...startRound(herd, [], undefined, () => 0.5, "hatchling"), treasure };
    for (let y = 10; y < 600 && !round.blown; y += 20) round = brushRound(round, { from: { x: 0, y }, to: { x: 400, y }, radius: 10 });
    expect([round.blown, roundTreasureFound(round)]).toEqual([true, false]);
    const y = (treasure.row + 1.5) * 20;
    expect(brushRound(round, { from: { x: treasure.column * 20, y }, to: { x: (treasure.column + 3) * 20, y }, radius: 30 })).toBe(round);
  });
});
