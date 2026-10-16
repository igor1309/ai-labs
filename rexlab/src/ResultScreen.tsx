import type { Language } from "./language/language.ts";
import { TEXTS } from "./language/texts.ts";
import type { Celebration } from "./quiz/progress.ts";

const CELEBRATION_SYMBOLS: Record<Celebration, string> = { "first-best": "⭐", "new-best": "🏆" };

export type ResultScreenProps = {
  language: Language;
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to show.
  best: number | undefined;
  celebration: Celebration | null;
  onPlayAgain: () => void;
  onHome: () => void;
};

export function ResultScreen({ language, score, total, best, celebration, onPlayAgain, onHome }: ResultScreenProps) {
  const text = TEXTS[language];
  return (
    <main className="result">
      {celebration && (
        <div className="celebration" role="status" aria-label={text.celebrations[celebration].label}>
          <span className="celebration-picture" aria-hidden="true">
            🎉{CELEBRATION_SYMBOLS[celebration]}🎉
          </span>
          <span className="celebration-text">{text.celebrations[celebration].text}</span>
        </div>
      )}
      {/* A child who cannot read the numbers yet counts the stars. */}
      <p className="result-stars" role="img" aria-label={text.stars(score, total)}>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index < score ? "star star-won" : "star"} aria-hidden="true">
            ★
          </span>
        ))}
      </p>
      <p className="result-score" aria-label={text.score}>
        {score}/{total}
      </p>
      {best !== undefined && (
        <p className="best-score" aria-label={text.bestScore}>
          <span aria-hidden="true">🏆</span> {text.best} <span className="best-score-value">{best}</span>
        </p>
      )}
      <nav className="result-actions">
        <button type="button" className="play-again-button" onClick={onPlayAgain}>
          <span aria-hidden="true">🔄</span> {text.playAgain}
        </button>
        <button type="button" className="home-button" onClick={onHome}>
          <span aria-hidden="true">🏠</span> {text.home}
        </button>
      </nav>
    </main>
  );
}
