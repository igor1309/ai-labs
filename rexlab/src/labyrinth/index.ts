export type Maze = {
  readonly id: string;
  readonly rows: readonly string[];
  readonly start: number;
  readonly goal: number;
};

// Dots are paths, read left to right and then down; hashes are walls.
export const MAZES: readonly Maze[] = [
  { id: "fern", start: 0, goal: 62, rows: ["...#.....", "##.#.###.", "...#...#.", ".#####.#.", ".....#...", ".###.###.", "...#....."] },
  { id: "grove", start: 0, goal: 62, rows: [".#.#.....", ".#.#.#.#.", ".#...#.#.", ".#####.#.", ".#...#.#.", ".#.#.#.#.", "...#...#."] },
  { id: "brook", start: 0, goal: 62, rows: [".#.......", ".#####.#.", ".....#.#.", "####.###.", "...#.....", ".#.#####.", ".#......."] }
];

// The caller supplies its random sample so replay selection has no clock
// or browser dependency. Removing the previous maze makes repeats impossible.
export function nextMaze(previous: string | undefined, sample: number): Maze {
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("A maze sample must be at least zero and less than one");
  const choices = MAZES.filter((maze) => maze.id !== previous);
  return choices[Math.floor(sample * choices.length)]!;
}

export type LabyrinthRound = {
  readonly maze: Maze;
  readonly position: number;
  readonly from: number;
  readonly hint: number | undefined;
};

export function startMaze(maze: Maze): LabyrinthRound {
  return { maze, position: maze.start, from: maze.start, hint: undefined };
}

export function isPath(maze: Maze, place: number): boolean {
  const columns = maze.rows[0]!.length;
  return Number.isInteger(place) && place >= 0 && maze.rows[Math.floor(place / columns)]?.[place % columns] === ".";
}

export function adjacentPaths(maze: Maze, place: number): number[] {
  if (!isPath(maze, place)) return [];
  const columns = maze.rows[0]!.length;
  return [place - columns, place + 1, place + columns, place - 1].filter((next) =>
    isPath(maze, next) && Math.abs(next % columns - place % columns) + Math.abs(Math.floor(next / columns) - Math.floor(place / columns)) === 1
  );
}

export const mazeSolved = (round: LabyrinthRound): boolean => round.position === round.maze.goal;

export function moveInMaze(round: LabyrinthRound, destination: number): LabyrinthRound {
  if (mazeSolved(round) || !adjacentPaths(round.maze, round.position).includes(destination)) return round;
  return { ...round, from: round.position, position: destination, hint: undefined };
}

// Search back from the goal: each visited cell remembers its next step
// home, so help works from a dead end as well as from the main route.
export function hintInMaze(round: LabyrinthRound): LabyrinthRound {
  if (mazeSolved(round)) return round;
  const towardGoal = new Map<number, number>([[round.maze.goal, round.maze.goal]]);
  const queue = [round.maze.goal];
  for (let at = 0; at < queue.length; at++) {
    const place = queue[at]!;
    if (place === round.position) return { ...round, hint: towardGoal.get(place) };
    for (const next of adjacentPaths(round.maze, place)) {
      if (towardGoal.has(next)) continue;
      towardGoal.set(next, place);
      queue.push(next);
    }
  }
  return round;
}
