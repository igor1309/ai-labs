// The approximate age a parent picks for the games, youngest first
// (docs/age-levels.md).
export type AgeLevel = "hatchling" | "explorer" | "paleontologist";

export const AGE_LEVELS: readonly AgeLevel[] = ["hatchling", "explorer", "paleontologist"];

export function isAgeLevel(value: unknown): value is AgeLevel {
  return AGE_LEVELS.includes(value as AgeLevel);
}

// The level a parent picked and the revision it was picked as. Each pick
// of a different level is a fresh revision, so a game can tell a child's
// own choice made under this pick from one made under an earlier pick of
// the same level. The level no parent has picked on this device has no
// revision.
export type AgeLevelSetting = { level: AgeLevel; revision: string | null };

// A new install, and storage that holds no readable level, starts here.
export const DEFAULT_AGE_LEVEL: AgeLevelSetting = { level: "explorer", revision: null };

// A number drawn at random, at least 0 and below 1.
export type Random = () => number;

// How many base-36 digits a revision draws: enough that two drawn on one
// device never meet, even once the saved setting is lost and its count
// starts again.
const REVISION_DIGITS = 16;

// How many picks came before the setting's: the count a revision opens
// with, so the next pick's revision differs from it whatever is drawn.
function picksBefore(revision: string | null): number {
  const count = Number.parseInt(revision?.split("-")[0] ?? "", 10);
  return Number.isNaN(count) ? 0 : count;
}

// The setting once a parent picks `level`. The level already set is kept
// as it is, revision and all, so a child's choice made under it still
// wins. A different level takes a fresh revision: the count of picks
// before it, one more than its predecessor's, then digits drawn at random.
export function pickAgeLevel(setting: AgeLevelSetting, level: AgeLevel, random: Random): AgeLevelSetting {
  if (level === setting.level) return setting;
  const drawn = Array.from({ length: REVISION_DIGITS }, () => Math.floor(random() * 36).toString(36)).join("");
  return { level, revision: `${picksBefore(setting.revision) + 1}-${drawn}` };
}
