// The skeleton game's API: its use cases and the types the app speaks
// with it. Everything else under skeletons/ is reached only through this
// file.
export type { BodyArea, Cut, Cuts, Help, HelpStep, Piece, Place, Point, Puzzle, Skeleton } from "./puzzle.ts";
export { awaitsHelp, BODY_AREAS, cutAt, drop, help, HELP_AFTER, isComplete, LADDER, startPuzzle, wait } from "./puzzle.ts";
export type { BeatBest, Celebration, KeptSkeletons, Museum, SkeletonProgress, SkeletonResult, Stand, StandState } from "./collection.ts";
export { finishSkeleton, knockDown, museumOf, NO_SKELETONS, openCollection } from "./collection.ts";
