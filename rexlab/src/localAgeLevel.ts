import { isAgeLevel, type AgeLevelSetting } from "./ageLevel.ts";

export const AGE_LEVEL_KEY = "rexlab-age-level";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

// The age level a parent picked, kept in browser storage under a key of
// its own, apart from the games' progress, so it outlives lost progress.
// Like the theme and the language it is kept on a best-effort basis:
// storage that cannot be read or holds something else gives no setting,
// and a setting that cannot be saved still applies until the app is
// closed.
export function localAgeLevel(storage: () => KeyValueStorage) {
  return {
    load(): AgeLevelSetting | undefined {
      try {
        return settingOf(JSON.parse(storage().getItem(AGE_LEVEL_KEY) ?? "null"));
      } catch {
        return undefined;
      }
    },

    save(setting: AgeLevelSetting): void {
      try {
        storage().setItem(AGE_LEVEL_KEY, JSON.stringify(setting));
      } catch {
        return;
      }
    }
  };
}

// A saved setting is a level a parent picked, with the revision it was
// picked as.
function settingOf(raw: unknown): AgeLevelSetting | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { level, revision } = raw as Record<string, unknown>;
  return isAgeLevel(level) && typeof revision === "string" && revision !== "" ? { level, revision } : undefined;
}
