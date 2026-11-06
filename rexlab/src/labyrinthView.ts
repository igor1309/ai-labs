import type { SizeClass } from "./sizeClass.ts";
import type { AgeLevel } from "./ageLevel.ts";

// How the board shows a maze in a window: upright windows turn it on its
// side so it fits whole where it can, and a window too small for it pans
// a view over it that follows the baby. All of it is plain arithmetic, kept
// apart from the screen so it can be tested without a browser.

// The upright iPad turns every maze; an upright phone only HATCHLING's,
// which then fits whole. The larger mazes keep their rows there and pan.
export function turnedFor(level: AgeLevel, size: SizeClass): boolean {
  return size === "tall" || size === "tall-narrow" && level === "hatchling";
}

// A maze place seen in the turned board, and back: column and row swap.
export type MazeTurn = {
  readonly columns: number;
  readonly rows: number;
  toView(place: number): number;
  toMaze(place: number): number;
};

export function turnMaze(columns: number, rows: number, turned: boolean): MazeTurn {
  if (!turned) return { columns, rows, toView: (place) => place, toMaze: (place) => place };
  return {
    columns: rows,
    rows: columns,
    toView: (place) => (place % columns) * rows + Math.floor(place / columns),
    toMaze: (place) => (place % rows) * columns + Math.floor(place / rows)
  };
}

export type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
export type Scroll = { readonly left: number; readonly top: number };
export type Size = { readonly width: number; readonly height: number };

const clamp = (value: number, least: number, most: number) => Math.min(Math.max(value, least), Math.max(least, most));

// The scroll that keeps the baby's cell in view with `margin` to spare on
// each side, moving as little as it can. Where the view is too small for
// the margin, it centers the cell. It never scrolls past the maze.
export function follow(view: Size, content: Size, cell: Box, scroll: Scroll, margin: number): Scroll {
  const axis = (start: number, extent: number, at: number, length: number, total: number) => {
    const room = Math.min(margin, Math.max(0, (extent - length) / 2));
    const next = clamp(start, at + length + room - extent, at - room);
    return clamp(next, 0, total - extent);
  };
  return {
    left: axis(scroll.left, view.width, cell.left, cell.width, content.width),
    top: axis(scroll.top, view.height, cell.top, cell.height, content.height)
  };
}

export type Edge = "left" | "right" | "top" | "bottom";

// The edges past which more maze lies, where the view fades.
export function moreBeyond(view: Size, content: Size, scroll: Scroll): Record<Edge, boolean> {
  return {
    left: scroll.left > 0.5,
    right: scroll.left + view.width < content.width - 0.5,
    top: scroll.top > 0.5,
    bottom: scroll.top + view.height < content.height - 0.5
  };
}

// Where the parent marker stands while home is out of view: the edge
// toward home, the farther way when it lies past two, and how far along
// that edge home is, kept within it. Home in view needs no marker.
export function markerFor(view: Size, goal: Box, scroll: Scroll): { edge: Edge; along: number } | undefined {
  const x = goal.left + goal.width / 2 - scroll.left;
  const y = goal.top + goal.height / 2 - scroll.top;
  const past = {
    left: -x, right: x - view.width, top: -y, bottom: y - view.height
  };
  const inView = goal.left >= scroll.left - 0.5 && goal.left + goal.width <= scroll.left + view.width + 0.5 &&
    goal.top >= scroll.top - 0.5 && goal.top + goal.height <= scroll.top + view.height + 0.5;
  if (inView) return undefined;
  const edge = (Object.keys(past) as Edge[]).reduce((most, side) => past[side] > past[most] ? side : most);
  const horizontal = edge === "left" || edge === "right";
  return { edge, along: horizontal ? clamp(y, 0, view.height) : clamp(x, 0, view.width) };
}
