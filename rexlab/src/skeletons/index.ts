// The skeleton game's API: its use cases and the types the app speaks
// with it. Everything else under skeletons/ is reached only through this
// file.
export type { Cut, Cuts, Piece, Place, Point, Puzzle, Skeleton } from "./puzzle.ts";
export { awaitsHelp, drop, help, HELP_AFTER, isComplete, startPuzzle, wait } from "./puzzle.ts";
export type { BeatBest, Celebration, KeptSkeletons, Museum, SkeletonProgress, SkeletonResult, Stand, StandState } from "./collection.ts";
export { finishSkeleton, knockDown, museumOf, NO_SKELETONS, openCollection } from "./collection.ts";
