// Find the pair's API: its use cases and the types the app speaks with it.
// Everything else under pairs/ is reached only through this file.
export type { Board, Card, ClimbLevel, Face, Pal, Random } from "./board.ts";
export type { Celebration, KeptPairs, PairsProgress, PairsResult } from "./progress.ts";
export { CLIMB_LEVELS, dealBoard, isFinished, isMiss, TOP_CLIMB_LEVEL, turn, turnBack } from "./board.ts";
export { BOARDS_PER_CLIMB_LEVEL, finishBoard, foundOf, NO_PAIRS } from "./progress.ts";
