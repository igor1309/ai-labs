import { ArrowRight, House, RotateCcw, Star, Trophy, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";

export type Celebration = keyof Texts["celebrations"];

const CELEBRATION_SYMBOLS: Record<Celebration, LucideIcon> = { "first-best": Star, "new-best": Trophy };

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

// Custom properties the stylesheet animates by: the score the count-up
// ends on, and the place of a star in its stagger.
const motion = (properties: Record<`--${string}`, number>) => properties as CSSProperties;

export function ResultScreen({ language, score, total, best, beaten, celebration, hero, onPlayAgain, onHome }: ResultScreenProps) {
  const text = TEXTS[language];
  const CelebrationSymbol = celebration && CELEBRATION_SYMBOLS[celebration];
  return (
    <main className="result">
      {celebration && <Festivity />}
      <div className="stratum result-stratum" aria-hidden="true" />
      <img className="result-hero" src={hero} alt="" draggable={false} />
      <div className="result-content">
        {celebration && CelebrationSymbol && (
          <p className="celebration" role="status" aria-label={text.celebrations[celebration].label}>
            <CelebrationSymbol size={30} aria-hidden="true" />
            <span className="celebration-text">{text.celebrations[celebration].text}</span>
          </p>
        )}
        <p className="result-score" aria-label={text.score}>
          {/* The stylesheet counts the score up over its own digits, which
              keep its width and the score in the page's text. */}
          <span className="result-score-value" style={motion({ "--score": score })}>
            <span className="result-score-digits">{score}</span>
          </span>
          <span className="result-score-total">/{total}</span>
        </p>
        {/* A child who cannot read the numbers yet counts the stars. */}
        <p className="result-stars" role="img" aria-label={text.stars(score, total)}>
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index < score ? "star star-won" : "star"} style={motion({ "--star": index })} aria-hidden="true">
              ★
            </span>
          ))}
        </p>
        <h1 className="result-title">{text.wellDone}</h1>
        {best !== undefined && (
          <p className="best-score" aria-label={text.bestScore}>
            {text.best}
            {beaten !== undefined && (
              <>
                <span className="best-score-beaten">{beaten}</span>
                <ArrowRight size={20} aria-hidden="true" />
              </>
            )}
            <span className="best-score-value">{best}</span>
          </p>
        )}
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
