import { describe, expect, it } from "vitest";
import { BRUSH_SIZES, brush, brushRound, clearCells, clearShare, GRID, GUST_SHARE, NEW_SAND, roundShare, startRound, type Cells, type DigDinosaur, type Mark } from "../src/dig/index.ts";
import { SHIPPED_DIG } from "./support.ts";

// The frame's pixels on a side of a cell.
const CELL = 20;

// Cells of the grid, those `own` gives over the dinosaur.
const cellsWhere = (own: (row: number, column: number) => boolean): Cells =>
  Array.from({ length: GRID.rows }, (_, row) => Array.from({ length: GRID.columns }, (_, column) => own(row, column)));

const dinosaur = (id: string, cells: Cells = cellsWhere(() => true)): DigDinosaur => ({ id, traits: [], spots: [], cells });

// A stroke down the whole height of the frame at `x`, `radius` wide
// either side.
const downAt = (x: number, radius: number): Mark => ({ from: { x, y: -100 }, to: { x, y: 700 }, radius });

const tapAt = (x: number, y: number, radius = 24): Mark => ({ from: { x, y }, to: { x, y }, radius });

const clearOf = (cells: Cells) => cells.flatMap((row, rowAt) => row.flatMap((clear, columnAt) => (clear ? [`${rowAt}:${columnAt}`] : [])));

describe("the sand", () => {
  it("covers every cell at the start", () => {
    expect(clearOf(clearCells(NEW_SAND))).toEqual([]);
  });

  it("clears a cell once the brush has passed over more than half of it, and not before", () => {
    // The brush's edge lies 40% and then 60% into the first column.
    const short = brush(NEW_SAND, downAt(-100, 100 + 0.4 * CELL));
    const past = brush(NEW_SAND, downAt(-100, 100 + 0.6 * CELL));

    expect(clearOf(clearCells(short))).toEqual([]);
    expect(clearOf(clearCells(past))).toEqual(Array.from({ length: GRID.rows }, (_, row) => `${row}:0`));
  });

  it("clears a round spot for a tap, under its middle", () => {
    const sand = brush(NEW_SAND, tapAt(410, 310));

    expect(clearOf(clearCells(sand))).toContain("15:20");
    expect(clearOf(clearCells(sand)).every((cell) => ["14", "15", "16"].includes(cell.split(":")[0] ?? ""))).toBe(true);
  });

  it("clears along a stroke from one point to another", () => {
    const sand = brush(NEW_SAND, { from: { x: 110, y: 310 }, to: { x: 690, y: 310 }, radius: 24 });

    const row = clearOf(clearCells(sand)).filter((cell) => cell.startsWith("15:"));
    // The brush's round ends reach past either end, more than half into
    // the cells beyond.
    expect(row).toEqual(Array.from({ length: 32 }, (_, at) => `15:${at + 4}`));
  });

  it("keeps the cleared sand clear when the same place is brushed again, the count only growing", () => {
    const once = brush(NEW_SAND, tapAt(200, 200));
    const again = brush(once, tapAt(200, 200));
    const more = brush(again, tapAt(260, 200));

    expect(clearOf(clearCells(again))).toEqual(clearOf(clearCells(once)));
    expect(clearOf(clearCells(more))).toEqual(expect.arrayContaining(clearOf(clearCells(once))));
    expect(clearOf(clearCells(more)).length).toBeGreaterThan(clearOf(clearCells(once)).length);
    expect(more.marks).toHaveLength(3);
  });

  it("counts only the dinosaur's cells towards its share", () => {
    const cells = cellsWhere((row, column) => row >= 10 && row < 20 && column >= 10 && column < 30);
    const corners = [tapAt(0, 0, 60), tapAt(800, 0, 60), tapAt(0, 600, 60), tapAt(800, 600, 60)].reduce(brush, NEW_SAND);

    expect(clearOf(clearCells(corners))).toEqual(expect.arrayContaining(["0:0", "0:39", "29:0", "29:39"]));
    expect(clearShare(corners, cells)).toBe(0);
    // The left half of the dinosaur's rows: half its cells.
    const half = brush(NEW_SAND, downAt(300, 100));
    expect(clearShare(half, cells)).toBe(0.5);
  });
});

describe("a round", () => {
  const dinosaurs = ["rex", "steg", "trike"].map((id) => dinosaur(id));

  it("digs up a dinosaur not dug up yet, at random", () => {
    expect(startRound(dinosaurs, ["rex"], undefined, () => 0).dinosaur.id).toBe("steg");
    expect(startRound(dinosaurs, ["rex"], undefined, () => 0.99).dinosaur.id).toBe("trike");
    expect(startRound(dinosaurs, ["rex", "trike"], undefined, () => 0.5).dinosaur.id).toBe("steg");
  });

  it("digs up any dinosaur but the last one once every one is dug up", () => {
    const dug = ["rex", "steg", "trike"];
    expect([0, 0.5, 0.99].map((draw) => startRound(dinosaurs, dug, "rex", () => draw).dinosaur.id)).toEqual(["steg", "trike", "trike"]);
  });

  it("starts under sand that covers it all", () => {
    const round = startRound(SHIPPED_DIG, [], undefined, () => 0);

    expect([roundShare(round), round.blown, round.sand.marks]).toEqual([0, false, []]);
  });

  it("blows the rest of the sand away once 70% of the dinosaur's cells are clear, and takes no stroke after", () => {
    // Ten columns of dinosaur: seven of them clear is 70%.
    const round = startRound([dinosaur("rex", cellsWhere((_, column) => column < 10))], [], undefined, () => 0);
    const six = brushRound(round, downAt(0, 6 * CELL - 2));
    const seven = brushRound(six, downAt(0, 7 * CELL - 2));

    expect([roundShare(six), six.blown]).toEqual([0.6, false]);
    expect([roundShare(seven), seven.blown, GUST_SHARE]).toEqual([0.7, true, 0.7]);
    expect(brushRound(seven, downAt(400, 400))).toBe(seven);
  });

  it("brushes 48 CSS pixels wide at Hatchling, and 36 at Explorer and Paleontologist", () => {
    expect(BRUSH_SIZES).toEqual({ hatchling: 48, explorer: 36, paleontologist: 36 });
  });
});
