import { brush, clearCells, clearShare, NEW_SAND, type Mark, type Sand } from "./sand.ts";
import { spotCells, type Cells, type DigDinosaur, type Spot, type SpotKind } from "./spots.ts";
import { drawTreasure, treasureFound, type Treasure } from "./treasures.ts";

// A source of numbers from 0 up to 1, as Math.random gives them.
export type Random = () => number;

// The age levels the dig game is played at.
export type DigLevel = "hatchling" | "explorer" | "paleontologist";

// How wide the brush is at each level, in CSS pixels, whatever the
// board's size: a finger steers 48 easily, and the older children's
// details need the finer 36.
export const BRUSH_SIZES: Readonly<Record<DigLevel, number>> = { hatchling: 48, explorer: 36, paleontologist: 36 };

// The share of the dinosaur's cells clear at which Hatchling's gust
// blows the last specks away, so the child digs the whole dinosaur but
// never hunts for its last grains.
export const GUST_SHARE = 0.95;

// The share of the dinosaur's cells clear at which Explorer and
// Paleontologist ask who it is: enough of it shows to tell it, so a pick
// is a judgement rather than a guess.
export const QUESTION_SHARE = 0.75;

// How many dinosaurs the question offers at each level, the one under
// the sand among them.
export const CHOICES: Readonly<Record<DigLevel, number>> = { hatchling: 0, explorer: 3, paleontologist: 4 };

// A round: the dinosaur under the sand, its spots in the order help
// shows them, the dinosaurs its question offers, the treasure its sand
// hides, if any, and the brushing, finds, help and wrong picks so far.
export type DigRound = {
  level: DigLevel;
  dinosaur: DigDinosaur;
  sand: Sand;
  blown: boolean;
  spots: readonly Spot[];
  found: readonly SpotKind[];
  helped: readonly SpotKind[];
  quietMs: number;
  choices: readonly string[];
  rejected: readonly string[];
  treasure: Treasure | undefined;
};

export const HELP_AFTER = 10_000;

function draw<T>(pool: readonly T[], count: number, random: Random): T[] {
  const remaining = [...pool];
  const chosen: T[] = [];
  while (chosen.length < count && remaining.length > 0) {
    const [item] = remaining.splice(Math.min(remaining.length - 1, Math.floor(random() * remaining.length)), 1);
    if (item !== undefined) chosen.push(item);
  }
  return chosen;
}

// What a dinosaur's picture shows a child to tell it by: its telling
// traits and the kinds of its spots.
const looks = ({ traits, spots }: DigDinosaur): Set<SpotKind> => new Set([...traits, ...spots.map(({ kind }) => kind)]);

// How alike two dinosaurs look, from 0 to 1: the kinds both show, of
// the kinds either shows.
export function likeness(one: DigDinosaur, other: DigDinosaur): number {
  const [a, b] = [looks(one), looks(other)];
  const both = [...a].filter((kind) => b.has(kind)).length;
  return both / new Set([...a, ...b]).size;
}

// The question's `count` dinosaurs in a random order: the one under the
// sand and its closest look-alikes, equals drawn at random, so the child
// tells it apart by what the sand has uncovered.
export function lookAlikes(dinosaur: DigDinosaur, dinosaurs: readonly DigDinosaur[], count: number, random: Random): string[] {
  const shuffled = draw(dinosaurs.filter(({ id }) => id !== dinosaur.id), dinosaurs.length, random);
  const others = shuffled.map((other) => ({ other, alike: likeness(dinosaur, other) })).sort((one, two) => two.alike - one.alike).slice(0, count - 1);
  if (others.length !== count - 1) throw new Error(`Not enough look-alikes for ${dinosaur.id}`);
  return draw([dinosaur, ...others.map(({ other }) => other)], count, random).map(({ id }) => id);
}

// The share of the round's dinosaur that is clear.
export const roundShare = ({ dinosaur, sand }: DigRound): number => clearShare(sand, dinosaur.cells);

// The round's treasure is found once more than half of it is clear; one
// not found by the gust goes with the sand.
export const roundTreasureFound = ({ treasure, sand }: DigRound): boolean => treasure !== undefined && treasureFound(treasure, clearCells(sand));

// Explorer and Paleontologist ask who it is once three quarters of the
// dinosaur show, until the right pick; brushing goes on meanwhile.
export const asking = (round: DigRound): boolean => round.choices.length > 0 && !round.blown && roundShare(round) >= QUESTION_SHARE;

// A wrong pick stays out; the right one brings the gust.
export function pickRound(round: DigRound, id: string): DigRound {
  if (!asking(round) || !round.choices.includes(id) || round.rejected.includes(id)) return round;
  return id === round.dinosaur.id ? { ...round, blown: true } : { ...round, rejected: [...round.rejected, id] };
}

// A round ends strong, for the level offer, when the dinosaur is named at
// the first pick; Hatchling has no question, so every round of it is.
export const strongRound = (round: DigRound): boolean => round.rejected.length === 0;

// Only the dinosaur's cells inside the spot count; exactly half is not a find.
export function spotFound(spot: Spot, cells: Cells, clear: Cells): boolean {
  const own = spotCells(spot, cells);
  return own.filter(([column, row]) => clear[row]?.[column] === true).length * 2 > own.length;
}

const helpSpot = (round: DigRound): Spot | undefined => round.spots.find(({ kind }) => !round.found.includes(kind) && !round.helped.includes(kind));

export const awaitsHelp = (round: DigRound): boolean => !round.blown && helpSpot(round) !== undefined;

// Only shown, landscape time is supplied by the caller. Help never clears
// cells or finds a detail; brushing that clears more of the dinosaur
// starts the wait again.
export function waitForHelp(round: DigRound, ms: number): DigRound {
  if (!awaitsHelp(round)) return round;
  const quietMs = round.quietMs + ms;
  if (quietMs < HELP_AFTER) return { ...round, quietMs };
  const next = helpSpot(round);
  return next ? { ...round, quietMs: 0, helped: [...round.helped, next.kind] } : round;
}

// A round at `level` of a dinosaur not dug up yet, at random; once every
// one is, of any but `last`, the last one dug up. Its treasure is drawn
// last, so the dinosaur, spots and question a draw gives are the same
// whether or not the sand hides one.
export function startRound(dinosaurs: readonly DigDinosaur[], dug: readonly string[], last: string | undefined, random: Random, level: DigLevel): DigRound {
  const fresh = dinosaurs.filter(({ id }) => !dug.includes(id));
  const others = dinosaurs.filter(({ id }) => id !== last);
  const pool = fresh.length > 0 ? fresh : others.length > 0 ? others : dinosaurs;
  const dinosaur = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (dinosaur === undefined) throw new Error("No dinosaur to dig up");
  return {
    level, dinosaur, sand: NEW_SAND, blown: false,
    spots: draw(dinosaur.spots, dinosaur.spots.length, random),
    choices: CHOICES[level] > 0 ? lookAlikes(dinosaur, dinosaurs, CHOICES[level], random) : [], rejected: [],
    found: [], helped: [], quietMs: 0,
    treasure: drawTreasure(dinosaur.cells, random)
  };
}

// Brushing goes on until the gust: Hatchling's at 95% of the dinosaur,
// the other levels' at the right pick. Only the dinosaur's cells count
// toward either, so a treasure's sand neither ends nor speeds the round.
export function brushRound(round: DigRound, mark: Mark): DigRound {
  if (round.blown) return round;
  const sand = brush(round.sand, mark);
  const clear = clearCells(sand);
  const newFinds = round.spots.filter((spot) => !round.found.includes(spot.kind) && spotFound(spot, round.dinosaur.cells, clear));
  const found = newFinds.length === 0 ? round.found : [...round.found, ...newFinds.map(({ kind }) => kind)];
  const share = clearShare(sand, round.dinosaur.cells);
  const quietMs = share > roundShare(round) ? 0 : round.quietMs;
  return { ...round, sand, found, quietMs, blown: round.level === "hatchling" && share >= GUST_SHARE };
}
