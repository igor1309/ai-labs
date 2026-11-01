import { AGE_LEVELS, type AgeLevel, type AgeLevelSetting } from "./ageLevel.ts";

// The levels a game has a mode for. Every game offers Hatchling, its
// behaviour from before it had levels (docs/age-levels.md).
export type OfferedLevels = readonly ["hatchling", ...AgeLevel[]];

// The level a child chose in a game's own level switch, with the revision
// of the setting it was made under.
export type LevelChoice = { level: AgeLevel; revision: AgeLevelSetting["revision"] };

// The level a game starts at (age-level-start.feature): the child's own
// choice while the setting is still the pick it was made under, otherwise
// the setting; either way, the nearest level the game offers at or below
// it.
export function startLevel(setting: AgeLevelSetting, offered: OfferedLevels, choice?: LevelChoice): AgeLevel {
  const wanted = choice !== undefined && choice.revision === setting.revision ? choice.level : setting.level;
  return AGE_LEVELS.slice(0, AGE_LEVELS.indexOf(wanted) + 1).filter((level) => offered.includes(level)).at(-1) ?? "hatchling";
}
