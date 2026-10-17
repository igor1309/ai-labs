// Find the pair's API: its use cases and the types the app speaks with it.
// Everything else under pairs/ is reached only through this file.
export type { Board, Card, Face, Level, Pal, Random } from "./board.ts";
export type { Celebration, KeptPairs, PairsProgress, PairsResult } from "./progress.ts";
export { dealBoard, isFinished, isMiss, LEVELS, TOP_LEVEL, turn, turnBack } from "./board.ts";
export { BOARDS_PER_LEVEL, finishBoard, foundOf, NO_PAIRS } from "./progress.ts";
