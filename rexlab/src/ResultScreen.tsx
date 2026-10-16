import type { Celebration } from "./quiz/progress.ts";

const CELEBRATIONS: Record<Celebration, { label: string; symbol: string; text: string }> = {
  "first-best": { label: "First best score", symbol: "⭐", text: "FIRST BEST!" },
  "new-best": { label: "New best score", symbol: "🏆", text: "NEW BEST!" }
};

export type ResultScreenProps = {
  score: number;
  total: number;
  // Undefined when stored progress cannot be read: there is no best to show.
  best: number | undefined;
  celebration: Celebration | null;
  onPlayAgain: () => void;
  onHome: () => void;
};

export function ResultScreen({ score, total, best, celebration, onPlayAgain, onHome }: ResultScreenProps) {
  const party = celebration && CELEBRATIONS[celebration];
  return (
    <main className="result">
      {party && (
        <div className="celebration" role="status" aria-label={party.label}>
          <span className="celebration-picture" aria-hidden="true">
            🎉{party.symbol}🎉
          </span>
          <span className="celebration-text">{party.text}</span>
        </div>
      )}
      {/* A child who cannot read the numbers yet counts the stars. */}
      <p className="result-stars" role="img" aria-label={`${score} of ${total} stars`}>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index < score ? "star star-won" : "star"} aria-hidden="true">
            ★
          </span>
        ))}
      </p>
      <p className="result-score" aria-label="Score">
        {score}/{total}
      </p>
      {best !== undefined && (
        <p className="best-score" aria-label="Best score">
          <span aria-hidden="true">🏆</span> Best <span className="best-score-value">{best}</span>
        </p>
      )}
      <nav className="result-actions">
        <button type="button" className="play-again-button" onClick={onPlayAgain}>
          <span aria-hidden="true">🔄</span> Play again
        </button>
        <button type="button" className="home-button" onClick={onHome}>
          <span aria-hidden="true">🏠</span> Home
        </button>
      </nav>
    </main>
  );
}
