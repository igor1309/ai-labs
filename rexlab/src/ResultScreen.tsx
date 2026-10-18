import { House, RotateCcw } from "lucide-react";
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
  onPlayAgain: () => void;
  onHome: () => void;
};

export function ResultScreen({ language, score, total, best, beaten, celebration, hero, onPlayAgain, onHome }: ResultScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="result">
      {celebration && <Festivity />}
      <div className="stratum result-stratum" aria-hidden="true" />
      <Picture className="result-hero" src={hero} alt="" width={800} height={600} />
      <div className="result-content">
        {celebration && <CelebrationChip language={language} celebration={celebration} />}
        <ScoreCount language={language} score={score} total={total} />
        {/* A child who cannot read the numbers yet counts the stars. */}
        <p className="result-stars" role="img" aria-label={text.stars(score, total)}>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < score ? "star star-won" : "star"} style={motion({ "--star": index })} aria-hidden="true">
              ★
            </span>
          ))}
        </p>
        <h1 className="result-title">{text.wellDone}</h1>
        {best !== undefined && <BestScore language={language} best={best} beaten={beaten} />}
        <nav className="result-actions">
          <button type="button" className="play-again-button" onClick={onPlayAgain}>
            <RotateCcw size={28} aria-hidden="true" />
            {text.playAgain}
          </button>
          <button type="button" className="home-button" onClick={onHome}>
            <House size={28} aria-hidden="true" />
            {text.home}
          </button>
        </nav>
      </div>
    </main>
  );
}
