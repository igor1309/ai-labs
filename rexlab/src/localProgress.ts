import { NO_CARE, type CareProgress } from "./care/index.ts";
import { LEVELS, NO_PAIRS, type Level, type PairsProgress } from "./pairs/index.ts";
import { NO_PROGRESS, type GameProgress } from "./quiz/index.ts";
import { NO_SKELETONS, type SkeletonProgress } from "./skeletons/index.ts";
import { NO_SORTING, type SortingProgress } from "./sorting/index.ts";

export const PROGRESS_KEY = "rexlab-progress";

const SCHEMA_VERSION = 1;

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

type Entry = Record<string, unknown>;

// The quiz's progress, under its game in the shared record.
export function localProgress(storage: () => KeyValueStorage) {
  return gameProgress<GameProgress>(storage, "compare-dinosaurs", NO_PROGRESS, readRounds);
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
  return gameProgress<SortingProgress>(storage, "sort-dinosaurs", NO_SORTING, readRounds);
}

// The best score and finished rounds of a game that keeps only those.
function readRounds({ bestScore, roundsPlayed }: Entry) {
  return (bestScore === null || isCount(bestScore)) && isCount(roundsPlayed) ? { bestScore, roundsPlayed } : undefined;
}

// Find the pair's progress, beside the others in the same record. Each
// level's best is kept under the level's number.
export function localPairsProgress(storage: () => KeyValueStorage) {
  return gameProgress<PairsProgress>(storage, "find-the-pair", NO_PAIRS, ({ stars, level, boardsOnLevel, best, found }) =>
    isCount(stars) &&
    isLevel(level) &&
    isCount(boardsOnLevel) &&
    isObject(best) &&
    Object.entries(best).every(([key, tries]) => isLevel(Number(key)) && isCount(tries) && tries > 0) &&
    Array.isArray(found) &&
    found.every((id) => typeof id === "string")
      ? { stars, level, boardsOnLevel, best: { ...best }, found: [...found] }
      : undefined
  );
}

// The skeleton game's progress, beside the others in the same record: the
// best collection score, the dinosaurs whose skeleton earned a star and
// those whose stand awaits its skeleton rebuilt.
export function localSkeletonProgress(storage: () => KeyValueStorage) {
  return gameProgress<SkeletonProgress>(storage, "skeleton-assembly", NO_SKELETONS, ({ bestScore, earned, rebuilding }) =>
    (bestScore === null || isCount(bestScore)) && isIds(earned) && isIds(rebuilding)
      ? { bestScore, earned: [...earned], rebuilding: [...rebuilding] }
      : undefined
  );
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

function isLevel(value: unknown): value is Level {
  return Object.hasOwn(LEVELS, String(value)) && Number.isInteger(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
