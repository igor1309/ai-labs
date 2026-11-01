import { House, Puzzle, Star } from "lucide-react";
import type { CSSProperties } from "react";
import type { AgeLevel } from "./ageLevel.ts";
import { Button } from "./Button.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { LevelSwitch } from "./LevelSwitch.tsx";
import { PicturePuzzlePicture } from "./PicturePuzzlePicture.tsx";

export type PicturePuzzleChoiceView = { id: string; name: string; picture: string; earned: boolean };
export type PicturePuzzleChoiceScreenProps = {
  language: Language;
  choices: readonly PicturePuzzleChoiceView[];
  level: AgeLevel;
  onLevel: (level: AgeLevel) => void;
  onChoose: (id: string) => void;
  onHome: () => void;
};

export function PicturePuzzleChoiceScreen({ language, choices, level, onLevel, onChoose, onHome }: PicturePuzzleChoiceScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="picture-puzzle-choice-screen">
      <header className="picture-puzzle-bar">
        <Button className="home-button" onClick={onHome}><House size={24} aria-hidden="true" />{text.home}</Button>
        <h1><Puzzle size={32} aria-hidden="true" />{text.picturePuzzle}</h1>
        <p className="picture-puzzle-collection" aria-label={text.pictureCollection}>
          <Star size={24} aria-hidden="true" />{choices.filter(({ earned }) => earned).length}/{choices.length}
        </p>
      </header>
      <div className="picture-puzzle-levels"><LevelSwitch language={language} level={level} onLevel={onLevel} /></div>
      <div className="picture-puzzle-choices" role="group" aria-label={text.creatures}>
        {choices.map((choice, index) => (
          <Button key={choice.id} className="card picture-puzzle-choice" aria-label={choice.name.toLocaleUpperCase(language)}
            style={{ "--choice": index } as CSSProperties} onClick={() => onChoose(choice.id)}>
            <PicturePuzzlePicture src={choice.picture} />
            <span className="picture-puzzle-name">{choice.name.toLocaleUpperCase(language)}</span>
            <span className="picture-puzzle-star" role="img" aria-label={choice.earned ? text.star : text.pictureNotCollected} data-earned={choice.earned}>
              <Star size={28} aria-hidden="true" />
            </span>
          </Button>
        ))}
      </div>
    </main>
  );
}
