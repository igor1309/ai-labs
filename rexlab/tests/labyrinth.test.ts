import { describe, expect, it, vi } from "vitest";
import { adjacentPaths, hintInMaze, isPath, mazeSolved, moveInMaze, nextMaze, rewardMaze, startMaze, type Maze, type MazeLevel } from "../src/labyrinth/index.ts";

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

function assertGraph(maze: Maze) {
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
}

const samples = Array.from({ length: 128 }, (_, seed) => seed / 128);
const movementMazes = LEVELS.flatMap(({ level }) => [0, 0.25, 0.75].map((sample) => nextMaze(level, undefined, sample)));

function shapeOf(maze: Maze): string {
  const rows = maze.rows;
  const reflected = rows.map((row) => [...row].reverse().join(""));
  return [rows, [...rows].reverse(), reflected, [...reflected].reverse()].map((shape) => shape.join("/")).sort()[0]!;
}

describe("seeded procedural maze graphs", () => {
  it.each(LEVELS)("independently verifies 128 seeds and non-reflected shapes at $level", ({ level }) => {
    const mazes = samples.map((sample) => nextMaze(level, undefined, sample));
    for (const maze of mazes) assertGraph(maze);
    expect(new Set(mazes.map((maze) => maze.id)).size).toBeGreaterThanOrEqual(100);
    expect(new Set(mazes.map(shapeOf)).size).toBeGreaterThanOrEqual(100);
    expect(new Set(mazes.map((maze) => maze.start)).size).toBeGreaterThan(1);
    expect(new Set(mazes.map((maze) => maze.goal)).size).toBeGreaterThan(1);
  });

  it.each(LEVELS)("constructs qualifying varied trees at $level with no candidate search", ({ level }) => {
    const mazes = samples.map((sample) => nextMaze(level, undefined, sample, { searchAttempts: 0 }));
    for (const maze of mazes) assertGraph(maze);
    // Guaranteed arms limit the smallest board's shape space, but it
    // still varies beyond endpoint changes and the four reflections.
    expect(new Set(mazes.map(shapeOf)).size).toBeGreaterThanOrEqual(16);
  });

  it.each(LEVELS)("replays identical inputs without sharing mutable boards at $level", ({ level }) => {
    const previousIds = [undefined, "unknown", ...LEVELS.map(({ level }) => nextMaze(level, undefined, 0).id)];
    for (const previous of previousIds) {
      for (const sample of [0, Number.MIN_VALUE, 0.123456789, 1 - Number.EPSILON]) {
        const maze = nextMaze(level, previous, sample);
        nextMaze(level, maze.id, 0.9);
        const replayed = nextMaze(level, previous, sample);
        expect(replayed).toEqual(maze);
        expect(replayed).not.toBe(maze);
        expect(replayed.rows).not.toBe(maze.rows);
        expect(maze.id).toBe(`${maze.rows[0]!.length}x${maze.rows.length}:${maze.rows.join("/")}`);
        expect(maze.level).toBe(level);
      }
    }
  });

  it.each(LEVELS)("excludes previous walls under constant samples and bounded work at $level", ({ level, columns, rows }) => {
    const vertices = (columns + 1) * (rows + 1) / 4;
    for (const searchAttempts of [0, 1, 16]) {
      for (const sample of [0, 0.5, 1 - Number.EPSILON]) {
        let previous: Maze | undefined;
        for (let round = 0; round < 100; round++) {
          const work = { search: 0, construction: 0, visit: 0 };
          const maze = nextMaze(level, previous?.id, sample, { searchAttempts, onWork: (kind) => work[kind]++ });
          assertGraph(maze);
          expect(maze.rows).not.toEqual(previous?.rows);
          expect(maze.id).not.toBe(previous?.id);
          expect(maze.level).toBe(level);
          expect(work.search).toBeLessThanOrEqual(searchAttempts);
          expect(work.construction).toBeLessThanOrEqual(1);
          if (searchAttempts === 0) expect(work.construction).toBe(1);
          // Each tree has at most N² root visits, 2(N−1) directed
          // depth visits, 2N carving visits and N rendering visits.
          expect(work.visit).toBeLessThanOrEqual((searchAttempts + 1) * (vertices * vertices + 6 * vertices));
          expect(nextMaze(level, previous?.id, sample, { searchAttempts })).toEqual(maze);
          previous = maze;
        }
      }
    }
  });

  it.each(LEVELS)("uses construction after exhausting a nonzero search budget at $level", ({ level }) => {
    let constructions = 0;
    for (const sample of samples) {
      let searches = 0;
      const maze = nextMaze(level, undefined, sample, {
        searchAttempts: 1,
        onWork: (kind) => { if (kind === "search") searches++; if (kind === "construction") constructions++; }
      });
      expect(searches).toBe(1);
      assertGraph(maze);
    }
    expect(constructions).toBeGreaterThan(0);
  });

  it.each([-1, 1, NaN, Infinity, -Infinity, undefined, null, "0.5"])("rejects an invalid sample: %s", (sample) => {
    for (const { level } of LEVELS) expect(() => nextMaze(level, undefined, sample as number)).toThrow(RangeError);
  });

  it.each(["", "unknown", "__proto__", "constructor", undefined, null])("rejects an invalid level: %s", (level) => {
    expect(() => nextMaze(level as MazeLevel, undefined, 0)).toThrow(RangeError);
  });

  it.each([-1, 0.5, 17, NaN, Infinity])("rejects an unbounded or invalid search budget: %s", (searchAttempts) => {
    expect(() => nextMaze("explorer", undefined, 0, { searchAttempts })).toThrow(RangeError);
  });

  it.each([null, 123, {}, []])("rejects a previous layout that is not an id: %s", (previous) => {
    expect(() => nextMaze("explorer", previous as unknown as string, 0)).toThrow(TypeError);
  });
});

describe("one-space movement", () => {
  it.each(movementMazes)("accepts only adjacent open cells and permits backtracking in $id", (maze) => {
    const graph = graphOf(maze);
    const initial = startMaze(maze);
    expect(initial).toEqual({ maze, position: maze.start, from: maze.start, hint: undefined, hinted: false });
    for (const position of paths(maze)) {
      const round = { ...initial, position, hint: maze.goal };
      expect(adjacentPaths(maze, position).sort((a, b) => a - b)).toEqual(graph.get(position));
      for (const destination of [-10, -1, 0.5, NaN, Infinity, ...Array.from({ length: maze.rows.length * maze.rows[0]!.length + 1 }, (_, at) => at)]) {
        const moved = moveInMaze(round, destination);
        if (position !== maze.goal && graph.get(position)!.includes(destination)) {
          expect(moved).toEqual({ maze, from: position, position: destination, hint: undefined, hinted: false });
          if (destination !== maze.goal) expect(moveInMaze(moved, position).position).toBe(position);
        } else {
          expect(moved).toBe(round);
        }
      }
      expect(round.hint).toBe(maze.goal);
    }
  });

  it.each(movementMazes)("never treats walls or out-of-bounds positions as paths in $id", (maze) => {
    for (const place of [-1, maze.rows.length * maze.rows[0]!.length, 1.5, NaN, Infinity, ...maze.rows.join("").split("").flatMap((cell, at) => cell === "#" ? [at] : [])]) {
      expect(isPath(maze, place)).toBe(false);
      expect(adjacentPaths(maze, place)).toEqual([]);
    }
  });
});

describe("optional one-step help", () => {
  it.each(movementMazes)("points one step closer from every path, including dead ends in $id", (maze) => {
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

describe("labyrinth rewards", () => {
  it.each(["hatchling", "explorer", "paleontologist"] as const)("scores only a solved %s round through the given best rule, preserving other bests and inputs", (level) => {
    const maze: Maze = { id: "reward", level, rows: ["..."], start: 0, goal: 2 };
    for (const hinted of [false, true]) {
      const round = { ...startMaze(maze), hinted };
      const progress = { stars: 12, roundsPlayed: 4, best: { hatchling: 1, explorer: 2, paleontologist: 3 } };
      const beat = vi.fn(() => ({ best: 3, celebration: "new-best" as const }));
      expect(rewardMaze(round, progress, beat)).toBeUndefined();
      expect(beat).not.toHaveBeenCalled();
      const reward = rewardMaze({ ...round, position: maze.goal }, progress, beat);
      expect(beat).toHaveBeenCalledExactlyOnceWith(progress.best[level], 3);
      expect(reward).toEqual({
        progress: { stars: 15, roundsPlayed: 5, best: { ...progress.best, [level]: 3 } },
        best: 3, celebration: "new-best", beaten: progress.best[level]
      });
      expect(progress).toEqual({ stars: 12, roundsPlayed: 4, best: { hatchling: 1, explorer: 2, paleontologist: 3 } });
      expect(round.position).toBe(maze.start);
    }
  });
});
