import { ArrowRight, Star, Trophy, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";

// The parts every game's result shows alike: the celebration of a best
// score, the score counting up and the best score. Each result screen
// lays them out with its own reward and texts.

export type Celebration = keyof Texts["celebrations"];

const CELEBRATION_SYMBOLS: Record<Celebration, LucideIcon> = { "first-best": Star, "new-best": Trophy };

// Custom properties the stylesheet animates by, such as the score the
// count-up ends on, or the place of a reward in its stagger.
export const motion = (properties: Record<`--${string}`, number>) => properties as CSSProperties;

export function CelebrationChip({ language, celebration }: { language: Language; celebration: Celebration }) {
  const text = TEXTS[language].celebrations[celebration];
  const CelebrationSymbol = CELEBRATION_SYMBOLS[celebration];
  return (
    <p className="celebration" role="status" aria-label={text.label}>
      <CelebrationSymbol size={30} aria-hidden="true" />
      <span className="celebration-text">{text.text}</span>
    </p>
  );
}

export function ScoreCount({ language, score, total }: { language: Language; score: number; total: number }) {
  return (
    <p className="result-score" aria-label={TEXTS[language].score}>
      {/* The stylesheet counts the score up over its own digits, which
          keep its width and the score in the page's text. */}
      <span className="result-score-value" style={motion({ "--score": score })}>
        <span className="result-score-digits">{score}</span>
      </span>
      <span className="result-score-total">/{total}</span>
    </p>
  );
}

// The best score, after the best it beat when there is one; `total`, when
// given, is shown after it.
export function BestScore({ language, best, beaten, total }: { language: Language; best: number; beaten: number | undefined; total?: number }) {
  const text = TEXTS[language];
  return (
    <p className="best-score" aria-label={text.bestScore}>
      {text.best}
      {beaten !== undefined && (
        <>
          <span className="best-score-beaten">{beaten}</span>
          <ArrowRight size={20} aria-hidden="true" />
        </>
      )}
      <span className="best-score-value">
        {best}
        {total !== undefined && `/${total}`}
      </span>
    </p>
  );
}
