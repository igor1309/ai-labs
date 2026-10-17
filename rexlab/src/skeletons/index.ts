// The skeleton game's API: its use cases and the types the app speaks
// with it. Everything else under skeletons/ is reached only through this
// file.
export type { Piece, Place, Point, Puzzle, Skeleton } from "./puzzle.ts";
export { awaitsHelp, drop, help, HELP_AFTER, isComplete, PIECES, startPuzzle, wait } from "./puzzle.ts";
