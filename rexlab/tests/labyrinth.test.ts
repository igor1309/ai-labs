import { describe, expect, it } from "vitest";
import { adjacentPaths, hintInMaze, isPath, MAZES, mazeSolved, moveInMaze, nextMaze, startMaze, type Maze } from "../src/labyrinth/index.ts";

const paths = (maze: Maze) => maze.rows.flatMap((row, y) => [...row].flatMap((cell, x) => cell === "." ? [y * row.length + x] : []));

// Read connections as coordinates, independently of the movement rule.
function graphOf(maze: Maze) {
  const columns = maze.rows[0]!.length;
  const open = paths(maze);
  return new Map(open.map((place) => [place, open.filter((other) =>
    Math.abs(place % columns - other % columns) + Math.abs(Math.floor(place / columns) - Math.floor(other / columns)) === 1
  )]));
}

describe("fixed Hatchling mazes", () => {
  it("ships at least three distinct layouts", () => {
    expect(new Set(MAZES.map((maze) => maze.rows.join("\n"))).size).toBeGreaterThanOrEqual(3);
    expect(new Set(MAZES.map((maze) => maze.id)).size).toBe(MAZES.length);
  });

  it.each(MAZES)("connects every path and the goal, with branching dead ends in $id", (maze) => {
    expect(maze.rows).toHaveLength(7);
    expect(maze.rows.every((row) => row.length === 9 && /^[.#]+$/.test(row))).toBe(true);
    const graph = graphOf(maze);
    const visited = new Set([maze.start]);
    const queue = [maze.start];
    for (let at = 0; at < queue.length; at++) {
      for (const next of graph.get(queue[at]!)!) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    expect([...visited].sort((a, b) => a - b)).toEqual(paths(maze));
    expect(visited.has(maze.goal)).toBe(true);
    expect(maze.goal).not.toBe(maze.start);
    expect([...graph.values()].some((neighbors) => neighbors.length >= 3)).toBe(true);
    expect([...graph].some(([place, neighbors]) => place !== maze.start && place !== maze.goal && neighbors.length === 1)).toBe(true);
  });

  it.each([undefined, "unknown", ...MAZES.map((maze) => maze.id)])("selects every available layout without repeating %s", (previous) => {
    const choices = MAZES.filter((maze) => maze.id !== previous);
    expect(choices.map((_, at) => nextMaze(previous, (at + 0.5) / choices.length))).toEqual(choices);
    expect(nextMaze(previous, 0)).toBe(choices[0]);
    expect(nextMaze(previous, 0.999999)).toBe(choices.at(-1));
  });

  it.each([-1, 1, NaN, Infinity])("rejects a random sample outside zero to one: %s", (sample) => {
    expect(() => nextMaze(undefined, sample)).toThrow(RangeError);
  });
});

describe("one-space movement", () => {
  it.each(MAZES)("accepts only adjacent open cells and permits backtracking in $id", (maze) => {
    const graph = graphOf(maze);
    const initial = startMaze(maze);
    expect(initial).toEqual({ maze, position: maze.start, from: maze.start, hint: undefined });
    for (const position of paths(maze)) {
      const round = { ...initial, position, hint: maze.goal };
      expect(adjacentPaths(maze, position).sort((a, b) => a - b)).toEqual(graph.get(position));
      for (const destination of [-10, -1, 0.5, NaN, Infinity, ...Array.from({ length: 64 }, (_, at) => at)]) {
        const moved = moveInMaze(round, destination);
        if (position !== maze.goal && graph.get(position)!.includes(destination)) {
          expect(moved).toEqual({ maze, from: position, position: destination, hint: undefined });
          if (destination !== maze.goal) expect(moveInMaze(moved, position).position).toBe(position);
        } else {
          expect(moved).toBe(round);
        }
      }
      expect(round.hint).toBe(maze.goal);
    }
  });

  it.each(MAZES)("never treats walls or out-of-bounds positions as paths in $id", (maze) => {
    for (const place of [-1, 63, 1.5, NaN, Infinity, ...maze.rows.join("").split("").flatMap((cell, at) => cell === "#" ? [at] : [])]) {
      expect(isPath(maze, place)).toBe(false);
      expect(adjacentPaths(maze, place)).toEqual([]);
    }
  });
});

describe("optional one-step help", () => {
  it.each(MAZES)("points one step closer from every path, including dead ends in $id", (maze) => {
    const graph = graphOf(maze);
    const distance = new Map([[maze.goal, 0]]);
    const queue = [maze.goal];
    for (let at = 0; at < queue.length; at++) {
      const place = queue[at]!;
      for (const next of graph.get(place)!) {
        if (distance.has(next)) continue;
        distance.set(next, distance.get(place)! + 1);
        queue.push(next);
      }
    }
    for (const position of paths(maze)) {
      const round = { ...startMaze(maze), position };
      const helped = hintInMaze(round);
      expect(helped.position).toBe(position);
      expect(helped.from).toBe(round.from);
      expect(helped.maze).toBe(maze);
      expect(round.hint).toBeUndefined();
      if (position === maze.goal) {
        expect(helped).toBe(round);
        expect(mazeSolved(helped)).toBe(true);
      } else {
        expect(graph.get(position)).toContain(helped.hint);
        expect(distance.get(helped.hint!)).toBe(distance.get(position)! - 1);
        expect(hintInMaze(helped)).toEqual(helped);
        const moved = moveInMaze(helped, helped.hint!);
        expect(moved.hint).toBeUndefined();
        expect(mazeSolved(moved)).toBe(helped.hint === maze.goal);
      }
    }
  });
});
