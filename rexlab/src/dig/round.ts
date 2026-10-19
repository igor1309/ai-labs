import { brush, clearCells, clearShare, NEW_SAND, type Mark, type Sand } from "./sand.ts";
import { spotCells, type Cells, type DigDinosaur, type Spot, type SpotKind } from "./spots.ts";

// A source of numbers from 0 up to 1, as Math.random gives them.
export type Random = () => number;

// The age levels the dig game is played at.
export type DigLevel = "hatchling" | "explorer" | "paleontologist";

// How wide the brush is at each level, in CSS pixels, whatever the
// board's size: a finger steers 48 easily, and the older children's
// details need the finer 36.
export const BRUSH_SIZES: Readonly<Record<DigLevel, number>> = { hatchling: 48, explorer: 36, paleontologist: 36 };

// The share of the dinosaur's cells clear at which Hatchling's gust
// blows the rest of the sand away, so no child hunts for the last grains.
export const GUST_SHARE = 0.7;

// A round: the dinosaur under the sand, its level's chosen spots, and
// the brushing, finds and help so far.
export type DigRound = {
  level: DigLevel;
  dinosaur: DigDinosaur;
  sand: Sand;
  blown: boolean;
  spots: readonly Spot[];
  found: readonly SpotKind[];
  helped: readonly SpotKind[];
  // Help remains recorded after its spot is found, for the level offer.
  helpShown: boolean;
  quietMs: number;
};

export const HELP_AFTER = 10_000;

// Draw without replacement, so each card names a different kind.
export function explorerSpots(spots: readonly Spot[], random: Random): Spot[] {
  const pool = [...spots];
  const chosen: Spot[] = [];
  while (chosen.length < 3 && pool.length > 0) {
    const [spot] = pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1);
    if (spot) {
      chosen.push(spot);
      for (let at = pool.length - 1; at >= 0; at--) if (pool[at]?.kind === spot.kind) pool.splice(at, 1);
    }
  }
  return chosen;
}

// Only the dinosaur's cells inside the spot count; exactly half is not a find.
export function spotFound(spot: Spot, cells: Cells, clear: Cells): boolean {
  const own = spotCells(spot, cells);
  return own.filter(([column, row]) => clear[row]?.[column] === true).length * 2 > own.length;
}

export const awaitsHelp = (round: DigRound): boolean =>
  round.level === "explorer" && !round.blown && round.spots.some(({ kind }) => !round.found.includes(kind) && !round.helped.includes(kind));

// Only shown, landscape time is supplied by the caller. Brushing elsewhere
// never delays help, and help never clears cells or finds a detail.
export function waitForHelp(round: DigRound, ms: number): DigRound {
  if (!awaitsHelp(round)) return round;
  const quietMs = round.quietMs + ms;
  if (quietMs < HELP_AFTER) return { ...round, quietMs };
  const next = round.spots.find(({ kind }) => !round.found.includes(kind) && !round.helped.includes(kind));
  return next ? { ...round, quietMs: 0, helped: [...round.helped, next.kind], helpShown: true } : round;
}

// A round at `level` of a dinosaur not dug up yet, at random; once every
// one is, of any but `last`, the last one dug up.
export function startRound(dinosaurs: readonly DigDinosaur[], dug: readonly string[], last: string | undefined, random: Random, level: DigLevel): DigRound {
  const fresh = dinosaurs.filter(({ id }) => !dug.includes(id));
  const others = dinosaurs.filter(({ id }) => id !== last);
  const pool = fresh.length > 0 ? fresh : others.length > 0 ? others : dinosaurs;
  const dinosaur = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (dinosaur === undefined) throw new Error("No dinosaur to dig up");
  return {
    level, dinosaur, sand: NEW_SAND, blown: false,
    spots: level === "explorer" ? explorerSpots(dinosaur.spots, random) : [],
    found: [], helped: [], helpShown: false, quietMs: 0
  };
}

// The share of the round's dinosaur that is clear.
export const roundShare = ({ dinosaur, sand }: DigRound): number => clearShare(sand, dinosaur.cells);

// Explorer's gust follows its third find, whatever sand remains. Other
// levels use the free-brushing threshold. Blown sand takes no more marks.
export function brushRound(round: DigRound, mark: Mark): DigRound {
  if (round.blown) return round;
  const brushed = { ...round, sand: brush(round.sand, mark) };
  if (round.level === "explorer") {
    const clear = clearCells(brushed.sand);
    const newFinds = round.spots.filter((spot) => !round.found.includes(spot.kind) && spotFound(spot, round.dinosaur.cells, clear));
    const found = newFinds.length === 0 ? round.found : [...round.found, ...newFinds.map(({ kind }) => kind)];
    return { ...brushed, found, quietMs: newFinds.length > 0 ? 0 : round.quietMs, blown: found.length === 3 };
  }
  return { ...brushed, blown: roundShare(brushed) >= GUST_SHARE };
}
