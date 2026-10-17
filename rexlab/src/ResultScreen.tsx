import { ArrowRight, House, RotateCcw, Star, Trophy, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";

export type Celebration = keyof Texts["celebrations"];

const CELEBRATION_SYMBOLS: Record<Celebration, LucideIcon> = { "first-best": Star, "new-best": Trophy };

// The confetti of a celebration, as the design scatters it over the
// screen: where each piece is, as a fraction of the screen, its size,
// turn and colour.
const CONFETTI: ReadonlyArray<{ left: number; top: number; square: boolean; turn: number; colour: "amber" | "terra" | "sky" }> = [
  { left: 0.104, top: 0.1, square: true, turn: -20, colour: "amber" },
  { left: 0.229, top: 0.189, square: false, turn: 25, colour: "terra" },
  { left: 0.431, top: 0.067, square: false, turn: -35, colour: "sky" },
  { left: 0.896, top: 0.133, square: true, turn: 15, colour: "amber" },
  { left: 0.944, top: 0.333, square: false, turn: -40, colour: "terra" },
  { left: 0.819, top: 0.044, square: false, turn: -10, colour: "sky" },
  { left: 0.063, top: 0.367, square: true, turn: 35, colour: "sky" },
  { left: 0.375, top: 0.278, square: false, turn: -60, colour: "amber" },
  { left: 0.924, top: 0.578, square: false, turn: -25, colour: "amber" },
  { left: 0.486, top: 0.911, square: true, turn: 20, colour: "terra" },
  { left: 0.056, top: 0.689, square: false, turn: -15, colour: "terra" },
  { left: 0.861, top: 0.889, square: false, turn: 40, colour: "sky" },
  { left: 0.326, top: 0.044, square: true, turn: -5, colour: "terra" },
  { left: 0.646, top: 0.027, square: false, turn: 30, colour: "amber" }
];

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
// ends on, and the place of a star or a piece of confetti in its stagger.
const motion = (properties: Record<`--${string}`, number>) => properties as CSSProperties;

export function ResultScreen({ language, score, total, best, beaten, celebration, hero, onPlayAgain, onHome }: ResultScreenProps) {
  const text = TEXTS[language];
  const CelebrationSymbol = celebration && CELEBRATION_SYMBOLS[celebration];
  return (
    <main className="result">
      {celebration && (
        <div className="festivity" aria-hidden="true">
          <span className="glow glow-outer" />
          <span className="glow glow-mid" />
          <span className="glow glow-inner" />
          {CONFETTI.map(({ left, top, square, turn, colour }, index) => (
            <span
              key={index}
              className={`confetti confetti-${colour}${square ? " confetti-square" : ""}`}
              style={{ left: `${left * 100}%`, top: `${top * 100}%`, transform: `rotate(${turn}deg)`, ...motion({ "--piece": index }) }}
            />
          ))}
        </div>
      )}
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
