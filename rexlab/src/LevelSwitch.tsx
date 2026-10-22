import type { CSSProperties } from "react";
import { AGE_LEVELS, type AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";

export type LevelSwitchProps = {
  language: Language;
  // The age level the game is played at, chosen on the switch.
  level: AgeLevel;
  onLevel: (level: AgeLevel) => void;
  // A result can hold the switch until its reward has landed; disabled
  // buttons make that boundary apply to keyboard and assistive input too.
  disabled?: boolean;
  // The switch's name as a part a turn glides, where it is one.
  part?: string;
};

// The place of the chosen level on the switch, which the stylesheet slides
// the chosen mark to.
const chosenAt = (level: AgeLevel) => ({ "--chosen": AGE_LEVELS.indexOf(level) }) as CSSProperties;

// A game's own level switch: the age levels side by side, youngest first,
// each with its picture from the age level menu, and the chosen one
// marked.
export function LevelSwitch({ language, level, onLevel, disabled = false, part }: LevelSwitchProps) {
  const text = TEXTS[language];
  return (
    <div className="level-switch" data-turn-part={part} role="group" aria-label={text.ageLevelSwitch} style={chosenAt(level)}>
      <span className="level-switch-mark" aria-hidden="true" />
      {AGE_LEVELS.map((each) => (
        <Button key={each} className="level-switch-level" aria-pressed={each === level} disabled={disabled} onClick={() => onLevel(each)}>
          <span className="level-switch-picture" aria-hidden="true">
            {AGE_LEVEL_PICTURES[each]}
          </span>
          <span className="level-switch-name">{text.ageLevels[each].name}</span>
        </Button>
      ))}
    </div>
  );
}
