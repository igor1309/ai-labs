import { brush, clearShare, NEW_SAND, type Mark, type Sand } from "./sand.ts";
import type { DigDinosaur } from "./spots.ts";

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

// A round: the dinosaur under the sand, the sand, and whether the gust
// has blown it away.
export type DigRound = { dinosaur: DigDinosaur; sand: Sand; blown: boolean };

// A round of a dinosaur not dug up yet, at random; once every one is, of
// any but `last`, the last one dug up.
export function startRound(dinosaurs: readonly DigDinosaur[], dug: readonly string[], last: string | undefined, random: Random): DigRound {
  const fresh = dinosaurs.filter(({ id }) => !dug.includes(id));
  const others = dinosaurs.filter(({ id }) => id !== last);
  const pool = fresh.length > 0 ? fresh : others.length > 0 ? others : dinosaurs;
  const dinosaur = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (dinosaur === undefined) throw new Error("No dinosaur to dig up");
  return { dinosaur, sand: NEW_SAND, blown: false };
}

// The share of the round's dinosaur that is clear.
export const roundShare = ({ dinosaur, sand }: DigRound): number => clearShare(sand, dinosaur.cells);

// The round with `mark` brushed; the gust blows once the share reaches
// GUST_SHARE. The sand the gust has blown away takes no more marks.
export function brushRound(round: DigRound, mark: Mark): DigRound {
  if (round.blown) return round;
  const brushed = { ...round, sand: brush(round.sand, mark) };
  return { ...brushed, blown: roundShare(brushed) >= GUST_SHARE };
}
