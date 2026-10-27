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

const LEVELS = [
  { level: "hatchling", columns: 9, rows: 7, steps: 14, decisions: 2, detours: 1 },
  { level: "explorer", columns: 15, rows: 9, steps: 32, decisions: 4, detours: 3 },
  { level: "paleontologist", columns: 17, rows: 11, steps: 50, decisions: 6, detours: 4 }
] as const;

describe("fixed maze graphs", () => {
  it("ships at least six distinct layouts at each level, with globally unique ids", () => {
    for (const { level } of LEVELS) {
      const layouts = MAZES.filter((maze) => maze.level === level);
      expect(new Set(layouts.map((maze) => maze.rows.join("\n"))).size).toBeGreaterThanOrEqual(6);
    }
    expect(new Set(MAZES.map((maze) => maze.id)).size).toBe(MAZES.length);
  });

  it.each(MAZES)("connects every path and meets every difficulty threshold in $id ($level)", (maze) => {
    const required = LEVELS.find(({ level }) => level === maze.level)!;
    expect(maze.rows).toHaveLength(required.rows);
    expect(maze.rows.every((row) => row.length === required.columns && /^[.#]+$/.test(row))).toBe(true);
    const graph = graphOf(maze);
    expect(graph.has(maze.start)).toBe(true);
    expect(graph.has(maze.goal)).toBe(true);
    const previous = new Map<number, number | undefined>([[maze.start, undefined]]);
    const queue = [maze.start];
    for (let at = 0; at < queue.length; at++) {
      for (const next of graph.get(queue[at]!)!) {
        if (previous.has(next)) continue;
        previous.set(next, queue[at]!);
        queue.push(next);
      }
    }
    expect([...previous.keys()].sort((a, b) => a - b)).toEqual(paths(maze));
    expect(previous.has(maze.goal)).toBe(true);
    expect(maze.goal).not.toBe(maze.start);
    // Connected trees have a unique solution, so no other shorter route
    // can bypass the decisions measured below.
    expect([...graph.values()].reduce((sum, neighbors) => sum + neighbors.length, 0)).toBe(2 * (graph.size - 1));
    const solution: number[] = [];
    for (let place: number | undefined = maze.goal; place !== undefined; place = previous.get(place)) solution.push(place);
    expect(solution.length - 1).toBeGreaterThanOrEqual(required.steps);
    const route = new Set(solution);
    let decisions = 0;
    let detours = 0;
    for (const junction of solution.slice(1, -1)) {
      const wrong = graph.get(junction)!.filter((place) => !route.has(place));
      if (wrong.length === 0) continue;
      decisions++;
      const reachesLongDeadEnd = wrong.some((branch) => {
        const distance = new Map([[junction, 0], [branch, 1]]);
        const pending = [branch];
        for (let at = 0; at < pending.length; at++) {
          const place = pending[at]!;
          if (graph.get(place)!.length === 1 && distance.get(place)! >= 4) return true;
          for (const next of graph.get(place)!) {
            if (distance.has(next) || route.has(next)) continue;
            distance.set(next, distance.get(place)! + 1);
            pending.push(next);
          }
        }
        return false;
      });
      // Count distinct junctions, even if one has several long dead ends.
      if (reachesLongDeadEnd) detours++;
    }
    expect(decisions).toBeGreaterThanOrEqual(required.decisions);
    expect(detours).toBeGreaterThanOrEqual(required.detours);
  });

  it.each(LEVELS)("selects every layout at $level without repeating or changing level", ({ level }) => {
    for (const previous of [undefined, "unknown", ...MAZES.map((maze) => maze.id)]) {
      const choices = MAZES.filter((maze) => maze.level === level && maze.id !== previous);
      expect(choices.map((_, at) => nextMaze(level, previous, (at + 0.5) / choices.length))).toEqual(choices);
      expect(nextMaze(level, previous, 0)).toBe(choices[0]);
      expect(nextMaze(level, previous, 0.999999)).toBe(choices.at(-1));
    }
  });

  it.each([-1, 1, NaN, Infinity])("rejects a random sample outside zero to one: %s", (sample) => {
    for (const { level } of LEVELS) expect(() => nextMaze(level, undefined, sample)).toThrow(RangeError);
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
      for (const destination of [-10, -1, 0.5, NaN, Infinity, ...Array.from({ length: maze.rows.length * maze.rows[0]!.length + 1 }, (_, at) => at)]) {
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
    for (const place of [-1, maze.rows.length * maze.rows[0]!.length, 1.5, NaN, Infinity, ...maze.rows.join("").split("").flatMap((cell, at) => cell === "#" ? [at] : [])]) {
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
