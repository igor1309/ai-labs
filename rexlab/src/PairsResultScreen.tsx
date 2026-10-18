import { ArrowRight, ChartNoAxesColumnIncreasing, Footprints, Hand, House, RotateCcw, Sparkles, Star, Trophy, type LucideIcon } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Festivity } from "./Festivity.tsx";
import type { Language } from "./language/language.ts";
import { TEXTS, type Texts } from "./language/texts.ts";

export type PairsCelebration = keyof Texts["celebrations"];

const CELEBRATION_SYMBOLS: Record<PairsCelebration, LucideIcon> = { "first-best": Star, "new-best": Trophy };

export type FoundPal = { id: string; name: string; picture: string; newlyFound: boolean };

export type PairsResultScreenProps = {
  language: Language;
  // The board's dinosaurs, in the order dealt.
  pals: readonly FoundPal[];
  tries: number;
  // Every star earned, this board's among them.
  stars: number;
  // The level's fewest tries; undefined when stored progress cannot be
  // read, so there is no best to show.
  best: number | undefined;
  // The best this board beat, shown before the new one; undefined when
  // the board set no new best over an earlier one.
  beaten: number | undefined;
  celebration: PairsCelebration | null;
  // The level the board moved the child up to, with the shape of its
  // board, or null.
  levelUp: { level: number; rows: number; columns: number } | null;
  onPlayAgain: () => void;
  onHome: () => void;
};

// Custom properties the stylesheet staggers by.
const motion = (properties: Record<`--${string}`, number>) => properties as CSSProperties;

export function PairsResultScreen({ language, pals, tries, stars, best, beaten, celebration, levelUp, onPlayAgain, onHome }: PairsResultScreenProps) {
  const text = TEXTS[language];
  const CelebrationSymbol = celebration && CELEBRATION_SYMBOLS[celebration];
  // The dinosaurs whose picture cannot be loaded show a symbol instead.
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  return (
    <main className="result pairs-result" data-large={pals.length > 6 || undefined}>
      {(celebration || levelUp) && <Festivity />}
      <div className="stratum result-stratum" aria-hidden="true" />
      <ul className="pairs-found" aria-label={text.dinosaurs} data-count={pals.length} style={motion({ "--found-rows": Math.ceil(pals.length / 3) })}>
        {pals.map(({ id, name, picture, newlyFound }, index) => (
          <li key={id} className="pairs-found-card" style={motion({ "--card": index })}>
            <span className="pairs-found-art">
              {missing.has(id) ? (
                <Footprints className="pair-card-missing" size={48} aria-hidden="true" />
              ) : (
                <img
                  className="pairs-found-picture"
                  src={picture}
                  alt=""
                  draggable={false}
                  onError={() => setMissing((known) => new Set([...known, id]))}
                />
              )}
            </span>
            <span className="pairs-found-name">{name.toLocaleUpperCase(language)}</span>
            {newlyFound && (
              <span className="pairs-new-badge">
                <Sparkles size={20} aria-hidden="true" />
                {text.newlyFound}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="result-content">
        {(celebration || levelUp) && (
          <div className="pairs-badges">
            {celebration && CelebrationSymbol && (
              <p className="celebration" role="status" aria-label={text.celebrations[celebration].label}>
                <CelebrationSymbol size={30} aria-hidden="true" />
                <span className="celebration-text">{text.celebrations[celebration].text}</span>
              </p>
            )}
            {levelUp && (
              <p className="pairs-level-up" role="status" aria-label={text.newLevel(levelUp.level)}>
                <ChartNoAxesColumnIncreasing size={34} aria-hidden="true" />
                {levelUp.level}
                {/* The next level's board, a small card for each card. */}
                <span className="pairs-next-board" aria-hidden="true" style={motion({ "--columns": levelUp.columns })}>
                  {Array.from({ length: levelUp.rows * levelUp.columns }, (_, index) => (
                    <span key={index} className="pairs-next-card" />
                  ))}
                </span>
              </p>
            )}
          </div>
        )}
        <p className="pairs-result-tries" aria-label={text.tries}>
          <span className="pairs-result-tries-value">{tries}</span>
          <Hand className="pairs-result-hand" size={96} aria-hidden="true" />
        </p>
        {/* The board's star flies into the stars earned. */}
        <p className="pairs-result-stars" aria-label={text.starsEarned}>
          <span className="pairs-result-star" aria-hidden="true">
            ★
          </span>
          {stars}
        </p>
        <h1 className="result-title">{text.wellDone}</h1>
        {best !== undefined && (
          <p className="best-score" aria-label={text.bestScore}>
            <Trophy size={22} aria-hidden="true" />
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
