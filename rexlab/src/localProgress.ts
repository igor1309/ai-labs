import { NO_LABYRINTH, type LabyrinthProgress } from "./labyrinth/index.ts";
import { isAgeLevel } from "./ageLevel.ts";
import { NO_CARE, type CareProgress } from "./care/index.ts";
import { NO_DIG, TREASURE_KINDS, type DigProgress, type Treasures } from "./dig/index.ts";
import type { FeaturedHistory, Featuring } from "./featured.ts";
import { NO_LEVEL_OFFER, type LevelOffer } from "./levelOffer.ts";
import { CLIMB_LEVELS, LARGE_LEVELS, NO_PAIRS, type ClimbLevel, type PairsProgress } from "./pairs/index.ts";
import { NO_PROGRESS } from "./quiz/index.ts";
import { BADGES, NO_SKELETONS, type Badge, type SkeletonProgress } from "./skeletons/index.ts";
import { NO_SORTING } from "./sorting/index.ts";
import type { LevelChoice } from "./startLevel.ts";

export const PROGRESS_KEY = "rexlab-progress";

const SCHEMA_VERSION = 1;

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

type Entry = Record<string, unknown>;

// The quiz's progress and the child's last choice on its level switch,
// under its game in the shared record.
export function localProgress(storage: () => KeyValueStorage) {
  return levelledProgress(storage, "compare-dinosaurs", NO_PROGRESS);
}

// Dinosaur care's progress, beside the quiz's in the same record.
export function localCareProgress(storage: () => KeyValueStorage) {
  return gameProgress<CareProgress>(storage, "dinosaur-care", NO_CARE, ({ bestScore, visitsFinished, friends }) =>
    (bestScore === null || isCount(bestScore)) && isCount(visitsFinished) && Array.isArray(friends) && friends.every((id) => typeof id === "string")
      ? { bestScore, visitsFinished, friends: [...friends] }
      : undefined
  );
}

// The sorting game's progress, beside the others' in the same record.
export function localSortingProgress(storage: () => KeyValueStorage) {
  return levelledProgress(storage, "sort-dinosaurs", NO_SORTING);
}

// Labyrinth rewards share the record, while a board itself is never saved.
export function localLabyrinthProgress(storage: () => KeyValueStorage) {
  type Saved = { progress: LabyrinthProgress; levelChoice: LevelChoice | undefined; offer: LevelOffer };
  const entry = gameProgress<Saved>(storage, "labyrinth", { progress: NO_LABYRINTH, levelChoice: undefined, offer: NO_LEVEL_OFFER }, (raw) => {
    const { progress, levelChoice, offer } = raw;
    if (!isObject(progress) || !isObject(progress.best)) return undefined;
    const { stars, roundsPlayed, best } = progress;
    if (!Number.isSafeInteger(stars) || (stars as number) < 0 || !Number.isSafeInteger(roundsPlayed) || (roundsPlayed as number) < 0) return undefined;
    const score = (value: unknown): value is number | null => value === null || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 3);
    if (!score(best.hatchling) || !score(best.explorer) || !score(best.paleontologist)) return undefined;
    const choice = choiceOf(levelChoice);
    return {
      progress: { stars: stars as number, roundsPlayed: roundsPlayed as number, best: { hatchling: best.hatchling, explorer: best.explorer, paleontologist: best.paleontologist } },
      levelChoice: choice, offer: readOffer(offer)
    };
  });
  return { load: entry.load, save: entry.save };
}

// A game's best on each level, its finished rounds and the child's last
// choice on its level switch, under `game` in the shared record.
function levelledProgress(storage: () => KeyValueStorage, game: string, empty: LevelledProgress) {
  const entry = gameProgress<StoredLevels>(storage, game, storedLevels(empty, undefined), readLevels);
  return {
    load(): { progress: LevelledProgress; levelChoice: LevelChoice | undefined } | undefined {
      const stored = entry.load();
      if (stored === undefined) return undefined;
      const { bestScore, explorerBest, paleontologistBest, roundsPlayed, levelChoice } = stored;
      return { progress: { best: { hatchling: bestScore, explorer: explorerBest, paleontologist: paleontologistBest }, roundsPlayed }, levelChoice };
    },

    save({ progress, levelChoice }: { progress: LevelledProgress; levelChoice: LevelChoice | undefined }): void {
      entry.save(storedLevels(progress, levelChoice));
    }
  };
}

type LevelledProgress = { best: Record<"hatchling" | "explorer" | "paleontologist", number | null>; roundsPlayed: number };

// The original bestScore field stays Hatchling's so progress saved before
// levels keeps its meaning; the other levels have their own fields.
type StoredLevels = {
  bestScore: number | null;
  explorerBest: number | null;
  paleontologistBest: number | null;
  roundsPlayed: number;
  levelChoice?: LevelChoice;
};

function storedLevels({ best, roundsPlayed }: LevelledProgress, levelChoice: LevelChoice | undefined): StoredLevels {
  return { bestScore: best.hatchling, explorerBest: best.explorer, paleontologistBest: best.paleontologist, roundsPlayed, ...(levelChoice && { levelChoice }) };
}

function readLevels(entry: Entry): StoredLevels | undefined {
  const rounds = readRounds(entry);
  const { explorerBest = null, paleontologistBest = null, levelChoice } = entry;
  if (!rounds || !(explorerBest === null || isCount(explorerBest)) || !(paleontologistBest === null || isCount(paleontologistBest))) return undefined;
  const progress = { ...rounds, explorerBest, paleontologistBest };
  if (levelChoice === undefined) return progress;
  const choice = choiceOf(levelChoice);
  return choice && { ...progress, levelChoice: choice };
}

// The best score and finished rounds of a game that keeps only those.
function readRounds({ bestScore, roundsPlayed }: Entry) {
  return (bestScore === null || isCount(bestScore)) && isCount(roundsPlayed) ? { bestScore, roundsPlayed } : undefined;
}

// Find the pair's progress and the child's last choice on its level
// switch, beside the others in the same record.
export function localPairsProgress(storage: () => KeyValueStorage) {
  const entry = gameProgress<StoredPairs>(storage, "find-the-pair", storedPairs(NO_PAIRS, undefined, NO_LEVEL_OFFER), readPairs);
  return {
    // Undefined when storage cannot be read at all.
    load(): { progress: PairsProgress; levelChoice: LevelChoice | undefined; offer: LevelOffer } | undefined {
      const stored = entry.load();
      if (stored === undefined) return undefined;
      const { level, boardsOnLevel, levelChoice, offer, ...rest } = stored;
      return { progress: { ...rest, climbLevel: level, boardsOnClimbLevel: boardsOnLevel }, levelChoice, offer };
    },

    save({ progress, levelChoice, offer }: { progress: PairsProgress; levelChoice: LevelChoice | undefined; offer: LevelOffer }): void {
      entry.save(storedPairs(progress, levelChoice, offer));
    }
  };
}

// Find the pair's entry as stored. It keeps the names it had before the
// game had levels: the climb level under `level`, the boards finished on
// it under `boardsOnLevel`, and each climb level's best under the level's
// number, with Explorer's and Paleontologist's bests under their names.
// The child's choice on the level switch is kept beside them,
// with the revision of the age level it was made under; an entry saved
// before levels has none.
type StoredPairs = {
  stars: number;
  level: ClimbLevel;
  boardsOnLevel: number;
  best: PairsProgress["best"];
  found: readonly string[];
  levelChoice?: LevelChoice;
  offer: LevelOffer;
};

function storedPairs({ climbLevel, boardsOnClimbLevel, ...rest }: PairsProgress, levelChoice: LevelChoice | undefined, offer: LevelOffer): StoredPairs {
  return { ...rest, level: climbLevel, boardsOnLevel: boardsOnClimbLevel, ...(levelChoice && { levelChoice }), offer };
}

function readPairs({ stars, level, boardsOnLevel, best, found, levelChoice, offer }: Entry): StoredPairs | undefined {
  const usable =
    isCount(stars) &&
    isClimbLevel(level) &&
    isCount(boardsOnLevel) &&
    isObject(best) &&
    Object.entries(best).every(([key, tries]) => (isClimbLevel(Number(key)) || Object.hasOwn(LARGE_LEVELS, key)) && isCount(tries) && tries > 0) &&
    Array.isArray(found) &&
    found.every((id) => typeof id === "string");
  if (!usable) return undefined;
  const progress = { stars, level, boardsOnLevel, best: { ...best }, found: [...found], offer: readOffer(offer) };
  if (levelChoice === undefined) return progress;
  const choice = choiceOf(levelChoice);
  return choice && { ...progress, levelChoice: choice };
}

// The treasures found, each kind with a count of one or more; as the
// offer, treasures that cannot be read never make the dinosaurs dug up
// unusable, and an entry saved before treasures has none.
function readTreasures(raw: unknown): Treasures {
  if (!isObject(raw)) return {};
  return Object.fromEntries(TREASURE_KINDS.flatMap((kind) => {
    const count = raw[kind];
    return isCount(count) && count > 0 ? [[kind, count]] : [];
  }));
}

// An optional offer must never make otherwise readable progress unusable.
function readOffer(raw: unknown): LevelOffer {
  if (!isObject(raw)) return NO_LEVEL_OFFER;
  const { level, strong, declined } = raw;
  if (!(level === null || isAgeLevel(level)) || !isCount(strong) || (level === null && strong !== 0) || !Array.isArray(declined) || !declined.every(isAgeLevel)) return NO_LEVEL_OFFER;
  return { level, strong, declined: [...new Set(declined)] };
}

// A choice is an age level and the revision it was made under, null while
// no parent has picked a level on this device.
function choiceOf(raw: unknown): LevelChoice | undefined {
  if (!isObject(raw)) return undefined;
  const { level, revision } = raw;
  return isAgeLevel(level) && (revision === null || (typeof revision === "string" && revision !== "")) ? { level, revision } : undefined;
}

// The dig game's progress, beside the others in the same record: the
// dinosaurs dug up and those with their 🦴 badge, by id, the treasures
// found, by kind with their counts, with the child's last choice on its
// level switch, none until the switch is first used.
export function localDigProgress(storage: () => KeyValueStorage) {
  const entry = gameProgress<StoredDig>(storage, "dig", storedDig(NO_DIG, undefined, NO_LEVEL_OFFER), readDig);
  return {
    // Undefined when storage cannot be read at all.
    load(): { progress: DigProgress; levelChoice: LevelChoice | undefined; levelOffer: LevelOffer } | undefined {
      const stored = entry.load();
      if (stored === undefined) return undefined;
      const { levelChoice, levelOffer, treasures = {}, ...progress } = stored;
      return { progress: { ...progress, treasures }, levelChoice, levelOffer };
    },

    save({ progress, levelChoice, levelOffer }: { progress: DigProgress; levelChoice: LevelChoice | undefined; levelOffer: LevelOffer }): void {
      entry.save(storedDig(progress, levelChoice, levelOffer));
    }
  };
}

type StoredDig = Omit<DigProgress, "treasures"> & { treasures?: Treasures; levelChoice?: LevelChoice; levelOffer: LevelOffer };

// Treasures are stored only once one is found, as an entry saved before
// them has none.
function storedDig({ dug, badges, treasures }: DigProgress, levelChoice: LevelChoice | undefined, levelOffer: LevelOffer): StoredDig {
  return { dug: [...dug], badges: [...badges], ...(Object.keys(treasures).length > 0 && { treasures: { ...treasures } }), levelOffer, ...(levelChoice && { levelChoice }) };
}

// As find the pair's, an entry whose choice cannot be read is unusable.
function readDig({ dug, badges, treasures, levelChoice, levelOffer }: Entry): StoredDig | undefined {
  if (!isIds(dug) || !isIds(badges)) return undefined;
  const progress = { dug: [...dug], badges: [...badges], treasures: readTreasures(treasures), levelOffer: readOffer(levelOffer) };
  if (levelChoice === undefined) return progress;
  const choice = choiceOf(levelChoice);
  return choice && { ...progress, levelChoice: choice };
}

// The skeleton game's progress, beside the others in the same record: the
// best collection score, the dinosaurs whose skeleton earned a star and
// those whose stand awaits its skeleton rebuilt, each skeleton's level
// badges, kept only once one is earned, with the child's last choice on
// its level switch, none until the switch is first used. A badge is never
// taken away, so saving keeps those another tab saved meanwhile.
export function localSkeletonProgress(storage: () => KeyValueStorage) {
  const entry = gameProgress<StoredSkeletons>(storage, "skeleton-assembly", NO_SKELETONS, readSkeletons);
  return {
    // Undefined when storage cannot be read at all.
    load(): { progress: SkeletonProgress; levelChoice: LevelChoice | undefined } | undefined {
      const stored = entry.load();
      if (stored === undefined) return undefined;
      const { levelChoice, badges = {}, ...progress } = stored;
      return { progress: { ...progress, badges }, levelChoice };
    },

    save({ progress, levelChoice }: { progress: SkeletonProgress; levelChoice: LevelChoice | undefined }): void {
      const { badges: earned, ...rest } = progress;
      const badges = bothBadges(entry.load()?.badges ?? {}, earned);
      entry.save({ ...rest, ...(Object.keys(badges).length > 0 && { badges }), ...(levelChoice && { levelChoice }) });
    }
  };
}

// The skeleton game's entry as stored; an entry saved before the game had
// levels has no choice, and one saved before a badge was earned no badges.
type StoredSkeletons = Omit<SkeletonProgress, "badges"> & { badges?: SkeletonProgress["badges"]; levelChoice?: LevelChoice };

// A choice that cannot be read is dropped, keeping the stars and stands
// beside it, and so is a skeleton's badge that cannot.
function readSkeletons({ bestScore, earned, rebuilding, badges, levelChoice }: Entry): StoredSkeletons | undefined {
  if (!((bestScore === null || isCount(bestScore)) && isIds(earned) && isIds(rebuilding))) return undefined;
  const choice = choiceOf(levelChoice);
  return { bestScore, earned: [...earned], rebuilding: [...rebuilding], badges: badgesOf(badges), ...(choice && { levelChoice: choice }) };
}

// Each skeleton's badges, in the levels' order; a skeleton with none that
// can be read has no entry.
function badgesOf(raw: unknown): SkeletonProgress["badges"] {
  if (!isObject(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([id, held]) => {
      const kept = Array.isArray(held) ? BADGES.filter((badge: Badge) => held.includes(badge)) : [];
      return kept.length === 0 ? [] : [[id, kept]];
    })
  );
}

// Every badge of either, each skeleton's in the levels' order.
function bothBadges(one: SkeletonProgress["badges"], other: SkeletonProgress["badges"]): SkeletonProgress["badges"] {
  return Object.fromEntries([...new Set([...Object.keys(one), ...Object.keys(other)])].map((id) => [id, BADGES.filter((badge) => one[id]?.includes(badge) || other[id]?.includes(badge))]));
}

// The home page's start counts and the day's featured game, beside the
// games' entries in the same record; `games` are those the home page
// offers. Read once, on first use, and held for the visit, so a start
// counted or a game chosen stays for the visit even when it cannot be
// saved. The choice takes the counts as they come, so an entry with a
// count that is not a whole number of starts, or a featured game no longer
// offered, is read as no starts and no game; the count of a game no
// longer offered is left out.
export function localFeatured(storage: () => KeyValueStorage, games: readonly string[]) {
  const entry = gameProgress<StoredFeatured>(storage, "home-featured", NO_FEATURED, (stored) => readFeatured(stored, games));
  let visit: StoredFeatured | undefined;
  const held = () => (visit ??= entry.load() ?? NO_FEATURED);
  const keep = (stored: StoredFeatured) => {
    visit = stored;
    entry.save(stored);
  };
  return {
    history: (): FeaturedHistory => {
      const { starts, featured } = held();
      return { timesStarted: new Map(Object.entries(starts)), lastFeatured: featured && { game: featured.game, on: featured.day } };
    },
    feature: ({ game, on }: Featuring) => keep({ ...held(), featured: { day: on, game } }),
    countStart: (game: string) => {
      const { starts, featured } = held();
      keep({ starts: { ...starts, [game]: (starts[game] ?? 0) + 1 }, featured });
    }
  };
}

// The home page's entry as stored: each game's start count, by its home
// page id, and the game featured on a day, by the day's date.
type StoredFeatured = {
  starts: Readonly<Record<string, number>>;
  featured: { day: string; game: string } | undefined;
};

const NO_FEATURED: StoredFeatured = { starts: {}, featured: undefined };

function readFeatured({ starts, featured }: Entry, games: readonly string[]): StoredFeatured | undefined {
  if (!isObject(starts)) return undefined;
  const offered = Object.entries(starts).filter(([game]) => games.includes(game));
  const counts = offered.flatMap(([game, count]) => (isCount(count) ? [[game, count] as const] : []));
  if (counts.length < offered.length) return undefined;
  if (featured === undefined) return { starts: Object.fromEntries(counts), featured: undefined };
  if (!isObject(featured) || typeof featured.day !== "string" || typeof featured.game !== "string" || !games.includes(featured.game)) return undefined;
  return { starts: Object.fromEntries(counts), featured: { day: featured.day, game: featured.game } };
}

// One game's progress kept in browser storage, in the versioned record of
// docs/mvp-infrastructure.md section 5, which holds every game's. The
// storage is reached through a function because a browser that blocks
// storage throws on reaching `localStorage` itself, not only on reading
// it. `read` gives the game's progress from its entry, or undefined when
// the entry is unusable.
function gameProgress<P extends object>(storage: () => KeyValueStorage, game: string, empty: P, read: (entry: Entry) => P | undefined) {
  const entryOf = (games: Entry | undefined) => {
    const entry = games?.[game];
    return isObject(entry) ? entry : undefined;
  };
  return {
    // Undefined when storage cannot be read at all. A record, or this
    // game's entry in it, that is unreadable or of an unknown schema
    // version counts as no progress.
    load(): P | undefined {
      let raw: string | null;
      try {
        raw = storage().getItem(PROGRESS_KEY);
      } catch {
        return undefined;
      }
      const entry = entryOf(parse(raw));
      return (entry && read(entry)) ?? empty;
    },

    // Best effort: losing browser-local scores is an accepted trade-off, so
    // progress that cannot be saved is dropped. A readable record keeps its
    // other games, and a readable entry its other fields; an unusable
    // record, or this game's unusable entry, is replaced.
    save(progress: P): void {
      try {
        const target = storage();
        const games = parse(target.getItem(PROGRESS_KEY)) ?? {};
        const entry = entryOf(games);
        const kept = entry && read(entry) !== undefined ? entry : {};
        const record = { schemaVersion: SCHEMA_VERSION, games: { ...games, [game]: { ...kept, ...progress } } };
        target.setItem(PROGRESS_KEY, JSON.stringify(record));
      } catch {
        return;
      }
    }
  };
}

// Every game's entry of a readable record of the known schema version.
function parse(raw: string | null): Entry | undefined {
  if (raw === null) return undefined;
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isObject(record) || record.schemaVersion !== SCHEMA_VERSION || !isObject(record.games)) {
    return undefined;
  }
  return record.games;
}

function isObject(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

function isClimbLevel(value: unknown): value is ClimbLevel {
  return Object.hasOwn(CLIMB_LEVELS, String(value)) && Number.isInteger(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
