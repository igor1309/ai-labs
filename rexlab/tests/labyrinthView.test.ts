import { describe, expect, it } from "vitest";
import { follow, markerFor, moreBeyond, turnedFor, turnMaze } from "../src/labyrinthView.ts";

const cell = (column: number, row: number) => ({ left: 8 + column * 48, top: 8 + row * 48, width: 48, height: 48 });

describe("the turned maze", () => {
  it("turns every maze on an upright iPad and only HATCHLING's on an upright phone", () => {
    expect(["hatchling", "explorer", "paleontologist"].map((level) => turnedFor(level as never, "tall"))).toEqual([true, true, true]);
    expect(["hatchling", "explorer", "paleontologist"].map((level) => turnedFor(level as never, "tall-narrow"))).toEqual([true, true, true]);
    for (const size of ["wide", "wide-short"] as const) expect(turnedFor("hatchling", size)).toBe(false);
  });

  it("swaps columns and rows, and maps every place there and back", () => {
    const turn = turnMaze(9, 7, true);
    expect([turn.columns, turn.rows]).toEqual([7, 9]);
    // The maze's column 3 of row 1 is the turned board's column 1 of row 3.
    expect(turn.toView(1 * 9 + 3)).toBe(3 * 7 + 1);
    const places = Array.from({ length: 63 }, (_, place) => place);
    expect(places.map((place) => turn.toMaze(turn.toView(place)))).toEqual(places);
    expect(new Set(places.map(turn.toView)).size).toBe(63);
  });

  it("keeps an unturned maze as it is", () => {
    const turn = turnMaze(15, 9, false);
    expect([turn.columns, turn.rows, turn.toView(20), turn.toMaze(20)]).toEqual([15, 9, 20, 20]);
  });
});

describe("the view following the baby", () => {
  const view = { width: 361, height: 448 };
  const content = { width: 736, height: 448 };

  it("stays still while the baby has room ahead", () => {
    expect(follow(view, content, cell(3, 4), { left: 0, top: 0 }, 72)).toEqual({ left: 0, top: 0 });
  });

  it("moves as little as keeps a cell and a half ahead in view", () => {
    // Column 6 ends at 344; with 72 to spare the view must reach 416.
    expect(follow(view, content, cell(6, 4), { left: 0, top: 0 }, 72)).toEqual({ left: 416 - 361, top: 0 });
    expect(follow(view, content, cell(4, 4), { left: 300, top: 0 }, 72)).toEqual({ left: 8 + 4 * 48 - 72, top: 0 });
  });

  it("never scrolls past the maze", () => {
    expect(follow(view, content, cell(14, 0), { left: 0, top: 0 }, 72)).toEqual({ left: 736 - 361, top: 0 });
    expect(follow(view, content, cell(0, 0), { left: 200, top: 0 }, 72)).toEqual({ left: 0, top: 0 });
  });

  it("pans both ways and centers a cell where the view is too small for the margin", () => {
    const small = { width: 100, height: 100 };
    expect(follow(small, { width: 736, height: 444 }, cell(5, 5), { left: 0, top: 0 }, 72)).toEqual({ left: 8 + 5 * 48 - 26, top: 8 + 5 * 48 - 26 });
  });
});

describe("the edges of the view", () => {
  it("fades only where more maze lies", () => {
    expect(moreBeyond({ width: 361, height: 448 }, { width: 736, height: 448 }, { left: 0, top: 0 })).toEqual({ left: false, right: true, top: false, bottom: false });
    expect(moreBeyond({ width: 500, height: 296 }, { width: 732, height: 444 }, { left: 100, top: 74 })).toEqual({ left: true, right: true, top: true, bottom: true });
    expect(moreBeyond({ width: 444, height: 444 }, { width: 444, height: 444 }, { left: 0, top: 0 })).toEqual({ left: false, right: false, top: false, bottom: false });
  });

  it("shows the parent marker on the edge toward home only while home is out of view", () => {
    const view = { width: 361, height: 448 };
    expect(markerFor(view, cell(5, 8), { left: 0, top: 0 })).toBeUndefined();
    expect(markerFor(view, cell(14, 8), { left: 0, top: 0 })).toEqual({ edge: "right", along: 8 + 8 * 48 + 24 });
    expect(markerFor(view, cell(0, 2), { left: 300, top: 0 })).toEqual({ edge: "left", along: 8 + 2 * 48 + 24 });
  });

  it("points the farther way when home lies past two edges, and keeps the marker on its edge", () => {
    const view = { width: 500, height: 296 };
    expect(markerFor(view, cell(9, 8), { left: 0, top: 0 })).toEqual({ edge: "bottom", along: 8 + 9 * 48 + 24 });
    expect(markerFor(view, cell(14, 6), { left: 0, top: 0 })).toEqual({ edge: "right", along: 296 });
  });

  it("counts a home cut by an edge as out of view", () => {
    expect(markerFor({ width: 361, height: 448 }, cell(7, 0), { left: 0, top: 0 })?.edge).toBe("right");
  });
});
