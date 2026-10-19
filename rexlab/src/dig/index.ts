// The dig game's API: its use cases and the types the app speaks with
// it. Everything else under dig/ is reached only through this file.
export type { Cells, DigDinosaur, DigFile, Spot, SpotKind } from "./spots.ts";
export { FRAME, GRID, readDig, SPOT_KINDS, spotCells, TELLING_KINDS } from "./spots.ts";
