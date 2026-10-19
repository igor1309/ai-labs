import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

// A level badge a skeleton earns: Explorer's or Paleontologist's.
export type ShownBadge = "explorer" | "paleontologist";

// A level badge: the level's own picture, as on the level switch, in a
// round mark, read out by its name.
export function LevelBadge({ language, badge }: { language: Language; badge: ShownBadge }) {
  return (
    <span className="level-badge" role="img" aria-label={TEXTS[language].badges[badge]} data-badge={badge}>
      {AGE_LEVEL_PICTURES[badge]}
    </span>
  );
}
