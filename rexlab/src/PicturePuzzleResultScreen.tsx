import { House, Lightbulb, Puzzle, RotateCcw, Star } from "lucide-react";
import { Button } from "./Button.tsx";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import type { AgeLevel } from "./ageLevel.ts";
import { PicturePuzzlePicture } from "./PicturePuzzlePicture.tsx";
import { BestScore, CelebrationChip, type Celebration } from "./ResultParts.tsx";

export type PicturePuzzleResultScreenProps = {
  language: Language;
  name: string;
  fact: string;
  level: AgeLevel;
  score: number;
  shared: number;
  best: number | undefined;
  beaten: number | undefined;
  celebration: Celebration | null;
  picture: string;
  onReplay: () => void;
  onAnother: () => void;
  onHome: () => void;
};

export function PicturePuzzleResultScreen({ language, name, fact, level, score, shared, best, beaten, celebration, picture, onReplay, onAnother, onHome }: PicturePuzzleResultScreenProps) {
  const text = TEXTS[language];
  const shownName = name.toLocaleUpperCase(language);
  return (
    <main className="picture-puzzle-result-screen">
      <Festivity />
      <header className="picture-puzzle-bar">
        <Button className="picture-puzzle-control" onClick={onHome}><House aria-hidden="true" />{text.home}</Button>
        <h1><Puzzle aria-hidden="true" />{text.wellDone}</h1>
        <p className="picture-puzzle-collection" aria-label={text.pictureCollection}><Star aria-hidden="true" />{shared}/3</p>
      </header>
      <div className="picture-puzzle-result-content">
        <div className="picture-puzzle-reveal" role="img" aria-label={shownName}><PicturePuzzlePicture src={picture} /></div>
        <section className="picture-puzzle-reward">
          <span className="picture-puzzle-round-star" role="img" aria-label={text.star}><Star size={56} aria-hidden="true" /></span>
          {celebration && <CelebrationChip language={language} celebration={celebration} />}
          <h2>{shownName}</h2>
          <p className="picture-puzzle-fact"><Lightbulb aria-hidden="true" />{fact}</p>
          <p className="picture-puzzle-level-score" aria-label={text.score}><Star aria-hidden="true" />{text.ageLevels[level].name} {score}/3</p>
          {best !== undefined && <BestScore language={language} best={best} beaten={beaten} total={3} />}
          <nav className="picture-puzzle-result-actions">
            <Button className="picture-puzzle-control" onClick={onReplay}><RotateCcw aria-hidden="true" />{text.playAgain}</Button>
            <Button className="picture-puzzle-control" onClick={onAnother}><Puzzle aria-hidden="true" />{text.pictureAnother}</Button>
          </nav>
        </section>
      </div>
    </main>
  );
}
