// The dig game's API: its use cases and the types the app speaks with
// it. Everything else under dig/ is reached only through this file.
export type { Cells, DigDinosaur, DigFile, Spot, SpotKind } from "./spots.ts";
export { FRAME, GRID, readDig, SPOT_KINDS, spotCells, TELLING_KINDS } from "./spots.ts";
export type { FramePoint, Mark, Sand } from "./sand.ts";
export { brush, clearCells, clearShare, NEW_SAND } from "./sand.ts";
export type { DigLevel, DigRound, Random } from "./round.ts";
export { asking, awaitsHelp, BRUSH_SIZES, brushRound, brushWidth, CHOICES, CHOICES_FADE_SHARE, choiceOpacity, GUST_SHARE, HELP_AFTER, likeness, lookAlikes, pickRound, QUESTION_SHARE, roundShare, roundTreasureFound, spotFound, startRound, strongRound, waitForHelp } from "./round.ts";
export type { Treasure, TreasureKind } from "./treasures.ts";
export { drawTreasure, TREASURE_CELLS, TREASURE_CHANCES, TREASURE_KINDS, TREASURE_ROUNDS, treasureCells, treasureFound, treasureKind, treasurePlaces } from "./treasures.ts";
export type { BeatBest, Celebration, DigProgress, DigReward, KeptDig, Treasures } from "./progress.ts";
export { digUp, dugUpOf, keepTreasure, mergeProgress, NO_DIG, treasuresFound } from "./progress.ts";
