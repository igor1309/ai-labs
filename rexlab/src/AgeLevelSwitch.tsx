import type { CSSProperties } from "react";
import { AGE_LEVELS, type AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

export type AgeLevelSwitchProps = {
  language: Language;
  level: AgeLevel;
  onChoose: (level: AgeLevel) => void;
};

export function AgeLevelSwitch({ language, level, onChoose }: AgeLevelSwitchProps) {
  const text = TEXTS[language];
  return (
    <div className="pairs-levels" role="group" aria-label={text.ageLevelSwitch} style={{ "--chosen": AGE_LEVELS.indexOf(level) } as CSSProperties}>
      <span className="pairs-level-mark" aria-hidden="true" />
      {AGE_LEVELS.map((each) => (
        <button key={each} type="button" className="pairs-level" aria-pressed={each === level} onClick={() => onChoose(each)}>
          <span className="pairs-level-picture" aria-hidden="true">
            {AGE_LEVEL_PICTURES[each]}
          </span>
          <span className="pairs-level-name">{text.ageLevels[each].name}</span>
        </button>
      ))}
    </div>
  );
}
