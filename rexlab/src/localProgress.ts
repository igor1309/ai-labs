import { NO_PROGRESS, type GameProgress } from "./quiz/index.ts";

export const PROGRESS_KEY = "rexlab-progress";

const SCHEMA_VERSION = 1;
const GAME = "compare-dinosaurs";

export type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

type Games = Record<string, unknown>;

// Progress kept in browser storage, in the versioned record of
// docs/mvp-infrastructure.md section 5. The storage is reached through a
// function because a browser that blocks storage throws on reaching
// `localStorage` itself, not only on reading it.
export function localProgress(storage: () => KeyValueStorage) {
  return {
    // Undefined when storage cannot be read at all. A record that is
    // unreadable or of an unknown schema version counts as no progress.
    load(): GameProgress | undefined {
      let raw: string | null;
      try {
        raw = storage().getItem(PROGRESS_KEY);
      } catch {
        return undefined;
      }
      return parse(raw)?.progress ?? NO_PROGRESS;
    },

    // Best effort: losing browser-local scores is an accepted trade-off, so
    // progress that cannot be saved is dropped. A readable record keeps its
    // other games and fields; an unusable one is replaced.
    save(progress: GameProgress): void {
      try {
        const target = storage();
        const games = parse(target.getItem(PROGRESS_KEY))?.games ?? {};
        const game = games[GAME];
        const record = {
          schemaVersion: SCHEMA_VERSION,
          games: { ...games, [GAME]: { ...(isObject(game) ? game : {}), ...progress } }
        };
        target.setItem(PROGRESS_KEY, JSON.stringify(record));
      } catch {
        return;
      }
    }
  };
}

function parse(raw: string | null): { games: Games; progress: GameProgress } | undefined {
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
  const game = record.games[GAME];
  if (game === undefined) {
    return { games: record.games, progress: NO_PROGRESS };
  }
  if (!isObject(game)) return undefined;
  const { bestScore, roundsPlayed } = game;
  if (!(bestScore === null || isCount(bestScore)) || !isCount(roundsPlayed)) {
    return undefined;
  }
  return { games: record.games, progress: { bestScore, roundsPlayed } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
