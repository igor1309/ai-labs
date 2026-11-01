export type MazeLevel = "hatchling" | "explorer" | "paleontologist";

export type Maze = {
  readonly id: string;
  readonly level: MazeLevel;
  readonly rows: readonly string[];
  readonly start: number;
  readonly goal: number;
};

type Difficulty = { columns: number; rows: number; steps: number; decisions: number; detours: number };

const DIFFICULTIES: Readonly<Record<MazeLevel, Difficulty>> = {
  hatchling: { columns: 9, rows: 7, steps: 14, decisions: 2, detours: 1 },
  explorer: { columns: 15, rows: 9, steps: 32, decisions: 4, detours: 3 },
  paleontologist: { columns: 17, rows: 11, steps: 50, decisions: 6, detours: 4 }
};

type Tree = number[][];
type Random = () => number;
export type MazeGenerationOptions = {
  // A smaller search budget trades free-form trees for constructive ones.
  readonly searchAttempts?: number;
  // Reports bounded graph work without depending on a clock or browser.
  readonly onWork?: (kind: "search" | "construction" | "visit") => void;
};
type Work = MazeGenerationOptions["onWork"];

function randomFrom(sample: number, previous: string | undefined): Random {
  let seed = Math.floor(sample * 0x100000000) >>> 0;
  for (const char of previous ?? "") seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  // The increment also advances a zero seed and a constant injected sample.
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function link(tree: Tree, a: number, b: number): void {
  tree[a]!.push(b);
  tree[b]!.push(a);
}

function randomTree(columns: number, rows: number, random: Random, work: Work): Tree {
  const tree: Tree = Array.from({ length: columns * rows }, () => []);
  const start = Math.floor(random() * tree.length);
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    work?.("visit");
    const place = stack.at(-1)!;
    const choices = [place - columns, place + 1, place + columns, place - 1].filter((next) =>
      next >= 0 && next < tree.length && !seen.has(next) &&
      Math.abs(next % columns - place % columns) + Math.abs(Math.floor(next / columns) - Math.floor(place / columns)) === 1
    );
    if (!choices.length) { stack.pop(); continue; }
    const next = choices[Math.floor(random() * choices.length)]!;
    link(tree, place, next);
    seen.add(next);
    stack.push(next);
  }
  return tree;
}

// A serpentine spine occupies alternate coarse rows. The gaps are split
// into independent arms of two or three vertices, attached to either side
// of the spine. Even the smallest board has two interior long detours;
// the larger boards have at least six and eight, on spines of 50 and 56
// visible moves. Every vertex is attached once, so the result is a tree.
function constructedTree(columns: number, rows: number, previousRows: readonly string[] | undefined, random: Random, work: Work): Tree {
  const tree: Tree = Array.from({ length: columns * rows }, () => []);
  for (let y = 0; y < rows; y += 2) {
    for (let x = 1; x < columns; x++) link(tree, y * columns + x - 1, y * columns + x);
  }
  let excluded = false;
  for (let y = 1; y < rows; y += 2) {
    const hasLower = y + 1 < rows;
    const connector = hasLower ? (y % 4 === 1 ? columns - 1 : 0) : -1;
    if (hasLower) {
      link(tree, (y - 1) * columns + connector, y * columns + connector);
      link(tree, y * columns + connector, (y + 1) * columns + connector);
    }
    const end = connector === columns - 1 ? columns - 1 : columns;
    for (let x = connector === 0 ? 1 : 0; x < end;) {
      const remaining = end - x;
      const length = remaining % 2 === 1 && (remaining === 3 || random() < 0.5) ? 3 : 2;
      const arm = Array.from({ length }, (_, at) => y * columns + x + at);
      for (let at = 1; at < arm.length; at++) link(tree, arm[at - 1]!, arm[at]!);
      // Interior columns keep every arm off the spine's endpoints.
      const attachments = arm.filter((place) => place % columns > 0 && place % columns < columns - 1);
      const place = attachments[Math.floor(random() * attachments.length)]!;
      const upper = place - columns;
      const lower = place + columns;
      let parent = hasLower && random() < 0.5 ? lower : upper;
      if (hasLower && !excluded) {
        // Invert this upper connector's wall bit. Exactly one of the two
        // attachments is carved, so previous-layout exclusion costs one
        // local choice and cannot exhaust a retry budget.
        const old = previousRows?.[2 * y - 1]?.[2 * (place % columns)];
        if (old === "." || old === "#") parent = old === "." ? lower : upper;
        excluded = true;
      }
      link(tree, place, parent);
      x += length;
      work?.("visit");
    }
  }
  return tree;
}

// Each coarse edge becomes two visible moves. Directed branch depths are
// memoized; then each root visits each vertex at most once. Decisions at
// the root and destination never enter the accumulated interior counts.
function qualifyingEndpoints(tree: Tree, required: Difficulty, random: Random, work: Work): [number, number] | undefined {
  const depths = new Map<number, number>();
  const depth = (from: number, to: number): number => {
    const key = from * tree.length + to;
    const saved = depths.get(key);
    if (saved !== undefined) return saved;
    work?.("visit");
    const value = 1 + Math.max(0, ...tree[to]!.filter((next) => next !== from).map((next) => depth(to, next)));
    depths.set(key, value);
    return value;
  };
  const offset = Math.floor(random() * tree.length);
  for (let at = 0; at < tree.length; at++) {
    const start = (offset + at) % tree.length;
    const queue = [{ place: start, parent: -1, steps: 0, decisions: 0, detours: 0 }];
    for (let index = 0; index < queue.length; index++) {
      work?.("visit");
      const current = queue[index]!;
      for (const next of tree[current.place]!) {
        if (next === current.parent) continue;
        const wrong = current.place === start ? [] : tree[current.place]!.filter((branch) => branch !== current.parent && branch !== next);
        const steps = current.steps + 2;
        const decisions = current.decisions + Number(wrong.length > 0);
        const detours = current.detours + Number(wrong.some((branch) => depth(current.place, branch) >= 2));
        if (steps >= required.steps && decisions >= required.decisions && detours >= required.detours) return [start, next];
        queue.push({ place: next, parent: current.place, steps, decisions, detours });
      }
    }
  }
  return undefined;
}

function renderMaze(level: MazeLevel, required: Difficulty, tree: Tree, endpoints: [number, number], work: Work): Maze {
  const coarseColumns = (required.columns + 1) / 2;
  const visible = (place: number) => 2 * Math.floor(place / coarseColumns) * required.columns + 2 * (place % coarseColumns);
  const cells = Array<string>(required.columns * required.rows).fill("#");
  tree.forEach((neighbors, place) => {
    work?.("visit");
    cells[visible(place)] = ".";
    for (const next of neighbors) cells[(visible(place) + visible(next)) / 2] = ".";
  });
  const rows = Array.from({ length: required.rows }, (_, y) => cells.slice(y * required.columns, (y + 1) * required.columns).join(""));
  // The identity is lossless wall geometry, independent of the endpoints.
  return { id: `${required.columns}x${required.rows}:${rows.join("/")}`, level, rows, start: visible(endpoints[0]), goal: visible(endpoints[1]) };
}

export function nextMaze(level: MazeLevel, previous: string | undefined, sample: number, options: MazeGenerationOptions = {}): Maze {
  if (!Object.hasOwn(DIFFICULTIES, level)) throw new RangeError("Unknown maze level");
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError("A maze sample must be at least zero and less than one");
  if (previous !== undefined && typeof previous !== "string") throw new TypeError("A previous maze must be its layout id");
  const attempts = options.searchAttempts ?? 16;
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 16) throw new RangeError("Maze search attempts must be an integer from zero to sixteen");
  const required = DIFFICULTIES[level];
  const columns = (required.columns + 1) / 2;
  const rows = (required.rows + 1) / 2;
  const random = randomFrom(sample, previous);
  const work = options.onWork;
  for (let attempt = 0; attempt < attempts; attempt++) {
    work?.("search");
    const tree = randomTree(columns, rows, random, work);
    const endpoints = qualifyingEndpoints(tree, required, random, work);
    if (!endpoints) continue;
    const maze = renderMaze(level, required, tree, endpoints, work);
    if (maze.id !== previous) return maze;
  }
  work?.("construction");
  const prefix = `${required.columns}x${required.rows}:`;
  const previousRows = previous?.startsWith(prefix) ? previous.slice(prefix.length).split("/") : undefined;
  const tree = constructedTree(columns, rows, previousRows, random, work);
  // Construction guarantees a qualifying route; the same graph check is
  // still applied before returning, rather than trusting endpoint placement.
  return renderMaze(level, required, tree, qualifyingEndpoints(tree, required, random, work)!, work);
}

export type LabyrinthRound = {
  readonly maze: Maze;
  readonly position: number;
  readonly from: number;
  readonly hint: number | undefined;
  readonly hinted: boolean;
};

export function startMaze(maze: Maze): LabyrinthRound {
  return { maze, position: maze.start, from: maze.start, hint: undefined, hinted: false };
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
    if (place === round.position) return { ...round, hint: towardGoal.get(place), hinted: true };
    for (const next of adjacentPaths(round.maze, place)) {
      if (towardGoal.has(next)) continue;
      towardGoal.set(next, place);
      queue.push(next);
    }
  }
  return round;
}


export type LabyrinthProgress = {
  readonly stars: number;
  readonly roundsPlayed: number;
  readonly best: Readonly<Record<MazeLevel, number | null>>;
};

export const NO_LABYRINTH: LabyrinthProgress = {
  stars: 0, roundsPlayed: 0,
  best: { hatchling: null, explorer: null, paleontologist: null }
};

type BestRule = (previous: number | null, score: number) => { best: number; celebration: "first-best" | "new-best" | null };

export type LabyrinthReward = {
  progress: LabyrinthProgress;
  best: number;
  beaten: number | undefined;
  celebration: "first-best" | "new-best" | null;
};

// Completion is worth the same at every level, even after hints or detours.
export function rewardMaze(round: LabyrinthRound, progress: LabyrinthProgress, beatBest: BestRule): LabyrinthReward | undefined {
  if (!mazeSolved(round)) return undefined;
  const previous = progress.best[round.maze.level];
  const { best, celebration } = beatBest(previous, 3);
  return {
    progress: { stars: progress.stars + 3, roundsPlayed: progress.roundsPlayed + 1, best: { ...progress.best, [round.maze.level]: best } },
    best, celebration, beaten: celebration === "new-best" ? previous ?? undefined : undefined
  };
}
