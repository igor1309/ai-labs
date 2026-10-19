// The dig game's API: its use cases and the types the app speaks with
// it. Everything else under dig/ is reached only through this file.
export type { Cells, DigDinosaur, DigFile, Spot, SpotKind } from "./spots.ts";
export { FRAME, GRID, readDig, SPOT_KINDS, spotCells, TELLING_KINDS } from "./spots.ts";
export type { FramePoint, Mark, Sand } from "./sand.ts";
export { brush, clearCells, clearShare, NEW_SAND } from "./sand.ts";
export type { DigLevel, DigRound, Random } from "./round.ts";
export { awaitsHelp, BRUSH_SIZES, brushRound, explorerSpots, GUST_SHARE, HELP_AFTER, roundShare, spotFound, startRound, waitForHelp } from "./round.ts";
export type { BeatBest, Celebration, DigProgress, DigReward, KeptDig } from "./progress.ts";
export { digUp, dugUpOf, mergeProgress, NO_DIG } from "./progress.ts";
