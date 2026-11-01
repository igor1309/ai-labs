import { FRAME, GRID, type Cells } from "./spots.ts";

// A point on the body picture, in the pixels of its frame.
export type FramePoint = { x: number; y: number };

// One stroke of the brush: the round brush drawn from one point to
// another, a tap from a point to itself, `radius` wide either side, all
// in the frame's pixels.
export type Mark = { from: FramePoint; to: FramePoint; radius: number };

// The sand over the picture: every mark brushed, in order, and where it
// has passed. A cell is measured at points SAMPLES by SAMPLES over it, so
// "more than half of it" is a count, whatever the marks' shapes.
export type Sand = {
  marks: readonly Mark[];
  // Whether the brush has passed over each point, row by row.
  brushed: Readonly<Uint8Array>;
  // How many of each cell's points it has passed over, row by row.
  counts: Readonly<Uint8Array>;
};

// The points measured across each side of a cell: an odd number, so half
// of a cell is never a tie.
const SAMPLES = 5;
const COLUMNS = GRID.columns * SAMPLES;
const ROWS = GRID.rows * SAMPLES;
const STEP = FRAME.width / COLUMNS;

export const NEW_SAND: Sand = { marks: [], brushed: new Uint8Array(COLUMNS * ROWS), counts: new Uint8Array(GRID.columns * GRID.rows) };

// How far `point` lies from the segment `from`–`to`.
function distance({ from, to }: Mark, point: FramePoint): number {
  const [dx, dy] = [to.x - from.x, to.y - from.y];
  const length = dx * dx + dy * dy;
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length));
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}

// The sand with `mark` brushed: every point within its radius of its
// stroke is passed over, and stays so. Only the points around the stroke
// are measured, and the counts are copied only once a point is new.
export function brush(sand: Sand, mark: Mark): Sand {
  const index = (at: number, count: number) => Math.max(0, Math.min(count - 1, Math.floor(at / STEP)));
  const [left, right] = [Math.min(mark.from.x, mark.to.x) - mark.radius, Math.max(mark.from.x, mark.to.x) + mark.radius];
  const [top, bottom] = [Math.min(mark.from.y, mark.to.y) - mark.radius, Math.max(mark.from.y, mark.to.y) + mark.radius];
  let brushed: Uint8Array | undefined;
  let counts: Uint8Array | undefined;
  for (let row = index(top, ROWS); row <= index(bottom, ROWS); row++) {
    for (let column = index(left, COLUMNS); column <= index(right, COLUMNS); column++) {
      const at = row * COLUMNS + column;
      if ((brushed ?? sand.brushed)[at] === 1) continue;
      if (distance(mark, { x: (column + 0.5) * STEP, y: (row + 0.5) * STEP }) > mark.radius) continue;
      brushed ??= sand.brushed.slice();
      counts ??= sand.counts.slice();
      brushed[at] = 1;
      const cell = Math.floor(row / SAMPLES) * GRID.columns + Math.floor(column / SAMPLES);
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  return { marks: [...sand.marks, mark], brushed: brushed ?? sand.brushed, counts: counts ?? sand.counts };
}

// Which cells are clear, the brush having passed over more than half of
// each, row by row, as the dinosaur's cells are given.
export function clearCells(sand: Sand): Cells {
  return Array.from({ length: GRID.rows }, (_, row) =>
    Array.from({ length: GRID.columns }, (_, column) => (sand.counts[row * GRID.columns + column] ?? 0) * 2 > SAMPLES * SAMPLES)
  );
}

// The share of the dinosaur's cells that are clear, from 0 to 1: a cell
// beside the dinosaur never counts.
export function clearShare(sand: Sand, cells: Cells): number {
  const clear = clearCells(sand);
  const own = cells.flatMap((row, rowAt) => row.flatMap((over, columnAt) => (over ? [clear[rowAt]?.[columnAt] === true] : [])));
  return own.length === 0 ? 0 : own.filter(Boolean).length / own.length;
}
