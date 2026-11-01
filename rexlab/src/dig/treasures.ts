import type { Random } from "./round.ts";
import { GRID, type Cells } from "./spots.ts";

// The treasures a round's sand may hide, in the FIELD GUIDE's order.
export const TREASURE_KINDS = ["shell", "tooth", "amber", "egg-nest", "golden-fossil"] as const;

export type TreasureKind = (typeof TREASURE_KINDS)[number];

// About one round in three hides a treasure, at every level.
export const TREASURE_ROUNDS = 1 / 3;

// The chance of each kind once a round hides one: the golden fossil and
// the egg nest are rare, and the shell, tooth and amber share the rest.
const GOLDEN_FOSSIL = 1 / 20;
const EGG_NEST = 1 / 8;
const COMMON = (1 - GOLDEN_FOSSIL - EGG_NEST) / 3;
export const TREASURE_CHANCES: Readonly<Record<TreasureKind, number>> = { shell: COMMON, tooth: COMMON, amber: COMMON, "egg-nest": EGG_NEST, "golden-fossil": GOLDEN_FOSSIL };

// The cells a treasure covers along each side: about as wide as the
// dinosaur's eye, so a child sees it clearly without hunting for it.
export const TREASURE_CELLS = 3;

// A treasure in a round's sand: its kind and the cell of its top left
// corner, column and row.
export type Treasure = { kind: TreasureKind; column: number; row: number };

// The kind a draw from 0 up to 1 gives, each kind taking its chance of
// the range in the FIELD GUIDE's order.
export function treasureKind(draw: number): TreasureKind {
  let below = 0;
  for (const kind of TREASURE_KINDS) {
    below += TREASURE_CHANCES[kind];
    if (draw < below) return kind;
  }
  return "golden-fossil";
}

// Each cell a treasure at `column` and `row` covers, as its column and row.
export function treasureCells({ column, row }: Pick<Treasure, "column" | "row">): Array<[number, number]> {
  return Array.from({ length: TREASURE_CELLS * TREASURE_CELLS }, (_, at) => [column + (at % TREASURE_CELLS), row + Math.floor(at / TREASURE_CELLS)]);
}

// Every place a treasure may lie, row by row: wholly on cells that hold
// none of the dinosaur, so it never hides a part of it, and at least one
// cell from the board's edge.
export function treasurePlaces(cells: Cells): Array<{ column: number; row: number }> {
  const places: Array<{ column: number; row: number }> = [];
  for (let row = 1; row + TREASURE_CELLS <= GRID.rows - 1; row++) {
    for (let column = 1; column + TREASURE_CELLS <= GRID.columns - 1; column++) {
      if (treasureCells({ column, row }).every(([x, y]) => cells[y]?.[x] === false)) places.push({ column, row });
    }
  }
  return places;
}

// The treasure a round's sand hides, if any: whether it hides one, then
// its kind, then its place among those beside `cells`, the dinosaur's.
// A dinosaur that leaves no place hides none.
export function drawTreasure(cells: Cells, random: Random): Treasure | undefined {
  if (random() >= TREASURE_ROUNDS) return undefined;
  const kind = treasureKind(random());
  const places = treasurePlaces(cells);
  const place = places[Math.min(places.length - 1, Math.floor(random() * places.length))];
  return place && { kind, ...place };
}

// A treasure is found once more than half of its cells are clear.
export function treasureFound(treasure: Treasure, clear: Cells): boolean {
  const own = treasureCells(treasure);
  return own.filter(([column, row]) => clear[row]?.[column] === true).length * 2 > own.length;
}
