import { House, RotateCcw } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Button } from "./Button.tsx";
import type { ResultType } from "./compareResultLayout.ts";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import { Picture } from "./Picture.tsx";
import { BestScore, CelebrationChip, motion, ScoreCount, type Celebration } from "./ResultParts.tsx";

export type { Celebration };

// The result of a round scored in stars: the compare quiz's and the
// sorting game's.
export type ResultScreenProps = {
  language: Language;
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to show.
  best: number | undefined;
  // The best score this round beat, shown before the new one; undefined
  // when the round set no new best over an earlier one.
  beaten: number | undefined;
  celebration: Celebration | null;
  // The picture of the dinosaur cheering the child on.
  hero: string;
  // A game's level choice, above the actions; the round's reward stays
  // the same while the caller chooses the next level.
  levelSwitch?: ReactNode;
  onPlayAgain: () => void;
  onHome: () => void;
  // The stars', the level names' and the dinosaur's sizes upright, one
  // for the window; landscape sizes them itself.
  type?: ResultType;
};

// The upright sizes, as the custom properties the stylesheet reads.
const typeStyle = (type: ResultType | undefined) =>
  (type ? { "--star-size": `${type.star}px`, "--level-name-size": `${type.levelName}px`, "--hero-maximum": `${type.heroMaximum}px` } : {}) as CSSProperties;

export function ResultScreen({ language, score, total, best, beaten, celebration, hero, levelSwitch, onPlayAgain, onHome, type }: ResultScreenProps) {
  const text = TEXTS[language];
  // The dinosaur, each reward, the level switch and the actions are the
  // parts a turn glides.
  return (
    <main className={levelSwitch ? "result result-with-levels" : "result"} style={typeStyle(type)}>
      {celebration && <Festivity />}
      <div className="stratum result-stratum" aria-hidden="true" />
      <Picture className="result-hero" part="result-hero" src={hero} alt="" width={800} height={600} />
      <div className="result-content">
        {celebration && <CelebrationChip language={language} celebration={celebration} part="result-celebration" />}
        <ScoreCount language={language} score={score} total={total} part="result-score" />
        {/* A child who cannot read the numbers yet counts the stars. */}
        <p className="result-stars" data-turn-part="result-stars" role="img" aria-label={text.stars(score, total)}>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < score ? "star star-won" : "star"} style={motion({ "--star": index })} aria-hidden="true">
              ★
            </span>
          ))}
        </p>
        <h1 className="result-title" data-turn-part="result-title">{text.wellDone}</h1>
        {best !== undefined && <BestScore language={language} best={best} beaten={beaten} part="result-best" />}
        {levelSwitch}
        <nav className="result-actions" data-turn-part="result-actions">
          <Button className="play-again-button" onClick={onPlayAgain}>
            <RotateCcw size={28} aria-hidden="true" />
            {text.playAgain}
          </Button>
          <Button className="home-button" onClick={onHome}>
            <House size={28} aria-hidden="true" />
            {text.home}
          </Button>
        </nav>
      </div>
    </main>
  );
}
