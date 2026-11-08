import { Lightbulb, Puzzle, RotateCcw, Star } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "./Button.tsx";
import { DigGround } from "./DigBar.tsx";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import type { AgeLevel } from "./ageLevel.ts";
import { AGE_LEVEL_PICTURES } from "./ageLevelPictures.ts";
import { PicturePuzzlePicture } from "./PicturePuzzlePicture.tsx";
import { BestScore, CelebrationChip, type Celebration } from "./ResultParts.tsx";
import { SkeletonBar } from "./SkeletonBar.tsx";
import "./skeletonResult.css";
import "./picturePuzzleResult.css";

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

// PICTURE PUZZLE's result on the dig site, laid out as BONES' result: the
// whole picture in the sky beside or over the reward, WELL DONE by its star,
// the celebration beside the level's score, and the ways on on the sand.
export function PicturePuzzleResultScreen({ language, name, fact, level, score, shared, best, beaten, celebration, picture, onReplay, onAnother, onHome }: PicturePuzzleResultScreenProps) {
  const text = TEXTS[language];
  const shownName = name.toLocaleUpperCase(language);
  return (
    <main className="skeleton-screen skeleton-dig skeleton-result picture-puzzle-result-screen">
      {celebration && <Festivity />}
      <DigGround />
      <SkeletonBar language={language} title={text.wellDone} Mark={Puzzle} onHome={onHome}>
        <p className="skeleton-chip picture-puzzle-collection" aria-label={text.pictureCollection}><Star size={20} aria-hidden="true" />{shared}/3</p>
      </SkeletonBar>
      <div className="skeleton-reveal">
        <div className="skeleton-board skeleton-reveal-board picture-puzzle-reveal" role="img" aria-label={shownName}
          style={{ "--frame-width": 4, "--frame-height": 3 } as CSSProperties}>
          <PicturePuzzlePicture src={picture} />
        </div>
        <section className="skeleton-reward picture-puzzle-reward">
          <div className="skeleton-reward-row">
            <span className="skeleton-star" role="img" aria-label={text.star}><Star size={40} aria-hidden="true" /></span>
            <p className="picture-puzzle-well-done" aria-hidden="true">{text.wellDone}</p>
          </div>
          <div className="skeleton-reward-row">
            {celebration && <CelebrationChip language={language} celebration={celebration} />}
            <p className="picture-puzzle-level-score" aria-label={text.score}>
              <span className="picture-puzzle-level-picture" aria-hidden="true" data-picture={AGE_LEVEL_PICTURES[level]} />
              <span className="picture-puzzle-level-name">{text.ageLevels[level].name}</span> <strong>{score}/3</strong>
            </p>
          </div>
          <h2 className="skeleton-reveal-name">{shownName}</h2>
          <p className="skeleton-fact"><Lightbulb size={28} aria-hidden="true" /><span className="skeleton-fact-text">{fact}</span></p>
          {best !== undefined && <BestScore language={language} best={best} beaten={beaten} total={3} />}
          <nav className="skeleton-actions">
            <Button className="skeleton-build-another" onClick={onAnother}><Puzzle size={28} aria-hidden="true" />{text.pictureAnother}</Button>
            <Button className="skeleton-build-another picture-puzzle-replay" onClick={onReplay}><RotateCcw size={28} aria-hidden="true" />{text.playAgain}</Button>
          </nav>
        </section>
      </div>
    </main>
  );
}
